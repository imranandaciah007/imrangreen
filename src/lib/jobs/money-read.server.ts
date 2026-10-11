/**
 * Finds the payments in a money document (receipt, invoice, transfer screenshot,
 * bank statement). Used by the background worker, so amounts are found while
 * the app is closed; the app only collects the results.
 */
import { runJsonModel } from "@/lib/ai-json.server";
import { fetchReadableFile } from "@/lib/drive-core.server";

const MAX_BYTES = 12 * 1024 * 1024;

async function fetchReadable(fileId: string, fileName: string, mimeType: string) {
  try {
    const readable = await fetchReadableFile({ fileId, fileName, mimeType });
    if (!readable || readable.bytes.byteLength > MAX_BYTES) return null;
    let binary = "";
    for (let i = 0; i < readable.bytes.length; i += 8192) {
      binary += String.fromCharCode(...readable.bytes.subarray(i, i + 8192));
    }
    return { base64: btoa(binary), mimeType: readable.mimeType };
  } catch {
    return null;
  }
}

/** Whether a document is worth looking in for payments. */
export function looksLikeMoneyDocument(doc: {
  fileName: string;
  title?: string | null | undefined;
  sourceType?: string | null | undefined;
  categories?: string[] | null | undefined;
}): boolean {
  if (/\.(mp4|mov|m4v|avi|mkv|webm|3gp|mp3|m4a|wav|aac|ogg|opus|amr|zip|rar|7z)$/i.test(doc.fileName)) return false;
  if (doc.sourceType === "Financial / Bank" || doc.sourceType === "Receipt / Purchase") return true;
  if ((doc.categories ?? []).includes("Financial Hardship")) return true;
  return /(receipt|invoice|statement|transfer|remit|wise|western union|paypal|payment|bank|bill)/i.test(
    `${doc.title ?? ""} ${doc.fileName}`,
  );
}

/** Categories the money reader may use; "Not hardship" marks ordinary spending to leave out. */
const MONEY_CATEGORIES = [
  "Money sent by Imran to Aciah",
  "Jibril — formula/milk",
  "Jibril — nappies/wipes",
  "Jibril — baby food",
  "Jibril — clothing",
  "Jibril — medicines/medical",
  "Jibril — equipment/baby supplies",
  "Jibril — childcare",
  "Jibril — transport",
  "Aciah — medical",
  "Aciah — medication",
  "Aciah — pregnancy related",
  "Aciah — appointment transport",
  "Housing / household contribution",
  "Relocation / re-establishment in U.S.",
  "Immigration fees",
  "Separation-related travel",
  "Communication / postage / document costs",
  "Other genuine separation-related expense",
  "Not hardship",
] as const;

const MONEY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentKind", "transactions"],
  properties: {
    documentKind: {
      type: "string",
      description: "receipt, invoice, transfer, bank statement, or other (not a money document)",
    },
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "amount", "currency", "payee", "description", "category", "payer", "beneficiary"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD as printed" },
          amount: { type: "number", description: "Positive amount paid out, exactly as printed" },
          currency: { type: "string", description: "GBP or USD" },
          payee: { type: "string", description: "Who was paid (shop, provider or person)" },
          description: { type: "string", description: "What it was for, in a few words" },
          category: { type: "string", description: "One of the listed categories" },
          payer: { type: "string", description: "Imran or Aciah, empty if not shown" },
          beneficiary: { type: "string", description: "Aciah, Jibril, Family, Immigration or Other" },
        },
      },
    },
  },
} as const;

export interface FoundPayment {
  date: string;
  amount: number;
  currency: "GBP" | "USD";
  payee: string;
  description: string;
  category: string;
  payer: string;
  beneficiary: string;
  /** False when the two reads put it in different categories. */
  categoryAgreed: boolean;
}

export interface MoneyRead {
  documentKind: string;
  payments: FoundPayment[];
  /** False when the file could not be opened at all. */
  contentRead: boolean;
}

function moneyPass(prompt: string, fileName: string, mimeType: string, base64: string) {
  return runJsonModel({
    prompt,
    schema: MONEY_SCHEMA,
    name: "money_read",
    file: { fileName, mimeType, base64 },
  }).then((parsed) => {
    const list = Array.isArray(parsed["transactions"]) ? (parsed["transactions"] as Record<string, unknown>[]) : [];
    return {
      documentKind: String(parsed["documentKind"] ?? "").trim().toLowerCase(),
      transactions: list
        .map((t) => ({
          date: String(t["date"] ?? "").slice(0, 10),
          amount: Math.abs(Number(t["amount"]) || 0),
          currency: String(t["currency"] ?? "").trim().toUpperCase(),
          payee: String(t["payee"] ?? "").trim(),
          description: String(t["description"] ?? "").trim(),
          category: String(t["category"] ?? "").trim(),
          payer: String(t["payer"] ?? "").trim(),
          beneficiary: String(t["beneficiary"] ?? "").trim(),
        }))
        .filter(
          (t) =>
            /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
            t.amount > 0 &&
            (t.currency === "GBP" || t.currency === "USD"),
        ),
    };
  });
}

/**
 * Finds the hardship-related payments in a receipt, invoice, transfer screenshot
 * or bank statement. The document is read twice, independently, and a payment is
 * returned only when both reads agree on its date, amount and currency. Ordinary
 * spending is left out. Everything returned still needs the user's confirmation.
 */
export async function readPayments(data: {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  title: string;
  separationStartDate: string;
}): Promise<MoneyRead> {
    const file = await fetchReadable(data.driveFileId, data.fileName, data.mimeType);
    if (!file) return { documentKind: "", payments: [], contentRead: false };

    const prompt = [
      "You are listing money paid out, for a US I-601 extreme-hardship case.",
      "Imran lives in the UK and supports his wife Aciah (US citizen) and their baby son Jibril, who live in the US.",
      data.separationStartDate ? `They have been separated since ${data.separationStartDate}.` : "",
      `File name: ${data.fileName}`,
      data.title ? `Document title: ${data.title}` : "",
      "List each payment in this document that is a cost of the family's separation or hardship.",
      "Rules:",
      "- Only money paid out. Never list income, salary, refunds or money received by Imran.",
      "- A bank statement: list only transfers to Aciah and payments that clearly fit a category below. Leave out ordinary personal spending entirely.",
      "- A receipt or invoice: one entry with the total of the relevant lines; use 'Not hardship' if nothing on it is relevant.",
      "- A transfer screenshot (Wise, Western Union, PayPal, bank app): one entry for the amount sent.",
      "- Copy amounts and dates exactly as printed. Never estimate, convert or invent. Currency is GBP or USD.",
      "- If this is not a money document, return documentKind 'other' and no transactions.",
      `Categories: ${MONEY_CATEGORIES.join(" | ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const [a, b] = await Promise.all([
      moneyPass(`${prompt}\nRead 1: read carefully.`, data.fileName, file.mimeType, file.base64),
      moneyPass(`${prompt}\nRead 2: check independently; prefer leaving a payment out over guessing.`, data.fileName, file.mimeType, file.base64),
    ]);

    // Keep a payment only when both reads found it with the same date, amount and currency.
    const unused = [...b.transactions];
    const payments: FoundPayment[] = [];
    for (const t of a.transactions) {
      const i = unused.findIndex(
        (u) => u.date === t.date && u.currency === t.currency && Math.abs(u.amount - t.amount) < 0.005,
      );
      if (i < 0) continue;
      const twin = unused.splice(i, 1)[0]!;
      const valid = (c: string) => (MONEY_CATEGORIES as readonly string[]).includes(c);
      const category = valid(t.category) ? t.category : valid(twin.category) ? twin.category : "Other genuine separation-related expense";
      if (category === "Not hardship" && twin.category === "Not hardship") continue;
      payments.push({
        date: t.date,
        amount: Math.round(t.amount * 100) / 100,
        currency: t.currency as "GBP" | "USD",
        payee: t.payee || twin.payee,
        description: t.description || twin.description,
        category: category === "Not hardship" ? (valid(twin.category) ? twin.category : category) : category,
        payer: t.payer || twin.payer,
        beneficiary: t.beneficiary || twin.beneficiary,
        categoryAgreed: t.category === twin.category,
      });
    }
    return { documentKind: a.documentKind || b.documentKind, payments: payments.slice(0, 60), contentRead: true };
  }
