import {
  CASE_SETTINGS,
  READY_STATUSES,
  taskStatus,
  type Category,
  type CaseTask,
  type EvidenceItem,
  type FinancialEntry,
  type DiaryImport,
  type HardshipEvent,
} from "./types";

export type GapKind =
  | "event-no-evidence"
  | "event-vague"
  | "medical-no-independent"
  | "finance-no-receipt"
  | "finance-duplicate"
  | "evidence-no-date"
  | "evidence-no-person"
  | "evidence-no-category"
  | "evidence-duplicate"
  | "evidence-translation"
  | "evidence-awaiting-confirmation"
  | "evidence-unreviewed"
  | "evidence-ai-conflict"
  | "task-overdue"
  | "aciah-impact"
  | "diary-appendix-missing";

export interface CaseGap {
  id: string;
  kind: GapKind;
  label: string;
  detail: string;
  severity: "high" | "medium" | "low";
  recordType: "evidence" | "event" | "finance" | "task";
  recordId: string;
  /** Suggested task title when the user wants to chase it. */
  taskTitle: string;
}

const MEDICAL_WORDS = /(medic|doctor|gp |hospital|diagnos|therap|mental|pregnan|midwife|clinic)/i;
const INDEPENDENT_SOURCES = [
  "Medical",
  "Government / Official",
  "Police / Court",
  "Employer",
  "Independent Third Party",
];

function catsOf(item: EvidenceItem) {
  return item.categories?.length ? item.categories : [item.category];
}

function eventCats(event: HardshipEvent) {
  return event.categories?.length ? event.categories : [event.category];
}

/** Is the effect on Aciah, the qualifying relative, clear? */
export function aciahImpactState(record: {
  people?: string[] | undefined;
  effectOnAciah?: string | undefined;
  affectsAciah?: string | undefined;
  description?: string | undefined;
  notes?: string | undefined;
}): "Explicit in evidence" | "Linked / explained" | "Needs explanation" {
  const text = `${record.description ?? ""} ${record.notes ?? ""}`;
  const mentionsAciah = (record.people ?? []).includes("Aciah") || /aciah/i.test(text);
  const explained = Boolean((record.effectOnAciah ?? record.affectsAciah ?? "").trim());
  if (mentionsAciah && (explained || /aciah/i.test(text))) {
    return explained ? "Explicit in evidence" : "Linked / explained";
  }
  if (explained) return "Linked / explained";
  return "Needs explanation";
}

export function detectGaps(
  items: EvidenceItem[],
  events: HardshipEvent[],
  finances: FinancialEntry[],
  tasks: CaseTask[],
  categories: Category[],
): CaseGap[] {
  const gaps: CaseGap[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const openTaskTitles = tasks
    .filter((t) => taskStatus(t) !== "Complete")
    .map((t) => t.title.toLowerCase());

  for (const item of items) {
    const base = { recordType: "evidence" as const, recordId: item.id };
    const name = item.title || item.fileName;
    if (!item.dateOfDocument) {
      gaps.push({
        ...base,
        id: `${item.id}-date`,
        kind: "evidence-no-date",
        severity: "medium",
        label: "No document date",
        detail: name,
        taskTitle: `Add a date to ${item.exhibitId}`,
      });
    }
    if (!(item.people ?? []).length || (item.people ?? []).every((person) => person === "Third party")) {
      gaps.push({
        ...base,
        id: `${item.id}-person`,
        kind: "evidence-no-person",
        severity: "low",
        label: "Person needs confirmation",
        detail: name,
        taskTitle: `Record who ${item.exhibitId} is about`,
      });
    }
    const cats = catsOf(item).filter((c) => c && categories.includes(c));
    if (!cats.length || cats.every((category) => category === "Other")) {
      gaps.push({
        ...base,
        id: `${item.id}-cat`,
        kind: "evidence-no-category",
        severity: "medium",
        label: "Hardship category needs confirmation",
        detail: name,
        taskTitle: `File ${item.exhibitId} under a hardship category`,
      });
    }
    if (item.duplicateSuspected || item.duplicateOfId) {
      gaps.push({
        ...base,
        id: `${item.id}-dupe`,
        kind: "evidence-duplicate",
        severity: "low",
        label: "Possible duplicate",
        detail: name,
        taskTitle: `Check whether ${item.exhibitId} duplicates another exhibit`,
      });
    }
    if (item.needsTranslation || item.status === "Translation needed") {
      gaps.push({
        ...base,
        id: `${item.id}-trans`,
        kind: "evidence-translation",
        severity: "medium",
        label: "Translation needed",
        detail: name,
        taskTitle: `Obtain translation for ${item.exhibitId}`,
      });
    }
    if ((item.aiExtraction?.uncertain?.length ?? 0) > 0) {
      gaps.push({
        ...base,
        id: `${item.id}-unc`,
        kind: "evidence-awaiting-confirmation",
        severity: "high",
        label: `${item.aiExtraction!.uncertain.length} field(s) awaiting your confirmation`,
        detail: name,
        taskTitle: `Review AI uncertainty on ${item.exhibitId}`,
      });
    }
    if ((item.aiConflicts?.length ?? 0) > 0) {
      gaps.push({
        ...base,
        id: `${item.id}-conflict`,
        kind: "evidence-ai-conflict",
        severity: "high",
        label: "AI found a possible conflict with a confirmed value",
        detail: name,
        taskTitle: `Review AI conflict on ${item.exhibitId}`,
      });
    }
    const hasSpecificDetailGap = gaps.some(
      (gap) => gap.recordId === item.id && ["evidence-no-date", "evidence-no-person", "evidence-no-category", "evidence-awaiting-confirmation", "evidence-ai-conflict"].includes(gap.kind),
    );
    if (item.status === "Needs confirmation" && !hasSpecificDetailGap) {
      gaps.push({
        ...base,
        id: `${item.id}-detail`,
        kind: "evidence-awaiting-confirmation",
        severity: "medium",
        label: "Important details need confirmation",
        detail: name,
        taskTitle: `Confirm important details for ${item.exhibitId}`,
      });
    }
    if (
      (item.people ?? []).includes("Jibril") &&
      !(item.people ?? []).includes("Aciah") &&
      aciahImpactState(item) === "Needs explanation"
    ) {
      gaps.push({
        ...base,
        id: `${item.id}-aciah`,
        kind: "aciah-impact",
        severity: "medium",
        label: "How does this affect Aciah?",
        detail: name,
        taskTitle: `Add explanation: how ${item.exhibitId} affects Aciah`,
      });
    }
  }

  for (const event of events) {
    const base = { recordType: "event" as const, recordId: event.id };
    if (!(event.evidenceIds ?? []).length) {
      gaps.push({
        ...base,
        id: `${event.id}-noev`,
        kind: "event-no-evidence",
        severity: "high",
        label: "Event has no supporting evidence",
        detail: `${event.date} — ${event.title}`,
        taskTitle: `Find evidence for "${event.title}"`,
      });
    }
    if ((event.description ?? "").trim().length < 40) {
      gaps.push({
        ...base,
        id: `${event.id}-vague`,
        kind: "event-vague",
        severity: "low",
        label: "Description is very short",
        detail: `${event.date} — ${event.title}`,
        taskTitle: `Add detail to "${event.title}"`,
      });
    }
    const isMedical =
      MEDICAL_WORDS.test(`${event.title} ${event.description ?? ""}`) ||
      eventCats(event).some((c) => /medical|pregnan/i.test(c));
    if (isMedical) {
      const linked = (event.evidenceIds ?? [])
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean) as EvidenceItem[];
      if (!linked.some((i) => INDEPENDENT_SOURCES.includes(i.sourceType))) {
        gaps.push({
          ...base,
          id: `${event.id}-med`,
          kind: "medical-no-independent",
          severity: "high",
          label: "Medical claim has no medical or independent evidence",
          detail: `${event.date} — ${event.title}`,
          taskTitle: `Request medical records for "${event.title}"`,
        });
      }
    }
    if (aciahImpactState(event) === "Needs explanation") {
      gaps.push({
        ...base,
        id: `${event.id}-aciah`,
        kind: "aciah-impact",
        severity: "medium",
        label: "Impact on Aciah is not recorded",
        detail: `${event.date} — ${event.title}`,
        taskTitle: `Add explanation: how "${event.title}" affects Aciah`,
      });
    }
  }

  const seenTransfers = new Map<string, string>();
  for (const entry of finances) {
    if (entry.excluded) continue;
    const base = { recordType: "finance" as const, recordId: entry.id };
    if (!(entry.evidenceIds ?? []).length) {
      gaps.push({
        ...base,
        id: `${entry.id}-noreceipt`,
        kind: "finance-no-receipt",
        severity: "high",
        label: "No receipt or bank proof",
        detail: `${entry.date} — ${entry.label} (${entry.currency} ${entry.amount})`,
        taskTitle: `Find receipt for ${entry.label}`,
      });
    }
    const key =
      entry.transferKey ??
      `${entry.date}|${entry.amount}|${entry.currency}|${(entry.merchant ?? entry.label).toLowerCase()}`;
    const prior = seenTransfers.get(key);
    if (prior) {
      gaps.push({
        ...base,
        id: `${entry.id}-dupe`,
        kind: "finance-duplicate",
        severity: "medium",
        label: "Looks like the same transaction as another entry",
        detail: `${entry.date} — ${entry.label}`,
        taskTitle: `Check duplicate expense ${entry.label}`,
      });
    } else {
      seenTransfers.set(key, entry.id);
    }
  }

  for (const task of tasks) {
    if (taskStatus(task) === "Complete") continue;
    if (task.dueDate && task.dueDate < today) {
      gaps.push({
        recordType: "task",
        recordId: task.id,
        id: `${task.id}-overdue`,
        kind: "task-overdue",
        severity: "medium",
        label: "Task is past its due date",
        detail: task.title,
        taskTitle: task.title,
      });
    }
  }

  return gaps.filter((g) => !openTaskTitles.includes(g.taskTitle.toLowerCase()));
}

export type CoverageLabel = "Good evidence coverage" | "Developing" | "Needs supporting evidence";

export interface CategoryCoverage {
  category: Category;
  items: number;
  ready: number;
  events: number;
  sourceMix: { source: string; count: number }[];
  recentDate: string;
  gapCount: number;
  label: CoverageLabel;
}

export function categoryCoverage(
  items: EvidenceItem[],
  events: HardshipEvent[],
  categories: Category[],
  gaps: CaseGap[],
): CategoryCoverage[] {
  return categories.map((category) => {
    const rows = items.filter((i) => catsOf(i).includes(category));
    const evts = events.filter((e) => eventCats(e).includes(category));
    const mixMap = new Map<string, number>();
    for (const row of rows) mixMap.set(row.sourceType, (mixMap.get(row.sourceType) ?? 0) + 1);
    const ready = rows.filter((i) => READY_STATUSES.includes(i.status)).length;
    const ids = new Set([...rows.map((r) => r.id), ...evts.map((e) => e.id)]);
    const gapCount = gaps.filter((g) => ids.has(g.recordId)).length;
    const distinctSources = mixMap.size;
    const label: CoverageLabel =
      rows.length >= 3 && ready >= 2 && distinctSources >= 2
        ? "Good evidence coverage"
        : rows.length >= 1
          ? "Developing"
          : "Needs supporting evidence";
    return {
      category,
      items: rows.length,
      ready,
      events: evts.length,
      sourceMix: [...mixMap.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      recentDate:
        rows
          .map((r) => r.dateOfDocument)
          .filter(Boolean)
          .sort()
          .at(-1) ?? "",
      gapCount,
      label,
    };
  });
}

export const SEPARATION_DATE = CASE_SETTINGS.separationStartDate;

/**
 * Documents the hardship diary refers to (appendix A1, A24 …) that are not in the vault.
 * Purely organisational: it says what is missing, never what it would prove.
 */
export function detectDiaryGaps(diaryImports: DiaryImport[], items: EvidenceItem[]): CaseGap[] {
  if (!diaryImports.length) return [];
  const haveRefs = new Set(
    items.flatMap((i) => (i.appendixRefs ?? []).map((r) => r.toUpperCase())),
  );
  const seen = new Set<string>();
  const gaps: CaseGap[] = [];
  for (const imported of diaryImports) {
    for (const link of imported.appendix) {
      const ref = link.ref.toUpperCase();
      if (link.evidenceId || haveRefs.has(ref) || seen.has(ref)) continue;
      seen.add(ref);
      gaps.push({
        id: `diary-${imported.id}-${ref}`,
        kind: "diary-appendix-missing",
        label: `${link.ref} referenced in the hardship diary — document not found`,
        detail: `${link.description || "Referred to in the diary"} (diary page ${link.pages.join(", ") || "?"}).`,
        severity: "medium",
        recordType: "evidence",
        recordId: imported.masterEvidenceId ?? "",
        taskTitle: `Obtain ${link.ref} — ${link.description || "referenced in hardship diary"}`,
      });
    }
  }
  return gaps;
}
