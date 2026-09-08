import { createServerFn } from "@tanstack/react-start";

/**
 * Hardship Diary master import — server side analysis.
 *
 * The diary is read as plain text, page by page, in chunks. Each chunk is analysed
 * twice, independently. Only records both passes agree on are returned as `confident`;
 * everything else comes back flagged so the user confirms it. Nothing is invented:
 * amounts, dates and people that are not written in the diary stay empty.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export interface DiaryEventDraft {
  date: string;
  title: string;
  description: string;
  people: string[];
  categories: string[];
  effectOnAciah: string;
  effectOnFamily: string;
  professionalOutcome: string;
  followUp: string;
  appendixRefs: string[];
  pages: number[];
  passage: string;
}

export interface DiaryFinanceDraft {
  date: string;
  label: string;
  merchant: string;
  amount: number;
  currency: string;
  expenseCategory: string;
  payer: string;
  beneficiary: string;
  purpose: string;
  amountMissing: boolean;
  appendixRefs: string[];
  pages: number[];
  passage: string;
}

export interface DiaryAppendixRef {
  ref: string;
  description: string;
  pages: number[];
}

export interface DiaryChunkResult {
  events: DiaryEventDraft[];
  finances: DiaryFinanceDraft[];
  appendixRefs: DiaryAppendixRef[];
  /** Records only one of the two passes found, or where the passes disagreed. */
  uncertainEvents: { draft: DiaryEventDraft; fields: { field: string; options: string[] }[] }[];
  uncertainFinances: { draft: DiaryFinanceDraft; fields: { field: string; options: string[] }[] }[];
  /** Raw JSON of both scans, kept for auditability. */
  passes: string[];
}

const EVENT_ITEM = {
  type: "object",
  additionalProperties: false,
  required: [
    "date",
    "title",
    "description",
    "people",
    "categories",
    "effectOnAciah",
    "effectOnFamily",
    "professionalOutcome",
    "followUp",
    "appendixRefs",
    "pages",
    "passage",
  ],
  properties: {
    date: { type: "string", description: "YYYY-MM-DD, empty string if the diary gives no date" },
    title: { type: "string" },
    description: { type: "string", description: "Factual restatement of what the diary records" },
    people: { type: "array", items: { type: "string" } },
    categories: { type: "array", items: { type: "string" } },
    effectOnAciah: { type: "string", description: "Only if the diary states or clearly shows it" },
    effectOnFamily: { type: "string" },
    professionalOutcome: { type: "string", description: "Advice, medication, referral recorded" },
    followUp: { type: "string" },
    appendixRefs: {
      type: "array",
      items: { type: "string" },
      description: "Appendix/exhibit references such as A1, A24",
    },
    pages: { type: "array", items: { type: "number" } },
    passage: { type: "string", description: "Short quoted passage the entry came from" },
  },
} as const;

const FINANCE_ITEM = {
  type: "object",
  additionalProperties: false,
  required: [
    "date",
    "label",
    "merchant",
    "amount",
    "currency",
    "expenseCategory",
    "payer",
    "beneficiary",
    "purpose",
    "amountMissing",
    "appendixRefs",
    "pages",
    "passage",
  ],
  properties: {
    date: { type: "string" },
    label: { type: "string" },
    merchant: { type: "string" },
    amount: { type: "number", description: "0 when the diary gives no amount" },
    currency: { type: "string", description: "GBP, USD or empty" },
    expenseCategory: { type: "string" },
    payer: { type: "string", description: "Imran, Aciah or empty" },
    beneficiary: { type: "string", description: "Aciah, Jibril, Family, Immigration, Other" },
    purpose: { type: "string" },
    amountMissing: { type: "boolean", description: "True when a cost is described with no amount" },
    appendixRefs: { type: "array", items: { type: "string" } },
    pages: { type: "array", items: { type: "number" } },
    passage: { type: "string" },
  },
} as const;

const CHUNK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["events", "finances", "appendixRefs"],
  properties: {
    events: { type: "array", items: EVENT_ITEM },
    finances: { type: "array", items: FINANCE_ITEM },
    appendixRefs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "description", "pages"],
        properties: {
          ref: { type: "string" },
          description: { type: "string" },
          pages: { type: "array", items: { type: "number" } },
        },
      },
    },
  },
} as const;

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
}
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
}
function s(v: unknown) {
  return String(v ?? "").trim();
}

function norm(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Cheap word-overlap similarity, 0..1. */
export function similarity(a: string, b: string) {
  const wa = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let hit = 0;
  wa.forEach((w) => {
    if (wb.has(w)) hit += 1;
  });
  return hit / Math.max(wa.size, wb.size);
}

async function runChunkPass(prompt: string) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      text: {
        format: { type: "json_schema", name: "diary_chunk", strict: true, schema: CHUNK_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    output?: { content?: { type?: string; text?: string }[] }[];
    output_text?: string;
  };
  let text = data.output_text ?? "";
  if (!text) {
    for (const part of data.output ?? []) {
      for (const c of part.content ?? []) if (c.type === "output_text" && c.text) text += c.text;
    }
  }
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const events = (Array.isArray(parsed["events"]) ? parsed["events"] : []).map((raw) => {
    const e = raw as Record<string, unknown>;
    return {
      date: s(e["date"]).slice(0, 10),
      title: s(e["title"]),
      description: s(e["description"]),
      people: list(e["people"]),
      categories: list(e["categories"]),
      effectOnAciah: s(e["effectOnAciah"]),
      effectOnFamily: s(e["effectOnFamily"]),
      professionalOutcome: s(e["professionalOutcome"]),
      followUp: s(e["followUp"]),
      appendixRefs: list(e["appendixRefs"]).map((r) => r.toUpperCase()),
      pages: nums(e["pages"]),
      passage: s(e["passage"]).slice(0, 600),
    } satisfies DiaryEventDraft;
  });
  const finances = (Array.isArray(parsed["finances"]) ? parsed["finances"] : []).map((raw) => {
    const f = raw as Record<string, unknown>;
    const amount = Number(f["amount"]) || 0;
    return {
      date: s(f["date"]).slice(0, 10),
      label: s(f["label"]),
      merchant: s(f["merchant"]),
      amount,
      currency: s(f["currency"]).toUpperCase(),
      expenseCategory: s(f["expenseCategory"]),
      payer: s(f["payer"]),
      beneficiary: s(f["beneficiary"]),
      purpose: s(f["purpose"]),
      amountMissing: Boolean(f["amountMissing"]) || amount <= 0,
      appendixRefs: list(f["appendixRefs"]).map((r) => r.toUpperCase()),
      pages: nums(f["pages"]),
      passage: s(f["passage"]).slice(0, 600),
    } satisfies DiaryFinanceDraft;
  });
  const appendixRefs = (Array.isArray(parsed["appendixRefs"]) ? parsed["appendixRefs"] : []).map(
    (raw) => {
      const r = raw as Record<string, unknown>;
      return {
        ref: s(r["ref"]).toUpperCase(),
        description: s(r["description"]),
        pages: nums(r["pages"]),
      } satisfies DiaryAppendixRef;
    },
  );
  return { events, finances, appendixRefs };
}

function eventKey(e: DiaryEventDraft) {
  return `${e.date}|${norm(e.title).slice(0, 40)}`;
}

function pairEvents(a: DiaryEventDraft[], b: DiaryEventDraft[]) {
  const used = new Set<number>();
  const pairs: { x: DiaryEventDraft; y: DiaryEventDraft | null }[] = [];
  a.forEach((x) => {
    let bestIdx = -1;
    let best = 0;
    b.forEach((y, i) => {
      if (used.has(i)) return;
      const sameDate = x.date && y.date ? x.date === y.date : true;
      const score = similarity(`${x.title} ${x.description}`, `${y.title} ${y.description}`);
      if (sameDate && score > best) {
        best = score;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && best >= 0.4) {
      used.add(bestIdx);
      pairs.push({ x, y: b[bestIdx]! });
    } else {
      pairs.push({ x, y: null });
    }
  });
  b.forEach((y, i) => {
    if (!used.has(i)) pairs.push({ x: y, y: null });
  });
  return pairs;
}

function pairFinances(a: DiaryFinanceDraft[], b: DiaryFinanceDraft[]) {
  const used = new Set<number>();
  const pairs: { x: DiaryFinanceDraft; y: DiaryFinanceDraft | null }[] = [];
  a.forEach((x) => {
    let bestIdx = -1;
    let best = 0;
    b.forEach((y, i) => {
      if (used.has(i)) return;
      const score = similarity(`${x.label} ${x.merchant} ${x.purpose}`, `${y.label} ${y.merchant} ${y.purpose}`);
      if (score > best) {
        best = score;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && best >= 0.4) {
      used.add(bestIdx);
      pairs.push({ x, y: b[bestIdx]! });
    } else {
      pairs.push({ x, y: null });
    }
  });
  b.forEach((y, i) => {
    if (!used.has(i)) pairs.push({ x: y, y: null });
  });
  return pairs;
}

function scalarCheck(
  fields: { field: string; options: string[] }[],
  field: string,
  x: string,
  y: string,
) {
  if (x && y && x.toLowerCase() !== y.toLowerCase()) fields.push({ field, options: [x, y] });
}

/**
 * Analyse one chunk of diary text with two independent passes and return only the
 * records the passes agree on, plus the uncertain ones for human confirmation.
 */
export const analyseDiaryChunk = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      text: String(d["text"] ?? "").slice(0, 60_000),
      pageStart: Number(d["pageStart"]) || 1,
      pageEnd: Number(d["pageEnd"]) || 1,
      allowedCategories: list(d["allowedCategories"]),
      allowedPeople: list(d["allowedPeople"]),
      allowedExpenseCategories: list(d["allowedExpenseCategories"]),
    };
  })
  .handler(async ({ data }): Promise<DiaryChunkResult> => {
    if (!data.text.trim()) {
      return {
        events: [],
        finances: [],
        appendixRefs: [],
        uncertainEvents: [],
        uncertainFinances: [],
        passes: [],
      };
    }

    const base = [
      "You are structuring a personal hardship diary for a US I-601 extreme-hardship waiver case.",
      "Aciah is the U.S. citizen spouse and the qualifying relative. Imran is the applicant (UK). Jibril is their son.",
      "Family separation began 2026-08-18.",
      `This text covers diary pages ${data.pageStart}-${data.pageEnd}. Page markers look like [[page N]].`,
      "Extract every dated hardship event (medical, counselling, medication, diagnosis, pregnancy/postpartum, Jibril, parenting, safety incidents, racial abuse, police, work, housing, immigration, embassy/MP correspondence, supporting letters).",
      "Extract genuine financial costs and transfers separately. Never invent an amount: if a cost is described with no amount, set amount 0 and amountMissing true.",
      "Record appendix/exhibit references exactly as written (for example A1, A24, A79).",
      "Set `pages` to the page numbers the entry came from, and `passage` to a short quote from the diary.",
      `Choose categories only from: ${data.allowedCategories.join(" | ")}`,
      `Choose people only from: ${data.allowedPeople.join(" | ")}`,
      `Choose expenseCategory only from: ${data.allowedExpenseCategories.join(" | ")}`,
      "Only fill effectOnAciah when the diary states or clearly shows the effect on Aciah. Otherwise leave it empty.",
      "Do not draw legal conclusions and do not strengthen the facts. Restate only what is written.",
      "Diary text:",
      data.text,
    ].join("\n");

    const [a, b] = await Promise.all([
      runChunkPass(`${base}\n\nPass 1: extract carefully and completely.`),
      runChunkPass(
        `${base}\n\nPass 2: independently verify. Be conservative — prefer empty fields over guesses.`,
      ),
    ]);

    const events: DiaryEventDraft[] = [];
    const uncertainEvents: DiaryChunkResult["uncertainEvents"] = [];
    const seen = new Set<string>();

    for (const { x, y } of pairEvents(a.events, b.events)) {
      if (!x.title && !x.description) continue;
      const key = eventKey(x);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!y) {
        uncertainEvents.push({ draft: x, fields: [{ field: "wholeRecord", options: ["only one of the two scans found this entry"] }] });
        continue;
      }
      const fields: { field: string; options: string[] }[] = [];
      scalarCheck(fields, "date", x.date, y.date);
      scalarCheck(fields, "title", x.title, y.title);
      scalarCheck(fields, "appendixRefs", x.appendixRefs.join(", "), y.appendixRefs.join(", "));
      scalarCheck(fields, "categories", x.categories.join(", "), y.categories.join(", "));
      scalarCheck(fields, "people", x.people.join(", "), y.people.join(", "));
      const merged: DiaryEventDraft = {
        ...x,
        date: x.date || y.date,
        effectOnAciah: x.effectOnAciah || y.effectOnAciah,
        effectOnFamily: x.effectOnFamily || y.effectOnFamily,
        professionalOutcome: x.professionalOutcome || y.professionalOutcome,
        followUp: x.followUp || y.followUp,
        appendixRefs: Array.from(new Set([...x.appendixRefs, ...y.appendixRefs])),
        pages: Array.from(new Set([...x.pages, ...y.pages])).sort((p, q) => p - q),
        passage: x.passage || y.passage,
      };
      const agreedDate = Boolean(merged.date) && !fields.some((f) => f.field === "date");
      if (fields.length || !agreedDate) uncertainEvents.push({ draft: merged, fields: fields.length ? fields : [{ field: "date", options: ["no date agreed"] }] });
      else events.push(merged);
    }

    const finances: DiaryFinanceDraft[] = [];
    const uncertainFinances: DiaryChunkResult["uncertainFinances"] = [];

    for (const { x, y } of pairFinances(a.finances, b.finances)) {
      if (!x.label) continue;
      if (!y) {
        uncertainFinances.push({ draft: x, fields: [{ field: "wholeRecord", options: ["only one of the two scans found this cost"] }] });
        continue;
      }
      const fields: { field: string; options: string[] }[] = [];
      scalarCheck(fields, "date", x.date, y.date);
      scalarCheck(fields, "currency", x.currency, y.currency);
      scalarCheck(fields, "expenseCategory", x.expenseCategory, y.expenseCategory);
      if (x.amount !== y.amount)
        fields.push({ field: "amount", options: [String(x.amount), String(y.amount)] });
      const merged: DiaryFinanceDraft = {
        ...x,
        date: x.date || y.date,
        merchant: x.merchant || y.merchant,
        purpose: x.purpose || y.purpose,
        payer: x.payer || y.payer,
        beneficiary: x.beneficiary || y.beneficiary,
        appendixRefs: Array.from(new Set([...x.appendixRefs, ...y.appendixRefs])),
        pages: Array.from(new Set([...x.pages, ...y.pages])).sort((p, q) => p - q),
        passage: x.passage || y.passage,
      };
      if (fields.length) uncertainFinances.push({ draft: merged, fields });
      else finances.push(merged);
    }

    const refMap = new Map<string, DiaryAppendixRef>();
    for (const r of [...a.appendixRefs, ...b.appendixRefs]) {
      if (!r.ref) continue;
      const prev = refMap.get(r.ref);
      refMap.set(r.ref, {
        ref: r.ref,
        description: prev?.description || r.description,
        pages: Array.from(new Set([...(prev?.pages ?? []), ...r.pages])).sort((p, q) => p - q),
      });
    }

    return {
      events,
      finances,
      appendixRefs: [...refMap.values()],
      uncertainEvents,
      uncertainFinances,
      passes: [JSON.stringify(a), JSON.stringify(b)],
    };
  });
