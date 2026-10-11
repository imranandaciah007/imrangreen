import { createServerFn } from "@tanstack/react-start";
import { jsonModelName, runJsonModel } from "./ai-json.server";
import { verifyWithOpenAi, type VerificationReport } from "./ai-verify.server";

const MAX_BYTES = 12 * 1024 * 1024;

export interface ExtractionPass {
  title: string;
  documentDate: string;
  people: string[];
  categories: string[];
  sourceType: string;
  pageCount: number;
  summary: string;
  aciahImpact: string;
  language: string;
}

export interface ExtractionResult {
  /** Fields both passes agreed on — safe to prefill. */
  agreed: Partial<ExtractionPass>;
  /** Fields the two passes disagreed on, with both candidate values. */
  uncertain: { field: string; options: string[] }[];
  summary: string;
  /** Factual sentence on the effect on Aciah, when the document shows one. */
  aciahImpact: string;
  language: string;
  passes: ExtractionPass[];
  ranAt: string;
  contentRead: boolean;
  /** Independent OpenAI check of what Gemini extracted. */
  verification: VerificationReport;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "documentDate",
    "people",
    "categories",
    "sourceType",
    "pageCount",
    "summary",
    "aciahImpact",
    "language",
  ],
  properties: {
    title: { type: "string", description: "Short human-readable document title" },
    documentDate: {
      type: "string",
      description: "Date the document was issued, YYYY-MM-DD, or empty string if unknown",
    },
    people: {
      type: "array",
      items: { type: "string" },
      description: "Which of Imran, Aciah, Jibril, Other family, Third party the document concerns",
    },
    categories: {
      type: "array",
      items: { type: "string" },
      description: "Hardship categories, chosen only from the provided list",
    },
    sourceType: { type: "string", description: "One of the provided source types" },
    pageCount: { type: "number", description: "Number of pages, 1 if unknown" },
    summary: { type: "string", description: "Two sentences on why this may matter for the case" },
    aciahImpact: {
      type: "string",
      description:
        "One factual sentence on how this affects Aciah, or empty string if the document does not show that",
    },
    language: { type: "string", description: "Main language of the document" },
  },
} as const;

function normList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
}

function samePass(a: string[], b: string[]) {
  const sa = [...new Set(a.map((x) => x.toLowerCase()))].sort().join("|");
  const sb = [...new Set(b.map((x) => x.toLowerCase()))].sort().join("|");
  return sa === sb;
}

/**
 * The Drive original as base64 in a form the reader understands: PDFs and photos
 * as they are, Word / Google Docs / sheets / emails as their printed PDF.
 */
async function fetchDriveFile(fileId: string, fileName: string, mimeType: string) {
  if (!process.env["LOVABLE_API_KEY"] || !process.env["GOOGLE_DRIVE_API_KEY"]) return null;
  if (!/^[A-Za-z0-9_-]{6,200}$/.test(fileId)) return null;
  try {
    const { fetchReadableFile } = await import("./drive-core.server");
    const readable = await fetchReadableFile({ fileId, fileName, mimeType });
    if (!readable || readable.bytes.byteLength > MAX_BYTES) return null;
    const bytes = readable.bytes;
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return { base64: btoa(binary), mimeType: readable.mimeType };
  } catch {
    return null;
  }
}

async function runPass(input: {
  prompt: string;
  fileName: string;
  mimeType: string;
  base64: string | null;
}) {
  const parsed = await runJsonModel({
    prompt: input.prompt,
    schema: SCHEMA,
    name: "evidence_extraction",
    file: { fileName: input.fileName, mimeType: input.mimeType, base64: input.base64 },
    // Anything the first read leaves blank is retried once with a stronger Gemini model.
    requiredFields: ["title", "documentDate", "people", "categories", "sourceType", "summary"],
    allowGapFill: true,
  });
  return {
    title: String(parsed["title"] ?? "").trim(),
    documentDate: String(parsed["documentDate"] ?? "").slice(0, 10),
    people: normList(parsed["people"]),
    categories: normList(parsed["categories"]),
    sourceType: String(parsed["sourceType"] ?? "").trim(),
    pageCount: Math.max(1, Number(parsed["pageCount"]) || 1),
    summary: String(parsed["summary"] ?? "").trim(),
    aciahImpact: String(parsed["aciahImpact"] ?? "").trim(),
    language: String(parsed["language"] ?? "").trim(),
  } satisfies ExtractionPass;
}

/**
 * Two-pass AI read of one evidence document. Fields both passes agree on are returned as
 * `agreed` (safe to prefill); anything they disagree on is returned in `uncertain` so the
 * user confirms it. The original file is never modified.
 */
export const extractDocument = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      driveFileId: d["driveFileId"] ? String(d["driveFileId"]) : "",
      fileName: String(d["fileName"] ?? "document"),
      mimeType: String(d["mimeType"] ?? "application/pdf"),
      allowedCategories: normList(d["allowedCategories"]),
      allowedPeople: normList(d["allowedPeople"]),
      allowedSourceTypes: normList(d["allowedSourceTypes"]),
      knownTitle: String(d["knownTitle"] ?? ""),
    };
  })
  .handler(async ({ data }): Promise<ExtractionResult> => {
    const file = data.driveFileId
      ? await fetchDriveFile(data.driveFileId, data.fileName, data.mimeType)
      : null;
    return twoPass({ ...data, base64: file?.base64 ?? null, mimeType: file?.mimeType ?? data.mimeType });
  });

/**
 * Same two-pass read, for a file the user has just picked on the device (before it reaches
 * Drive). The bytes are sent as base64 and never stored server-side.
 */
export const extractUploadedFile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      base64: String(d["base64"] ?? ""),
      fileName: String(d["fileName"] ?? "document"),
      mimeType: String(d["mimeType"] ?? "application/pdf"),
      allowedCategories: normList(d["allowedCategories"]),
      allowedPeople: normList(d["allowedPeople"]),
      allowedSourceTypes: normList(d["allowedSourceTypes"]),
      knownTitle: String(d["knownTitle"] ?? ""),
    };
  })
  .handler(async ({ data }): Promise<ExtractionResult> =>
    twoPass({ ...data, base64: data.base64 || null }),
  );

async function twoPass(data: {
  base64: string | null;
  fileName: string;
  mimeType: string;
  allowedCategories: string[];
  allowedPeople: string[];
  allowedSourceTypes: string[];
  knownTitle: string;
}): Promise<ExtractionResult> {
  const base64 = data.base64;

  const basePrompt = [
    "You are helping index evidence for a US I-601 extreme-hardship waiver case.",
    "The couple: Imran (UK, applicant) and Aciah (US citizen spouse, the qualifying relative). Their son is Jibril.",
    `File name: ${data.fileName}`,
    data.knownTitle ? `Existing label: ${data.knownTitle}` : "",
    base64
      ? "Read the attached document content and extract the facts."
      : "The file content is not available, so infer only from the file name and say so in the summary.",
    `Choose categories only from: ${data.allowedCategories.join(" | ")}`,
    `Choose people only from: ${data.allowedPeople.join(" | ")}`,
    `Choose sourceType only from: ${data.allowedSourceTypes.join(" | ")}`,
    "Never invent names, dates or facts. If something is not stated, leave it empty.",
  ]
    .filter(Boolean)
    .join("\n");

  // allSettled, never Promise.all: if one pass fails the other's rejection would become an
  // unhandled rejection and take the server down (blank screen) instead of surfacing a message.
  const settled = await Promise.allSettled([
    runPass({
      prompt: `${basePrompt}\nPass 1: extract carefully.`,
      fileName: data.fileName,
      mimeType: data.mimeType,
      base64,
    }),
    runPass({
      prompt: `${basePrompt}\nPass 2: independently verify. Be conservative: prefer empty values over guesses.`,
      fileName: data.fileName,
      mimeType: data.mimeType,
      base64,
    }),
  ]);
  const ok = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (ok.length === 0) {
    const first = settled.find((s) => s.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    const reason = first?.reason;
    throw new Error(
      reason instanceof Error ? reason.message : "This document could not be read just now.",
    );
  }
  // One good read is still a read: use it for both sides so every field it found is kept,
  // and the caller flags them for confirmation as usual.
  const a = ok[0]!;
  const b = ok[1] ?? ok[0]!;


  const agreed: Partial<ExtractionPass> = {};
  const uncertain: { field: string; options: string[] }[] = [];

  const pushScalar = (field: keyof ExtractionPass, x: string, y: string) => {
    if (x && y && x.toLowerCase() === y.toLowerCase()) {
      (agreed as Record<string, unknown>)[field] = x;
    } else if (x || y) {
      // Still prefill the best available reading so no field is left empty; it is
      // flagged as uncertain so it can be confirmed or corrected.
      (agreed as Record<string, unknown>)[field] = x || y;
      uncertain.push({ field, options: [x, y].filter(Boolean) as string[] });
    }
  };

  pushScalar("title", a.title, b.title);
  pushScalar("documentDate", a.documentDate, b.documentDate);
  pushScalar("sourceType", a.sourceType, b.sourceType);

  if (samePass(a.people, b.people) && a.people.length) agreed.people = a.people;
  else if (a.people.length || b.people.length) {
    agreed.people = a.people.length ? a.people : b.people;
    uncertain.push({
      field: "people",
      options: [a.people.join(", "), b.people.join(", ")].filter(Boolean),
    });
  }

  if (samePass(a.categories, b.categories) && a.categories.length) agreed.categories = a.categories;
  else if (a.categories.length || b.categories.length) {
    agreed.categories = a.categories.length ? a.categories : b.categories;
    uncertain.push({
      field: "categories",
      options: [a.categories.join(", "), b.categories.join(", ")].filter(Boolean),
    });
  }

  if (a.pageCount === b.pageCount) agreed.pageCount = a.pageCount;
  else uncertain.push({ field: "pageCount", options: [String(a.pageCount), String(b.pageCount)] });

  const ranAt = new Date().toISOString();
  const summary = a.summary || b.summary;

  // OpenAI is a backup, not a routine second pass: it only runs when Gemini
  // could not finish the job (file unreadable, or the two Gemini readings
  // disagreed on something). A clean Gemini reading is trusted as-is.
  const claims = Object.entries(agreed)
    .map(([field, value]) => ({
      field,
      value: Array.isArray(value) ? value.join(", ") : String(value ?? ""),
    }))
    .filter((c) => c.value.trim() !== "");
  const geminiFailed = !base64 || uncertain.length > 0;
  const verification = geminiFailed
    ? await verifyWithOpenAi({
        claims,
        summary,
        fileName: data.fileName,
        mimeType: data.mimeType,
        base64,
        analysisProvider: "gemini",
        analysisModel: jsonModelName(),
        analysedAt: ranAt,
        purpose: "evidence_extraction",
      })
    : {
        state: "primary_only" as const,
        fields: [],
        notes: [],
        analysisProvider: "gemini",
        analysisModel: jsonModelName(),
        analysedAt: ranAt,
        verifierProvider: null,
        verifierModel: null,
        verifiedAt: null,
        error: null,
      };
  for (const field of verification.fields) {
    if (field.verdict !== "disagrees") continue;
    const existing = uncertain.find((u) => u.field === field.field);
    const option = field.documentShows.trim();
    if (existing) {
      if (option && !existing.options.includes(option)) existing.options.push(option);
    } else {
      const current = claims.find((c) => c.field === field.field)?.value ?? "";
      uncertain.push({
        field: field.field,
        options: [current, option].filter(Boolean),
      });
    }
  }

  return {
    agreed,
    uncertain,
    summary,
    aciahImpact: a.aciahImpact || b.aciahImpact,
    language: a.language || b.language,
    passes: [a, b],
    ranAt,
    contentRead: Boolean(base64),
    verification,
  };
}

/* ------------------------------------------------------------------ *
 * Plain-text helper calls (event structuring, Ask My Evidence)
 * ------------------------------------------------------------------ */

async function runJson(prompt: string, schema: unknown, name: string) {
  return runJsonModel({ prompt, schema, name });
}

const EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "date",
    "categories",
    "people",
    "description",
    "effectOnAciah",
    "effectOnFamily",
    "followUp",
    "amount",
    "currency",
    "missing",
  ],
  properties: {
    title: { type: "string" },
    date: { type: "string", description: "YYYY-MM-DD, empty string if not stated" },
    categories: { type: "array", items: { type: "string" } },
    people: { type: "array", items: { type: "string" } },
    description: { type: "string", description: "Factual restatement only" },
    effectOnAciah: { type: "string", description: "Only if stated or clearly implied, else empty" },
    effectOnFamily: { type: "string" },
    followUp: { type: "string", description: "Suggested follow-up action, else empty" },
    amount: { type: "number", description: "0 if no money mentioned" },
    currency: { type: "string", description: "GBP, USD or empty" },
    missing: {
      type: "array",
      items: { type: "string" },
      description: "Field names that are not stated and should be asked for",
    },
  },
} as const;

export interface StructuredEvent {
  title: string;
  date: string;
  categories: string[];
  people: string[];
  description: string;
  effectOnAciah: string;
  effectOnFamily: string;
  followUp: string;
  amount: number;
  currency: string;
  missing: string[];
}

/** Turn a typed or dictated sentence into a structured hardship event. Never invents facts. */
export const structureEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      text: String(d["text"] ?? ""),
      today: String(d["today"] ?? new Date().toISOString().slice(0, 10)),
      allowedCategories: normList(d["allowedCategories"]),
      allowedPeople: normList(d["allowedPeople"]),
    };
  })
  .handler(async ({ data }): Promise<StructuredEvent> => {
    const parsed = await runJson(
      [
        "Turn this note into a structured hardship event for a US I-601 extreme-hardship waiver case.",
        "Aciah is the US citizen spouse (qualifying relative), Imran is the applicant, Jibril is their son.",
        `Today is ${data.today}. Family separation began 2026-08-18.`,
        `Choose categories only from: ${data.allowedCategories.join(" | ")}`,
        `Choose people only from: ${data.allowedPeople.join(" | ")}`,
        "Do not invent dates, amounts, diagnoses or effects. Leave anything not stated empty and list its field name in `missing`.",
        `Note: ${data.text}`,
      ].join("\n"),
      EVENT_SCHEMA,
      "hardship_event",
    );
    return {
      title: String(parsed["title"] ?? "").trim(),
      date: String(parsed["date"] ?? "").slice(0, 10),
      categories: normList(parsed["categories"]),
      people: normList(parsed["people"]),
      description: String(parsed["description"] ?? "").trim(),
      effectOnAciah: String(parsed["effectOnAciah"] ?? "").trim(),
      effectOnFamily: String(parsed["effectOnFamily"] ?? "").trim(),
      followUp: String(parsed["followUp"] ?? "").trim(),
      amount: Number(parsed["amount"]) || 0,
      currency: String(parsed["currency"] ?? "").trim(),
      missing: normList(parsed["missing"]),
    };
  });

const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "recordIds", "gaps"],
  properties: {
    answer: { type: "string", description: "Plain factual answer built only from the records" },
    recordIds: {
      type: "array",
      items: { type: "string" },
      description: "Ids of the records that support the answer",
    },
    gaps: {
      type: "array",
      items: { type: "string" },
      description: "What is missing from the stored records to answer fully",
    },
  },
} as const;

export interface AskAnswer {
  answer: string;
  recordIds: string[];
  gaps: string[];
}

/** Answers a question using only the case records passed in from the app. */
export const askEvidence = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      question: String(d["question"] ?? ""),
      records: String(d["records"] ?? ""),
    };
  })
  .handler(async ({ data }): Promise<AskAnswer> => {
    if (!data.records.trim()) {
      return { answer: "There are no records stored in the case yet.", recordIds: [], gaps: [] };
    }
    const parsed = await runJson(
      [
        "Answer the question using ONLY the case records listed below. This is a US I-601 extreme-hardship waiver case for Imran and Aciah (US citizen spouse); Jibril is their son. Separation began 2026-08-18.",
        "Never add facts, dates, diagnoses or amounts that are not in the records. If the records do not answer the question, say so plainly and list what is missing in `gaps`.",
        "Cite the record ids you used in `recordIds`.",
        `Question: ${data.question}`,
        "Records:",
        data.records.slice(0, 120_000),
      ].join("\n"),
      ASK_SCHEMA,
      "ask_evidence",
    );
    return {
      answer: String(parsed["answer"] ?? "").trim(),
      recordIds: normList(parsed["recordIds"]),
      gaps: normList(parsed["gaps"]),
    };
  });

/* ------------------------------------------------------------------ *
 * Receipts, statements and transfers (Prompt 3)
 * ------------------------------------------------------------------ */

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant",
    "date",
    "currency",
    "total",
    "tax",
    "lineItems",
    "isTransfer",
    "sender",
    "recipient",
    "reference",
    "summary",
  ],
  properties: {
    merchant: { type: "string", description: "Shop, provider or bank shown on the document" },
    date: { type: "string", description: "YYYY-MM-DD, empty if not stated" },
    currency: { type: "string", description: "GBP or USD, empty if unclear" },
    total: { type: "number", description: "Document total, 0 if not stated" },
    tax: { type: "number", description: "Tax/VAT amount, 0 if not stated" },
    lineItems: {
      type: "array",
      description: "Each purchased line. Mark relevant=false for ordinary personal items.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amount", "category", "beneficiary", "relevant", "certain"],
        properties: {
          label: { type: "string" },
          amount: { type: "number" },
          category: { type: "string", description: "One of the provided expense categories" },
          beneficiary: {
            type: "string",
            description: "Aciah, Jibril, Family, Immigration or Other",
          },
          relevant: {
            type: "boolean",
            description: "True only for separation/family/child related spending",
          },
          certain: { type: "boolean", description: "False when the classification is a guess" },
        },
      },
    },
    isTransfer: { type: "boolean", description: "True for a bank transfer/remittance record" },
    sender: { type: "string" },
    recipient: { type: "string" },
    reference: { type: "string" },
    summary: { type: "string", description: "One factual sentence" },
  },
} as const;

export interface ReceiptLine {
  label: string;
  amount: number;
  category: string;
  beneficiary: string;
  relevant: boolean;
  certain: boolean;
}

export interface ReceiptRead {
  merchant: string;
  date: string;
  currency: string;
  total: number;
  tax: number;
  lineItems: ReceiptLine[];
  isTransfer: boolean;
  sender: string;
  recipient: string;
  reference: string;
  summary: string;
  uncertain: { field: string; options: string[] }[];
  ranAt: string;
  contentRead: boolean;
  /** Both raw scans, kept as JSON for auditability. */
  passes: string[];
}

async function receiptPass(input: {
  prompt: string;
  fileName: string;
  mimeType: string;
  base64: string | null;
}) {
  const parsed = await runJsonModel({
    prompt: input.prompt,
    schema: RECEIPT_SCHEMA,
    name: "receipt_read",
    file: { fileName: input.fileName, mimeType: input.mimeType, base64: input.base64 },
  });
  const lines = Array.isArray(parsed["lineItems"]) ? parsed["lineItems"] : [];
  return {
    merchant: String(parsed["merchant"] ?? "").trim(),
    date: String(parsed["date"] ?? "").slice(0, 10),
    currency: String(parsed["currency"] ?? "")
      .trim()
      .toUpperCase(),
    total: Number(parsed["total"]) || 0,
    tax: Number(parsed["tax"]) || 0,
    lineItems: (lines as Record<string, unknown>[]).map((l) => ({
      label: String(l["label"] ?? "").trim(),
      amount: Number(l["amount"]) || 0,
      category: String(l["category"] ?? "").trim(),
      beneficiary: String(l["beneficiary"] ?? "").trim(),
      relevant: Boolean(l["relevant"]),
      certain: Boolean(l["certain"]),
    })),
    isTransfer: Boolean(parsed["isTransfer"]),
    sender: String(parsed["sender"] ?? "").trim(),
    recipient: String(parsed["recipient"] ?? "").trim(),
    reference: String(parsed["reference"] ?? "").trim(),
    summary: String(parsed["summary"] ?? "").trim(),
  } satisfies Omit<ReceiptRead, "uncertain" | "ranAt" | "contentRead" | "passes">;
}

/**
 * Double-scan read of a receipt, bank statement or transfer screenshot. Amounts and merchant
 * are only returned when both scans agree; anything else is handed back for confirmation.
 */
export const extractReceipt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      base64: String(d["base64"] ?? ""),
      driveFileId: d["driveFileId"] ? String(d["driveFileId"]) : "",
      fileName: String(d["fileName"] ?? "receipt"),
      mimeType: String(d["mimeType"] ?? "application/pdf"),
      allowedCategories: normList(d["allowedCategories"]),
    };
  })
  .handler(async ({ data }): Promise<ReceiptRead> => {
    const file =
      !data.base64 && data.driveFileId
        ? await fetchDriveFile(data.driveFileId, data.fileName, data.mimeType)
        : null;
    const base64 = data.base64 || file?.base64 || null;
    if (file) data.mimeType = file.mimeType;
    const prompt = [
      "Read this receipt, invoice, bank statement or transfer screenshot for a US I-601 hardship case.",
      "Imran (UK) supports Aciah (US citizen spouse) and their son Jibril while the family is separated since 2026-08-18.",
      `File name: ${data.fileName}`,
      base64 ? "Read the attached document." : "No file content is available; report empty values.",
      `Expense categories to choose from: ${data.allowedCategories.join(" | ")}`,
      "Mark ordinary personal spending (coffee, alcohol, adult snacks, unrelated shopping) as relevant=false.",
      "Mark child items (formula, nappies/diapers, wipes, baby food, baby clothing, baby medicine, childcare) as relevant=true with the matching Jibril category.",
      "Never invent amounts, merchants or dates. Leave values empty or 0 when not stated.",
    ].join("\n");

    const [a, b] = await Promise.all([
      receiptPass({
        prompt: `${prompt}\nPass 1: read carefully.`,
        fileName: data.fileName,
        mimeType: data.mimeType,
        base64,
      }),
      receiptPass({
        prompt: `${prompt}\nPass 2: independently verify. Prefer empty over guessing.`,
        fileName: data.fileName,
        mimeType: data.mimeType,
        base64,
      }),
    ]);

    const uncertain: { field: string; options: string[] }[] = [];
    const agree = (field: string, x: string, y: string) => {
      if (x && y && x.toLowerCase() === y.toLowerCase()) return x;
      if (x || y) uncertain.push({ field, options: [x, y].filter(Boolean) });
      return "";
    };
    const merchant = agree("merchant", a.merchant, b.merchant);
    const date = agree("date", a.date, b.date);
    const currency = agree("currency", a.currency, b.currency);
    const totalAgrees = Math.abs(a.total - b.total) < 0.01;
    if (!totalAgrees && (a.total || b.total))
      uncertain.push({ field: "total", options: [String(a.total), String(b.total)] });

    // Keep only lines both scans found at the same amount; everything else needs confirmation.
    const lineItems: ReceiptLine[] = [];
    for (const line of a.lineItems) {
      const twin = b.lineItems.find(
        (l) =>
          Math.abs(l.amount - line.amount) < 0.01 ||
          l.label.toLowerCase() === line.label.toLowerCase(),
      );
      lineItems.push({
        ...line,
        relevant: twin ? line.relevant && twin.relevant : line.relevant,
        certain:
          Boolean(twin) &&
          line.certain &&
          (twin?.certain ?? false) &&
          line.category === twin?.category,
      });
    }

    return {
      merchant,
      date,
      currency: currency === "USD" || currency === "GBP" ? currency : "",
      total: totalAgrees ? a.total : 0,
      tax: Math.abs(a.tax - b.tax) < 0.01 ? a.tax : 0,
      lineItems,
      isTransfer: a.isTransfer && b.isTransfer,
      sender:
        a.sender && b.sender && a.sender.toLowerCase() === b.sender.toLowerCase() ? a.sender : "",
      recipient:
        a.recipient && b.recipient && a.recipient.toLowerCase() === b.recipient.toLowerCase()
          ? a.recipient
          : "",
      reference: a.reference === b.reference ? a.reference : "",
      summary: a.summary || b.summary,
      uncertain,
      ranAt: new Date().toISOString(),
      contentRead: Boolean(base64),
      passes: [JSON.stringify(a), JSON.stringify(b)],
    };
  });

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
export const extractMoney = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      driveFileId: String(d["driveFileId"] ?? ""),
      fileName: String(d["fileName"] ?? "document"),
      mimeType: String(d["mimeType"] ?? "application/pdf"),
      title: String(d["title"] ?? ""),
      separationStartDate: String(d["separationStartDate"] ?? ""),
    };
  })
  .handler(async ({ data }): Promise<MoneyRead> => {
    const file = data.driveFileId
      ? await fetchDriveFile(data.driveFileId, data.fileName, data.mimeType)
      : null;
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
  });
