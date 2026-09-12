import { createServerFn } from "@tanstack/react-start";
import { runJsonModel } from "./ai-json.server";

const DRIVE_GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
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

async function fetchDriveBytes(fileId: string) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) return null;
  const res = await fetch(`${DRIVE_GATEWAY}/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
    },
  });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return null;
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
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
    const base64 = data.driveFileId ? await fetchDriveBytes(data.driveFileId) : null;
    return twoPass({ ...data, base64 });
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

  const [a, b] = await Promise.all([
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

  return {
    agreed,
    uncertain,
    summary: a.summary || b.summary,
    aciahImpact: a.aciahImpact || b.aciahImpact,
    language: a.language || b.language,
    passes: [a, b],
    ranAt: new Date().toISOString(),
    contentRead: Boolean(base64),
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
    const base64 =
      data.base64 || (data.driveFileId ? await fetchDriveBytes(data.driveFileId) : null);
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
