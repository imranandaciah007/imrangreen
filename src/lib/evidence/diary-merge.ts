import type { DiaryAppendixLink, EvidenceItem, FinancialEntry, HardshipEvent } from "./types";
import { CASE_SETTINGS } from "./types";
import type { DiaryChunkResult, DiaryEventDraft, DiaryFinanceDraft } from "@/lib/diary.functions";

/**
 * Cross-source merge planner for the hardship diary import.
 *
 * Nothing is written here — this only decides, for every diary record, whether it is
 * genuinely new, matches an existing record that can be enriched, or is too close to
 * call and must be reviewed by hand. Existing data is never replaced or deleted.
 */

export type MergeOutcome = "new" | "enrich" | "duplicate";

export interface PlannedEvent {
  key: string;
  draft: DiaryEventDraft;
  outcome: MergeOutcome;
  matchId?: string | undefined;
  matchLabel?: string | undefined;
  /** Only the fields the existing record is missing. */
  enrich: Partial<HardshipEvent>;
  reason: string;
  uncertainFields: { field: string; options: string[] }[];
  /** Suggested wording for the effect on Aciah — needs confirmation when not explicit. */
  needsAciahConfirmation: boolean;
  linkedEvidenceIds: string[];
}

export interface PlannedFinance {
  key: string;
  draft: DiaryFinanceDraft;
  outcome: MergeOutcome;
  matchId?: string | undefined;
  matchLabel?: string | undefined;
  enrich: Partial<FinancialEntry>;
  reason: string;
  uncertainFields: { field: string; options: string[] }[];
  linkedEvidenceIds: string[];
}

export interface DiaryPlan {
  events: PlannedEvent[];
  finances: PlannedFinance[];
  appendix: DiaryAppendixLink[];
  /** Appendix references with no matching document in the vault. */
  appendixMissing: DiaryAppendixLink[];
  alreadyImported: number;
}

function norm(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string) {
  return new Set(
    norm(text)
      .split(" ")
      .filter((w) => w.length > 2),
  );
}

export function similarity(a: string, b: string) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let hit = 0;
  wa.forEach((w) => {
    if (wb.has(w)) hit += 1;
  });
  return hit / Math.max(wa.size, wb.size);
}

export function eventKey(draft: DiaryEventDraft) {
  return `evt:${draft.date}:${norm(draft.title).slice(0, 48)}`;
}

export function financeKey(draft: DiaryFinanceDraft) {
  return `fin:${draft.date}:${draft.amount}:${norm(`${draft.merchant} ${draft.label}`).slice(0, 40)}`;
}

const SEPARATION_TITLE = /family separation begins/i;

function isSeparationMilestone(draft: DiaryEventDraft) {
  return draft.date === CASE_SETTINGS.separationStartDate && SEPARATION_TITLE.test(draft.title);
}

function findEvidenceForRefs(items: EvidenceItem[], refs: string[]) {
  if (!refs.length) return [];
  return items
    .filter((item) => {
      const haystack =
        `${item.exhibitId} ${item.fileName} ${item.title} ${(item.appendixRefs ?? []).join(" ")}`.toUpperCase();
      return refs.some((ref) => new RegExp(`(^|[^A-Z0-9])${ref}([^A-Z0-9]|$)`).test(haystack));
    })
    .map((i) => i.id);
}

function daysApart(a: string, b: string) {
  if (!a || !b) return 999;
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
}

export function planDiaryImport(
  results: DiaryChunkResult[],
  existing: {
    items: EvidenceItem[];
    events: HardshipEvent[];
    finances: FinancialEntry[];
    previousKeys: string[];
  },
): DiaryPlan {
  const done = new Set(existing.previousKeys);
  let alreadyImported = 0;

  const eventPlans: PlannedEvent[] = [];
  const financePlans: PlannedFinance[] = [];
  const seen = new Set<string>();
  const refMap = new Map<string, DiaryAppendixLink>();

  const pushRef = (ref: string, description: string, pages: number[]) => {
    if (!ref) return;
    const prev = refMap.get(ref);
    refMap.set(ref, {
      ref,
      description: prev?.description || description,
      pages: Array.from(new Set([...(prev?.pages ?? []), ...pages])).sort((a, b) => a - b),
    });
  };

  const collectEvent = (
    draft: DiaryEventDraft,
    uncertainFields: { field: string; options: string[] }[],
  ) => {
    if (isSeparationMilestone(draft)) {
      // The permanent milestone already exists — link the diary evidence, never duplicate it.
      return;
    }
    const key = eventKey(draft);
    if (seen.has(key)) return;
    seen.add(key);
    if (done.has(key)) {
      alreadyImported += 1;
      return;
    }
    draft.appendixRefs.forEach((ref) => pushRef(ref, draft.title, draft.pages));

    let outcome: MergeOutcome = "new";
    let matchId: string | undefined;
    let matchLabel: string | undefined;
    let reason = "No matching timeline event found.";
    let best = 0;

    for (const event of existing.events) {
      const gap = daysApart(draft.date, event.date);
      const score = similarity(
        `${draft.title} ${draft.description}`,
        `${event.title} ${event.description ?? ""}`,
      );
      if (gap <= 1 && score > best) {
        best = score;
        matchId = event.id;
        matchLabel = `${event.date} · ${event.title}`;
      }
    }
    if (matchId && best >= 0.55) {
      outcome = "enrich";
      reason = `Same event as an existing timeline entry (${Math.round(best * 100)}% match) — only missing details are added.`;
    } else if (matchId && best >= 0.3) {
      outcome = "duplicate";
      reason = `Close to an existing timeline entry (${Math.round(best * 100)}% match) — please confirm whether they are the same event.`;
    }

    const match = existing.events.find((e) => e.id === matchId);
    const enrich: Partial<HardshipEvent> = {};
    const linkedEvidenceIds = findEvidenceForRefs(existing.items, draft.appendixRefs);

    if (outcome === "enrich" && match) {
      const confirmed = match.confirmedFields ?? [];
      const fill = <K extends keyof HardshipEvent>(field: K, value: HardshipEvent[K]) => {
        if (confirmed.includes(String(field))) return;
        const current = match[field];
        const empty =
          current === undefined ||
          current === "" ||
          (Array.isArray(current) && current.length === 0);
        if (empty && value) enrich[field] = value;
      };
      fill("description", draft.description);
      fill("effectOnAciah", draft.effectOnAciah);
      fill("effectOnFamily", draft.effectOnFamily);
      fill("professionalOutcome", draft.professionalOutcome);
      fill("followUp", draft.followUp);
      if (draft.appendixRefs.length) {
        enrich.appendixRefs = Array.from(
          new Set([...(match.appendixRefs ?? []), ...draft.appendixRefs]),
        );
      }
      const mergedEvidence = Array.from(
        new Set([...(match.evidenceIds ?? []), ...linkedEvidenceIds]),
      );
      if (mergedEvidence.length !== (match.evidenceIds ?? []).length) {
        enrich.evidenceIds = mergedEvidence;
      }
    }

    const jibrilOnly =
      draft.people.includes("Jibril") && !draft.people.includes("Aciah") && !draft.effectOnAciah;

    eventPlans.push({
      key,
      draft,
      outcome,
      matchId,
      matchLabel,
      enrich,
      reason,
      uncertainFields: uncertainFields,
      needsAciahConfirmation: jibrilOnly,
      linkedEvidenceIds,
    });
  };

  const collectFinance = (
    draft: DiaryFinanceDraft,
    uncertainFields: { field: string; options: string[] }[],
  ) => {
    const key = financeKey(draft);
    if (seen.has(key)) return;
    seen.add(key);
    if (done.has(key)) {
      alreadyImported += 1;
      return;
    }
    draft.appendixRefs.forEach((ref) => pushRef(ref, draft.label, draft.pages));

    let outcome: MergeOutcome = "new";
    let matchId: string | undefined;
    let matchLabel: string | undefined;
    let reason = "No matching transaction found.";
    let best = 0;

    for (const entry of existing.finances) {
      const sameAmount = draft.amount > 0 && Math.abs(entry.amount - draft.amount) < 0.02;
      const gap = daysApart(draft.date, entry.date);
      const score = similarity(
        `${draft.label} ${draft.merchant} ${draft.purpose}`,
        `${entry.label} ${entry.merchant ?? ""} ${entry.purpose ?? ""}`,
      );
      const combined = (sameAmount ? 0.5 : 0) + score / 2;
      if (gap <= 3 && combined > best) {
        best = combined;
        matchId = entry.id;
        matchLabel = `${entry.date} · ${entry.label}`;
      }
    }
    if (matchId && best >= 0.6) {
      outcome = "enrich";
      reason = "Same transaction already recorded — counted once, diary detail added.";
    } else if (matchId && best >= 0.3) {
      outcome = "duplicate";
      reason =
        "Similar transaction already recorded — please confirm whether it is the same payment.";
    }

    const match = existing.finances.find((f) => f.id === matchId);
    const enrich: Partial<FinancialEntry> = {};
    const linkedEvidenceIds = findEvidenceForRefs(existing.items, draft.appendixRefs);
    if (outcome === "enrich" && match) {
      const confirmed = match.confirmedFields ?? [];
      if (!match.purpose && draft.purpose && !confirmed.includes("purpose"))
        enrich.purpose = draft.purpose;
      if (!match.merchant && draft.merchant && !confirmed.includes("merchant"))
        enrich.merchant = draft.merchant;
      if (draft.appendixRefs.length)
        enrich.appendixRefs = Array.from(
          new Set([...(match.appendixRefs ?? []), ...draft.appendixRefs]),
        );
      const mergedEvidence = Array.from(
        new Set([...(match.evidenceIds ?? []), ...linkedEvidenceIds]),
      );
      if (mergedEvidence.length !== (match.evidenceIds ?? []).length)
        enrich.evidenceIds = mergedEvidence;
    }

    financePlans.push({
      key,
      draft,
      outcome,
      matchId,
      matchLabel,
      enrich,
      reason,
      uncertainFields,
      linkedEvidenceIds,
    });
  };

  for (const result of results) {
    result.events.forEach((draft) => collectEvent(draft, []));
    result.uncertainEvents.forEach(({ draft, fields }) => collectEvent(draft, fields));
    result.finances.forEach((draft) => collectFinance(draft, []));
    result.uncertainFinances.forEach(({ draft, fields }) => collectFinance(draft, fields));
    result.appendixRefs.forEach((r) => pushRef(r.ref, r.description, r.pages));
  }

  const appendix = [...refMap.values()]
    .map((link) => {
      const found = findEvidenceForRefs(existing.items, [link.ref]);
      return found[0] ? { ...link, evidenceId: found[0] } : link;
    })
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));

  return {
    events: eventPlans,
    finances: financePlans,
    appendix,
    appendixMissing: appendix.filter((a) => !a.evidenceId),
    alreadyImported,
  };
}
