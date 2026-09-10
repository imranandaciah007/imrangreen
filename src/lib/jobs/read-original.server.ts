/**
 * Background document reading — Gemini does the heavy lifting.
 *
 * The clone worker calls this for every Drive original before it builds a clone, so
 * cover sheets carry a real title, date, people, categories and factual summary
 * instead of a filename guess. Bulk work never falls back to the built-in AI, so a
 * Gemini outage pauses reading rather than spending Lovable credits.
 */

import { fetchDriveBytes } from "@/lib/drive-core.server";
import { geminiConfigured, jsonModelName, runJsonModel } from "@/lib/ai-json.server";
import { CATEGORIES, PEOPLE, SOURCE_TYPES } from "@/lib/evidence/types";

const READABLE = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
];

const MAX_BYTES = 12 * 1024 * 1024;

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
    "readable",
  ],
  properties: {
    title: { type: "string", description: "Short factual document title" },
    documentDate: { type: "string", description: "YYYY-MM-DD, or empty string if unknown" },
    people: { type: "array", items: { type: "string" } },
    categories: { type: "array", items: { type: "string" } },
    sourceType: { type: "string" },
    pageCount: { type: "number" },
    summary: { type: "string", description: "Two factual sentences on what this document shows" },
    aciahImpact: {
      type: "string",
      description:
        "One factual sentence on how this affects Aciah, or empty string if the document does not show that",
    },
    language: { type: "string" },
    readable: { type: "boolean", description: "False if the file content could not be read" },
  },
} as const;

export interface ReadResult {
  title: string;
  documentDate: string;
  people: string[];
  categories: string[];
  sourceType: string;
  pageCount: number;
  summary: string;
  aciahImpact: string;
  language: string;
  model: string;
}

function list(v: unknown, allowed?: readonly string[]) {
  const out = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return allowed ? out.filter((x) => allowed.includes(x)) : out;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/** Returns null when the file cannot be read (unsupported, too big, or AI unavailable). */
export async function readOriginal(input: {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  folderPath: string;
}): Promise<ReadResult | null> {
  if (!geminiConfigured()) return null;
  if (!READABLE.some((m) => input.mimeType.startsWith(m))) return null;

  let base64: string;
  try {
    const bytes = await fetchDriveBytes(input.driveFileId);
    if (!bytes?.length || bytes.length > MAX_BYTES) return null;
    base64 = toBase64(bytes);
  } catch {
    return null;
  }

  const prompt = [
    "You are indexing supporting evidence for one US immigration hardship case (Form I-601).",
    "The qualifying relative is Aciah (US citizen spouse). Imran is the applicant spouse; Jibril is their son.",
    "Read the attached document and report only what it actually shows. Never guess, never infer legal conclusions,",
    "and leave a field empty when the document does not state it.",
    `File name: ${input.fileName}`,
    `Drive folder: ${input.folderPath || "Drive root"}`,
    `Allowed people: ${PEOPLE.join(", ")}`,
    `Allowed categories: ${CATEGORIES.join(", ")}`,
    `Allowed source types: ${SOURCE_TYPES.join(", ")}`,
    'If the file content is unreadable (scanned blank, encrypted, corrupt), set "readable" to false.',
  ].join("\n");

  let parsed: Record<string, unknown>;
  try {
    parsed = await runJsonModel({
      prompt,
      schema: SCHEMA,
      name: "background_document_read",
      file: { fileName: input.fileName, mimeType: input.mimeType, base64 },
      tier: "bulk",
      allowFallback: false,
      // If the free read leaves the essentials blank, the paid reader is asked
      // once for just those fields rather than re-reading everything.
      allowGapFill: true,
      requiredFields: ["title", "summary"],
    });
  } catch (err) {
    console.error(`Background read failed for ${input.fileName}:`, err);
    return null;
  }

  if (parsed["readable"] === false) return null;
  const title = String(parsed["title"] ?? "").trim();
  const date = String(parsed["documentDate"] ?? "").slice(0, 10);
  return {
    title,
    documentDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    people: list(parsed["people"], PEOPLE),
    categories: list(parsed["categories"], CATEGORIES),
    sourceType: SOURCE_TYPES.includes(String(parsed["sourceType"]).trim() as never)
      ? String(parsed["sourceType"]).trim()
      : "",
    pageCount: Math.max(1, Number(parsed["pageCount"]) || 1),
    summary: String(parsed["summary"] ?? "").trim(),
    aciahImpact: String(parsed["aciahImpact"] ?? "").trim(),
    language: String(parsed["language"] ?? "").trim(),
    model: jsonModelName("bulk"),
  };
}
