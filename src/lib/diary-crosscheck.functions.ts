import { createServerFn } from "@tanstack/react-start";

/** One diary-sourced entry sent for comparison, with its diary page numbers. */
export interface DiaryCrossCheckEntry {
  id: string;
  date: string;
  title: string;
  description: string;
  pages: number[];
}

export interface DiaryCrossCheckResult {
  /** YYYY-MM-DD, or "" when neither the document nor the diary establishes it. */
  suggestedDate: string;
  people: string[];
  /** What happened, in the diary's own factual terms. */
  eventSummary: string;
  matchedEntryIds: string[];
  diaryPages: number[];
  contradictions: { field: string; exhibitValue: string; diaryValue: string; note: string }[];
  /** True when the actual document file was read, not just its stored details. */
  readOriginal: boolean;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "suggestedDate",
    "people",
    "eventSummary",
    "matchedEntryIds",
    "diaryPages",
    "contradictions",
  ],
  properties: {
    suggestedDate: { type: "string", description: "YYYY-MM-DD, or empty string if not established" },
    people: { type: "array", items: { type: "string" } },
    eventSummary: {
      type: "string",
      description: "One or two factual sentences on the event this document evidences",
    },
    matchedEntryIds: { type: "array", items: { type: "string" } },
    diaryPages: { type: "array", items: { type: "number" } },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "exhibitValue", "diaryValue", "note"],
        properties: {
          field: { type: "string" },
          exhibitValue: { type: "string" },
          diaryValue: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

const MAX_BYTES = 12 * 1024 * 1024;
const READABLE = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/**
 * Reads one exhibit's document next to the relevant hardship-diary entries and
 * reports the date, event and people the two agree on — plus anything where they
 * contradict each other. Nothing is invented: unestablished fields come back empty.
 */
export const crossCheckExhibitWithDiary = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      exhibit: {
        exhibitId: string;
        fileName: string;
        title: string;
        documentDate: string;
        people: string[];
        categories: string[];
        summary: string;
        driveFileId?: string | undefined;
        mimeType?: string | undefined;
      };
      entries: DiaryCrossCheckEntry[];
    }) => ({
      exhibit: data.exhibit,
      entries: (data.entries ?? []).slice(0, 60),
    }),
  )
  .handler(async ({ data }): Promise<DiaryCrossCheckResult> => {
    const { runJsonModel } = await import("@/lib/ai-json.server");
    const { PEOPLE } = await import("@/lib/evidence/types");

    let file: { fileName: string; mimeType: string; base64: string } | null = null;
    const mime = data.exhibit.mimeType ?? "application/pdf";
    if (data.exhibit.driveFileId && READABLE.some((m) => mime.startsWith(m))) {
      try {
        const { fetchDriveBytes } = await import("@/lib/drive-core.server");
        const bytes = await fetchDriveBytes(data.exhibit.driveFileId);
        if (bytes?.length && bytes.length <= MAX_BYTES) {
          file = { fileName: data.exhibit.fileName, mimeType: mime, base64: toBase64(bytes) };
        }
      } catch {
        file = null;
      }
    }

    const diary = data.entries
      .map(
        (e) =>
          `- id: ${e.id} | date: ${e.date || "unknown"} | pages: ${
            e.pages.join(", ") || "?"
          } | ${e.title}: ${e.description}`.slice(0, 600),
      )
      .join("\n");

    const prompt = [
      "You are cross-checking one piece of supporting evidence for a US immigration hardship case (Form I-601)",
      "against the hardship diary kept by the couple. Aciah is the US citizen spouse (qualifying relative),",
      "Imran is the applicant spouse, Jibril is their son.",
      "",
      "Stored details for this exhibit:",
      `Exhibit: ${data.exhibit.exhibitId}`,
      `File: ${data.exhibit.fileName}`,
      `Title: ${data.exhibit.title}`,
      `Recorded date: ${data.exhibit.documentDate || "none recorded"}`,
      `Recorded people: ${data.exhibit.people.join(", ") || "none recorded"}`,
      `Recorded categories: ${data.exhibit.categories.join(", ") || "none"}`,
      `Recorded summary: ${data.exhibit.summary || "none"}`,
      "",
      file
        ? "The document itself is attached — read it and prefer what it actually shows."
        : "The document file could not be attached; rely on the stored details only.",
      "",
      "Hardship diary entries to compare against:",
      diary || "(none supplied)",
      "",
      "Report only what the document and the diary actually establish.",
      "List the diary entry ids that describe this same event, and the diary page numbers involved.",
      "Where the document and the diary disagree on a date, a person, or what happened, list it as a contradiction",
      `with the two values and a one-line factual note. Allowed people: ${PEOPLE.join(", ")}.`,
      "Leave a field empty rather than guessing. Do not draw legal conclusions.",
    ].join("\n");

    const parsed = await runJsonModel({
      prompt,
      schema: SCHEMA,
      name: "diary_cross_check",
      file,
      tier: "standard",
      allowFallback: false,
      requiredFields: ["eventSummary"],
    });

    const date = String(parsed["suggestedDate"] ?? "").slice(0, 10);
    const list = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

    return {
      suggestedDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      people: list(parsed["people"]).filter((p) => (PEOPLE as readonly string[]).includes(p)),
      eventSummary: String(parsed["eventSummary"] ?? "").trim(),
      matchedEntryIds: list(parsed["matchedEntryIds"]),
      diaryPages: Array.isArray(parsed["diaryPages"])
        ? (parsed["diaryPages"] as unknown[])
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [],
      contradictions: Array.isArray(parsed["contradictions"])
        ? (parsed["contradictions"] as Record<string, unknown>[])
            .map((c) => ({
              field: String(c["field"] ?? "").trim(),
              exhibitValue: String(c["exhibitValue"] ?? "").trim(),
              diaryValue: String(c["diaryValue"] ?? "").trim(),
              note: String(c["note"] ?? "").trim(),
            }))
            .filter((c) => c.field && (c.exhibitValue || c.diaryValue))
        : [],
      readOriginal: Boolean(file),
    };
  });
