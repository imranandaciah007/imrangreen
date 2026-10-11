import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, EyeOff, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CaseProgressPanel } from "@/components/evidence/CaseProgressPanel";
import { FixWizard } from "@/components/evidence/FixWizard";
import { TasksView } from "@/components/evidence/TasksView";
import { formatDate } from "@/lib/evidence/format";
import type { CaseGap } from "@/lib/evidence/review";
import { useEvidence } from "@/lib/evidence/store";
import { taskStatus } from "@/lib/evidence/types";

const COVERAGE_STYLE: Record<string, string> = {
  "Good evidence coverage": "border-success/45 bg-success/12 text-foreground",
  Developing: "border-warning/45 bg-warning/12 text-foreground",
  "Needs supporting evidence": "border-destructive/40 bg-destructive/10 text-foreground",
};

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const PAGE = 15;

/**
 * One list of everything that needs a look, one row per document or entry,
 * most important first, with a Start button that walks through them in turn.
 */
export function CaseReviewView({
  onAddTask,
  onOpenCategory,
  onOpenFolders,
  onOpenTimeline,
  onOpenFinances,
  focusTasks = false,
}: {
  onAddTask: () => void;
  onOpenCategory: (category: string) => void;
  onOpenFolders: () => void;
  onOpenTimeline: () => void;
  onOpenFinances: () => void;
  /** Open with the task list unfolded (from the reminders bell). */
  focusTasks?: boolean;
}) {
  const { gaps, coverage, items, events, finances, tasks, openInspector, resolveConflict, ignoreGap } =
    useEvidence();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStart, setWizardStart] = useState<string | undefined>(undefined);
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    const byRecord = new Map<string, CaseGap[]>();
    for (const gap of gaps) {
      const key = `${gap.recordType}:${gap.recordId}`;
      byRecord.set(key, [...(byRecord.get(key) ?? []), gap]);
    }
    const titleOf = (gap: CaseGap) => {
      if (gap.recordType === "evidence") {
        const item = items.find((i) => i.id === gap.recordId);
        return item ? item.title || item.fileName : "Document";
      }
      if (gap.recordType === "event") return events.find((e) => e.id === gap.recordId)?.title ?? "Event";
      if (gap.recordType === "finance") {
        const f = finances.find((x) => x.id === gap.recordId);
        return f?.label || "Expense";
      }
      return tasks.find((t) => t.id === gap.recordId)?.title ?? "Task";
    };
    return [...byRecord.values()]
      .map((list) => ({
        first: list[0]!,
        title: titleOf(list[0]!),
        issues: list,
        rank: Math.min(...list.map((g) => SEVERITY_RANK[g.severity])),
      }))
      .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  }, [gaps, items, events, finances, tasks]);

  const evidenceIds = rows.filter((r) => r.first.recordType === "evidence").map((r) => r.first.recordId);
  const openTasks = tasks.filter((t) => taskStatus(t) !== "Complete").length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-panel">
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-5 text-success" /> All done. Nothing needs checking right now.
          </p>
        ) : (
          <>
            <div>
              <h2 className="font-display text-lg font-black text-foreground">
                {rows.length} thing{rows.length === 1 ? "" : "s"} to check
              </h2>
              <p className="text-xs text-muted-foreground">
                Most important first. Start walks you through the documents one at a time.
              </p>
            </div>
            {evidenceIds.length > 0 && (
              <Button
                className="h-12 w-full"
                onClick={() => {
                  setWizardStart(undefined);
                  setWizardOpen(true);
                }}
              >
                <Wand2 className="size-4" /> Start
              </Button>
            )}
          </>
        )}
      </section>

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.slice(0, shown).map((row) => {
            const { first } = row;
            const item = first.recordType === "evidence" ? items.find((i) => i.id === first.recordId) : undefined;
            return (
              <li key={`${first.recordType}:${first.recordId}`} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={`mt-0.5 size-4 shrink-0 ${
                      row.rank === 0 ? "text-destructive" : row.rank === 1 ? "text-warning" : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.issues.map((g) => g.label).join(" · ")}</p>
                  </div>
                </div>
                {(item?.aiConflicts ?? []).map((c) => (
                  <div key={c.field} className="mt-2 rounded-lg bg-secondary/50 p-2 text-xs">
                    <p className="text-muted-foreground">
                      {c.field}: you confirmed “{c.existing}”, a later reading suggested “{c.aiValue}”.
                    </p>
                    <div className="mt-1.5 flex gap-2">
                      <Button size="sm" variant="outline" className="h-9 text-[11px]" onClick={() => resolveConflict(item!.id, c.field, false)}>
                        Keep mine
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-[11px]" onClick={() => resolveConflict(item!.id, c.field, true)}>
                        Use the new one
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="mt-2 flex flex-wrap gap-2">
                  {first.recordType === "evidence" ? (
                    <>
                      <Button
                        size="sm"
                        className="h-9 text-[11px]"
                        onClick={() => {
                          setWizardStart(first.recordId);
                          setWizardOpen(true);
                        }}
                      >
                        Fix
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 text-[11px]" onClick={() => openInspector(first.recordId)}>
                        View
                      </Button>
                    </>
                  ) : first.recordType === "event" ? (
                    <Button size="sm" variant="outline" className="h-9 text-[11px]" onClick={onOpenTimeline}>
                      Open timeline
                    </Button>
                  ) : first.recordType === "finance" ? (
                    <Button size="sm" variant="outline" className="h-9 text-[11px]" onClick={onOpenFinances}>
                      Open finances
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-[11px] text-muted-foreground"
                    onClick={() => row.issues.forEach((g) => ignoreGap(g.id))}
                  >
                    <EyeOff className="size-3.5" /> Ignore
                  </Button>
                </div>
              </li>
            );
          })}
          {rows.length > shown && (
            <li>
              <Button variant="outline" className="h-10 w-full text-xs" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({rows.length - shown} left)
              </Button>
            </li>
          )}
        </ul>
      )}

      <details className="rounded-xl border border-border bg-card p-3" open={focusTasks}>
        <summary className="cursor-pointer select-none text-sm font-semibold text-foreground">
          Your tasks ({openTasks})
        </summary>
        <div className="mt-3">
          <TasksView onAddTask={onAddTask} />
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer select-none text-sm font-semibold text-foreground">
          Case progress
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            {coverage.map((row) => (
              <button
                type="button"
                key={row.category}
                onClick={() => onOpenCategory(row.category)}
                className={`rounded-lg border p-2.5 text-left ${COVERAGE_STYLE[row.label] ?? "border-border"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">{row.category}</p>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {row.label}
                  </Badge>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {row.items} documents · {row.events} events
                  {row.recentDate ? ` · latest ${formatDate(row.recentDate)}` : ""}
                </p>
              </button>
            ))}
          </div>
          <CaseProgressPanel onOpenCategory={onOpenCategory} onOpenBoard={onOpenFolders} />
        </div>
      </details>

      <FixWizard open={wizardOpen} onOpenChange={setWizardOpen} itemIds={evidenceIds} startId={wizardStart} />
    </div>
  );
}
