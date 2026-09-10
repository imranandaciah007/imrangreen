import { createServerFn } from "@tanstack/react-start";

/**
 * Filing-ready language for the case packet: the cover letter and the plain
 * descriptions that sit beside each exhibit in the index.
 *
 * Written from the exhibit details already held in the case, never from a guess:
 * the model is told to describe only what the records show, and to make no legal
 * argument or prediction about the outcome.
 */

export interface FilingExhibitInput {
  number: string;
  title: string;
  date: string;
  sourceType: string;
  people: string[];
  categories: string[];
  pages: string;
  summary: string;
}

export interface FilingLanguage {
  /** Paragraphs of the cover letter, in order. */
  coverLetter: string[];
  /** One short factual line per exhibit number, for the index. */
  exhibitNotes: { number: string; description: string }[];
  model: string;
  generatedAt: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    coverLetter: { type: "array", items: { type: "string" } },
    exhibitNotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { number: { type: "string" }, description: { type: "string" } },
        required: ["number", "description"],
      },
    },
  },
  required: ["coverLetter", "exhibitNotes"],
};

export const draftFilingLanguage = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      version: number;
      caseName: string;
      qualifyingRelative: string;
      applicant: string;
      child: string;
      separationStartDate: string;
      sections: string[];
      exhibits: FilingExhibitInput[];
      totals: { documented: number };
      timelineEvents: number;
    }) => data,
  )
  .handler(async ({ data }): Promise<FilingLanguage> => {
    const { runJsonModel, jsonModelName } = await import("@/lib/ai-json.server");
    const exhibitLines = data.exhibits
      .slice(0, 400)
      .map(
        (e) =>
          `${e.number} | ${e.title} | ${e.date || "date not stated"} | ${e.sourceType || "source not stated"} | people: ${e.people.join(", ") || "not stated"} | categories: ${e.categories.join("; ") || "not stated"} | packet pages ${e.pages} | detail: ${(e.summary || "no summary on record").slice(0, 400)}`,
      )
      .join("\n");

    const prompt = `You are drafting the submission language for a personal United States Form I-601 supporting-evidence packet. Write in plain, formal, factual English suitable for a government filing.

Case: ${data.caseName}
Qualifying relative (U.S. citizen spouse): ${data.qualifyingRelative}
Applicant: ${data.applicant}
Child: ${data.child}
Family separation begins: ${data.separationStartDate}
Packet version: ${data.version}
Sections in this packet: ${data.sections.join("; ")}
Timeline events on record: ${data.timelineEvents}
Documented separation costs recorded since separation: GBP ${data.totals.documented.toFixed(2)}
Exhibits (number | title | date | source | people | categories | pages | detail):
${exhibitLines || "No exhibits on record."}

Produce:
1. coverLetter — 5 to 8 paragraphs addressed to the reviewing officer. Introduce the filing, identify the qualifying relative and the applicant, explain how the packet is organised and numbered, describe what each section contains, and state the documented financial figure and the separation date as facts. Refer to exhibit numbers where useful, exactly as given.
2. exhibitNotes — one entry per exhibit number above, a single sentence of 25 words or fewer describing what that document is and what it evidences.

Absolute rules: state only what the listed records show; never invent a document, date, figure, person or event; never argue the legal standard, never assert that hardship is "extreme", and never predict or imply any outcome or likelihood of approval; do not claim any document is certified, translated or notarised unless the detail says so. If a document's purpose is unclear from its detail, describe it neutrally by its title and source.`;

    const value = await runJsonModel({
      prompt,
      schema: SCHEMA,
      name: "filing_language",
      tier: "standard",
      requiredFields: ["coverLetter", "exhibitNotes"],
      allowGapFill: true,
    });

    const coverLetter = Array.isArray(value["coverLetter"])
      ? (value["coverLetter"] as unknown[]).map((p) => String(p)).filter((p) => p.trim())
      : [];
    const notesRaw = Array.isArray(value["exhibitNotes"]) ? (value["exhibitNotes"] as unknown[]) : [];
    const exhibitNotes = notesRaw
      .map((row) => {
        const r = (row ?? {}) as { number?: unknown; description?: unknown };
        return { number: String(r.number ?? "").trim(), description: String(r.description ?? "").trim() };
      })
      .filter((row) => row.number && row.description);

    return {
      coverLetter,
      exhibitNotes,
      model: jsonModelName("standard"),
      generatedAt: new Date().toISOString(),
    };
  });
