import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const DRIVE_GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const MODEL = "openai/gpt-6-astra";
const MAX_BYTES = 12 * 1024 * 1024;

export interface ExtractionPass {
  title: string;
  documentDate: string;
  people: string[];
  categories: string[];
  sourceType: string;
  pageCount: number;
  summary: string;
  language: string;
}

export interface ExtractionResult {
  /** Fields both passes agreed on — safe to prefill. */
  agreed: Partial<ExtractionPass>;
  /** Fields the two passes disagreed on, with both candidate values. */
  uncertain: { field: string; options: string[] }[];
  summary: string;
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
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("AI is not configured for this project.");

  const content: Record<string, unknown>[] = [{ type: "input_text", text: input.prompt }];
  if (input.base64) {
    if (input.mimeType.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: `data:${input.mimeType};base64,${input.base64}`,
      });
    } else {
      content.push({
        type: "input_file",
        filename: input.fileName,
        file_data: `data:${input.mimeType};base64,${input.base64}`,
      });
    }
  }

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "low" },
      input: [{ role: "user", content }],
      text: {
        format: { type: "json_schema", name: "evidence_extraction", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    output?: { type?: string; content?: { type?: string; text?: string }[] }[];
    output_text?: string;
  };
  let text = data.output_text ?? "";
  if (!text) {
    for (const part of data.output ?? []) {
      for (const c of part.content ?? []) {
        if (c.type === "output_text" && c.text) text += c.text;
      }
    }
  }
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return {
    title: String(parsed["title"] ?? "").trim(),
    documentDate: String(parsed["documentDate"] ?? "").slice(0, 10),
    people: normList(parsed["people"]),
    categories: normList(parsed["categories"]),
    sourceType: String(parsed["sourceType"] ?? "").trim(),
    pageCount: Math.max(1, Number(parsed["pageCount"]) || 1),
    summary: String(parsed["summary"] ?? "").trim(),
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
        uncertain.push({ field, options: [x, y].filter(Boolean) as string[] });
      }
    };

    pushScalar("title", a.title, b.title);
    pushScalar("documentDate", a.documentDate, b.documentDate);
    pushScalar("sourceType", a.sourceType, b.sourceType);

    if (samePass(a.people, b.people) && a.people.length) agreed.people = a.people;
    else if (a.people.length || b.people.length)
      uncertain.push({
        field: "people",
        options: [a.people.join(", "), b.people.join(", ")].filter(Boolean),
      });

    if (samePass(a.categories, b.categories) && a.categories.length) agreed.categories = a.categories;
    else if (a.categories.length || b.categories.length)
      uncertain.push({
        field: "categories",
        options: [a.categories.join(", "), b.categories.join(", ")].filter(Boolean),
      });

    if (a.pageCount === b.pageCount) agreed.pageCount = a.pageCount;
    else uncertain.push({ field: "pageCount", options: [String(a.pageCount), String(b.pageCount)] });

    return {
      agreed,
      uncertain,
      summary: a.summary || b.summary,
      language: a.language || b.language,
      passes: [a, b],
      ranAt: new Date().toISOString(),
      contentRead: Boolean(base64),
    };
  });
