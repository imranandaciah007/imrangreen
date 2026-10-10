import { createServerFn } from "@tanstack/react-start";

/**
 * Cover letter + exhibit index built straight from the exhibit details held in
 * the clone ledger, for whatever the user has left selected in the Explorer.
 *
 * Factual only: the model describes what the records show, makes no legal
 * argument and no prediction about the outcome.
 */

export interface ExplorerExhibit {
  number: string;
  driveFileId: string;
  fileName: string;
  title: string;
  date: string;
  sourceType: string;
  people: string[];
  categories: string[];
  pageCount: number | null;
  summary: string;
  folderPath: string;
  originalLink: string;
  cloneLink: string | null;
  description: string;
}

export interface ExplorerFiling {
  coverLetter: string[];
  exhibits: ExplorerExhibit[];
  folderLabel: string;
  totalPages: number;
  model: string;
  generatedAt: string;
  /** Where the wording came from: the reading engine, or the stored records alone. */
  languageSource: "ai" | "records";
  /** Shown to the user when the wording had to fall back to the stored records. */
  notice?: string;
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

const excluded = (path: string, list: string[]) =>
  list.some((ex) => path === ex || path.startsWith(`${ex}/`));

export const draftExplorerFiling = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      rootPath?: string;
      excludedFolders?: string[];
      excludedFileIds?: string[];
      /** When given, only these folders (and anything beneath them) are kept. */
      includedFolders?: string[];
      /** Individual documents ticked on their own, outside the ticked folders. */
      includedFileIds?: string[];
      qualifyingRelative?: string;
      applicant?: string;
      child?: string;
      separationStartDate?: string;
    }) => ({
      rootPath: (data.rootPath ?? "").replace(/^\/+|\/+$/g, ""),
      excludedFolders: (data.excludedFolders ?? []).map((p) => p.replace(/^\/+|\/+$/g, "")),
      excludedFileIds: data.excludedFileIds ?? [],
      includedFolders: (data.includedFolders ?? []).map((p) => p.replace(/^\/+|\/+$/g, "")),
      includedFileIds: data.includedFileIds ?? [],
      qualifyingRelative: data.qualifyingRelative ?? "Aciah",
      applicant: data.applicant ?? "Imran",
      child: data.child ?? "Jibril",
      separationStartDate: data.separationStartDate ?? "18 August 2026",
    }),
  )
  .handler(async ({ data }): Promise<ExplorerFiling> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runJsonModel, jsonModelName, writtenBy } = await import("@/lib/ai-json.server");

    type Row = {
      drive_file_id: string;
      file_name: string | null;
      folder_path: string | null;
      clone_link: string | null;
      status: string;
      ai_title: string | null;
      ai_date: string | null;
      ai_people: string[] | null;
      ai_categories: string[] | null;
      ai_source_type: string | null;
      ai_summary: string | null;
      ai_page_count: number | null;
    };

    const rows: Row[] = [];
    const page = 1000;
    for (let from = 0; from < 20000; from += page) {
      const { data: batch, error } = await supabaseAdmin
        .from("gc_clone_jobs")
        .select(
          "drive_file_id,file_name,folder_path,clone_link,status,ai_title,ai_date,ai_people,ai_categories,ai_source_type,ai_summary,ai_page_count",
        )
        .neq("status", "duplicate")
        .range(from, from + page - 1);
      if (error) throw new Error(error.message);
      if (!batch?.length) break;
      rows.push(...(batch as Row[]));
      if (batch.length < page) break;
    }

    const excludedIds = new Set(data.excludedFileIds);
    const includedIds = new Set(data.includedFileIds);
    // Nothing is selected by default, so an explicit selection wins: a document
    // is kept when its folder is ticked, or when the document itself is ticked.
    const selecting = data.includedFolders.length > 0 || includedIds.size > 0;
    const kept = rows.filter((row) => {
      const path = (row.folder_path ?? "").replace(/^\/+|\/+$/g, "");
      if (data.rootPath && path !== data.rootPath && !path.startsWith(`${data.rootPath}/`)) return false;
      if (excluded(path, data.excludedFolders)) return false;
      if (excludedIds.has(row.drive_file_id)) return false;
      if (selecting) {
        const inFolder = excluded(path, data.includedFolders);
        if (!inFolder && !includedIds.has(row.drive_file_id)) return false;
      }
      return true;
    });

    kept.sort((a, b) => {
      const pa = (a.folder_path ?? "").localeCompare(b.folder_path ?? "");
      if (pa !== 0) return pa;
      const da = a.ai_date ?? "";
      const db = b.ai_date ?? "";
      if (da !== db) return da.localeCompare(db);
      return (a.ai_title ?? a.file_name ?? "").localeCompare(b.ai_title ?? b.file_name ?? "");
    });

    const exhibits: ExplorerExhibit[] = kept.map((row, index) => ({
      number: `EX-${String(index + 1).padStart(3, "0")}`,
      driveFileId: row.drive_file_id,
      fileName: row.file_name ?? row.drive_file_id,
      title: row.ai_title ?? row.file_name ?? "Untitled document",
      date: row.ai_date ?? "",
      sourceType: row.ai_source_type ?? "",
      people: row.ai_people ?? [],
      categories: row.ai_categories ?? [],
      pageCount: row.ai_page_count,
      summary: row.ai_summary ?? "",
      folderPath: (row.folder_path ?? "").replace(/^\/+|\/+$/g, ""),
      originalLink: `https://drive.google.com/file/d/${row.drive_file_id}/view`,
      cloneLink: row.clone_link,
      description: "",
    }));

    const folderLabel = data.rootPath || "I601 Evidence Clones";
    const totalPages = exhibits.reduce((sum, e) => sum + (e.pageCount ?? 1), 0);

    if (!exhibits.length) {
      return {
        coverLetter: [],
        exhibits,
        folderLabel,
        totalPages: 0,
        model: jsonModelName("standard"),
        generatedAt: new Date().toISOString(),
        languageSource: "records",
      };
    }

    const lines = exhibits
      .slice(0, 400)
      .map(
        (e) =>
          `${e.number} | ${e.title} | ${e.date || "date not stated"} | ${e.sourceType || "source not stated"} | folder: ${e.folderPath || "root"} | people: ${e.people.join(", ") || "not stated"} | categories: ${e.categories.join("; ") || "not stated"} | pages: ${e.pageCount ?? "not stated"} | detail: ${(e.summary || "no summary on record").slice(0, 400)}`,
      )
      .join("\n");

    const prompt = `You are drafting the submission language for a personal United States Form I-601 supporting-evidence packet. Write plain, formal, factual English suitable for a government filing.

Qualifying relative (U.S. citizen spouse): ${data.qualifyingRelative}
Applicant: ${data.applicant}
Child: ${data.child}
Family separation begins: ${data.separationStartDate}
Selected folder: ${folderLabel}
Exhibits selected: ${exhibits.length}; total pages on record: ${totalPages}
Exhibits (number | title | date | source | folder | people | categories | pages | detail):
${lines}

Produce:
1. coverLetter — 4 to 7 paragraphs addressed to the reviewing officer. Introduce the filing, identify the qualifying relative and the applicant, explain how this packet is organised and numbered, describe what the selected folders contain, and state the separation date as a fact. Refer to exhibit numbers exactly as given where useful.
2. exhibitNotes — one entry per exhibit number above, a single sentence of 25 words or fewer describing what the document is and what it evidences.

Absolute rules: state only what the listed records show; never invent a document, date, figure, person or event; never argue the legal standard, never assert hardship is "extreme", never predict or imply any outcome or likelihood of approval; do not claim a document is certified, translated or notarised unless the detail says so. If a document's purpose is unclear, describe it neutrally by its title and source.`;

    /** Plain factual wording assembled from the stored records only. */
    const fromRecordsOnly = (): string[] => {
      const folders = [...new Set(exhibits.map((e) => e.folderPath || "root"))];
      const dated = exhibits.map((e) => e.date).filter(Boolean).sort();
      return [
        `This packet contains supporting evidence submitted with Form I-601 for the applicant, ${data.applicant}. The qualifying relative is ${data.qualifyingRelative}, the applicant's spouse and a United States citizen. The couple's child is ${data.child}.`,
        `The packet holds ${exhibits.length} exhibit${exhibits.length === 1 ? "" : "s"} totalling ${totalPages} page${totalPages === 1 ? "" : "s"} of records. Exhibits are numbered sequentially from ${exhibits[0]?.number ?? "EX-001"} to ${exhibits[exhibits.length - 1]?.number ?? "EX-001"} and are listed in the exhibit index that follows this letter.`,
        `The records are drawn from ${folders.length} folder${folders.length === 1 ? "" : "s"}: ${folders.slice(0, 12).join("; ")}${folders.length > 12 ? "; and others" : ""}.`,
        dated.length
          ? `The dated records in this packet span ${dated[0]} to ${dated[dated.length - 1]}.`
          : `Dates are stated on the individual exhibits where they appear on the records.`,
        `Family separation begins on ${data.separationStartDate}.`,
        `Each exhibit is preceded by a cover sheet stating its exhibit number, title, date, source and page count. Original documents are reproduced without alteration.`,
      ];
    };

    let coverLetter: string[] = [];
    let languageSource: "ai" | "records" = "ai";
    let writer = jsonModelName("standard");
    let notice: string | undefined;

    try {
      const value = await runJsonModel({
        prompt,
        schema: SCHEMA,
        name: "explorer_filing",
        writer: "claude",
        tier: "standard",
        requiredFields: ["coverLetter", "exhibitNotes"],
        allowGapFill: false,
        // Claude writes this when its key is set. Otherwise Gemini only: never
        // spend other paid credits on the wording; if Gemini is out of allowance
        // the wording is built from stored records.
        allowFallback: false,
      });
      writer = writtenBy(value, writer);

      coverLetter = Array.isArray(value["coverLetter"])
        ? (value["coverLetter"] as unknown[]).map((p) => String(p)).filter((p) => p.trim())
        : [];
      const notes = new Map<string, string>();
      if (Array.isArray(value["exhibitNotes"])) {
        for (const raw of value["exhibitNotes"] as unknown[]) {
          const r = (raw ?? {}) as { number?: unknown; description?: unknown };
          const number = String(r.number ?? "").trim();
          const description = String(r.description ?? "").trim();
          if (number && description) notes.set(number, description);
        }
      }
      for (const exhibit of exhibits) {
        exhibit.description = notes.get(exhibit.number) ?? exhibit.summary;
      }
      if (!coverLetter.length) throw new Error("No cover letter returned.");
    } catch (error) {
      languageSource = "records";
      coverLetter = fromRecordsOnly();
      for (const exhibit of exhibits) exhibit.description = exhibit.summary;
      notice =
        error instanceof Error && /quota|429/i.test(error.message)
          ? "Automatic reading is out of allowance today, so the wording was built from your stored exhibit details."
          : "Automatic reading was unavailable, so the wording was built from your stored exhibit details.";
    }

    return {
      coverLetter,
      exhibits,
      folderLabel,
      totalPages,
      model: writer,
      generatedAt: new Date().toISOString(),
      languageSource,
      ...(notice ? { notice } : {}),
    };
  });
