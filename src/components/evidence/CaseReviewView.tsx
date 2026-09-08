import { AlertTriangle, ClipboardList, HeartHandshake, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TasksView } from "@/components/evidence/TasksView";
import { formatDate, formatDateTime } from "@/lib/evidence/format";
import { aciahImpactState, type CaseGap } from "@/lib/evidence/review";
import { useEvidence } from "@/lib/evidence/store";
import { taskStatus } from "@/lib/evidence/types";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-panel">
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl leading-none font-semibold text-foreground">
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const COVERAGE_STYLE: Record<string, string> = {
  "Good evidence coverage": "border-success/45 bg-success/12 text-foreground",
  Developing: "border-warning/45 bg-warning/12 text-foreground",
  "Needs supporting evidence": "border-destructive/40 bg-destructive/10 text-foreground",
};

export function CaseReviewView({
  onAddTask,
  onBuildPacket,
}: {
  onAddTask: () => void;
  onBuildPacket: () => void;
}) {
  const {
    stats,
    gaps,
    coverage,
    items,
    events,
    finances,
    tasks,
    addTask,
    openInspector,
    profile,
    resolveConflict,
    markAllReady,
  } = useEvidence();

  const uncategorised = items.filter(
    (i) => !(i.categories?.length ? i.categories : [i.category]).filter(Boolean).length,
  ).length;
  const duplicates = items.filter((i) => i.duplicateSuspected || i.duplicateOfId).length;
  const eventsNoEvidence = events.filter((e) => !(e.evidenceIds ?? []).length).length;
  const financeNoProof = finances.filter(
    (f) => !f.excluded && !(f.evidenceIds ?? []).length,
  ).length;
  const conflicts = items.filter((i) => (i.aiConflicts?.length ?? 0) > 0);

  const aciahChecks = [
    ...events.map((e) => ({
      id: e.id,
      kind: "Event" as const,
      title: e.title,
      date: e.date,
      state: aciahImpactState(e),
    })),
    ...items
      .filter((i) => (i.people ?? []).includes("Jibril"))
      .map((i) => ({
        id: i.id,
        kind: "Evidence" as const,
        title: i.title || i.fileName,
        date: i.dateOfDocument,
        state: aciahImpactState(i),
      })),
  ];
  const needsExplanation = aciahChecks.filter((c) => c.state === "Needs explanation");

  function makeTask(gap: CaseGap) {
    addTask({
      title: gap.taskTitle,
      category: "",
      dueDate: "",
      done: false,
      assignedTo: profile,
      status: "To do",
      priority: gap.severity === "high" ? "High" : "Normal",
      notes: `${gap.label} — ${gap.detail}`,
      ...(gap.recordType === "evidence" ? { evidenceIds: [gap.recordId] } : {}),
      ...(gap.recordType === "event" ? { eventId: gap.recordId } : {}),
      ...(gap.recordType === "finance" ? { financeId: gap.recordId } : {}),
    });
  }

  return (
    <div className="space-y-4">
      <Button className="h-11 w-full" onClick={onBuildPacket}>
        Build case packet
      </Button>
      <Button variant="outline" className="h-11 w-full" onClick={markAllReady}>
        Mark every document as Ready
      </Button>
      <div>
        <h2 className="text-sm font-semibold text-foreground">Case review</h2>
        <p className="text-[11px] text-muted-foreground">
          How complete and well organised the evidence is. These are organisation measures only —
          they say nothing about how the application will be decided.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="gaps" className="text-xs">
            Gaps ({gaps.length})
          </TabsTrigger>
          <TabsTrigger value="aciah" className="text-xs">
            Aciah impact
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs">
            Tasks ({tasks.filter((t) => taskStatus(t) !== "Complete").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Exhibits" value={String(stats.total)} hint={`${stats.totalPages} pages`} />
            <Stat label="Reviewed & ready" value={String(stats.ready)} />
            <Stat label="Needs confirmation" value={String(stats.needsConfirmation)} />
            <Stat label="Missing supporting evidence" value={String(stats.gaps)} />
            <Stat label="Duplicate suspects" value={String(duplicates)} />
            <Stat label="Translation needed" value={String(stats.missingTranslation)} />
            <Stat label="Uncategorised" value={String(uncategorised)} />
            <Stat label="Events without evidence" value={String(eventsNoEvidence)} />
            <Stat label="Expenses without proof" value={String(financeNoProof)} />
            <Stat label="Open tasks" value={String(stats.openTasks)} />
            <Stat label="Unresolved gaps" value={String(gaps.length)} />
            <Stat
              label="Last edited"
              value={stats.lastEditedAt ? formatDate(stats.lastEditedAt) : "—"}
              hint={stats.lastEditedAt ? formatDateTime(stats.lastEditedAt) : "Nothing yet"}
            />
          </div>

          {conflicts.length > 0 && (
            <section className="rounded-xl border border-warning/50 bg-warning/10 p-3">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
                <Sparkles className="size-3.5" /> AI found possible conflicts
              </h3>
              <ul className="mt-2 space-y-2">
                {conflicts.flatMap((item) =>
                  (item.aiConflicts ?? []).map((c) => (
                    <li
                      key={`${item.id}-${c.field}`}
                      className="rounded-lg border border-border bg-card p-2.5"
                    >
                      <p className="text-xs text-foreground">
                        {item.exhibitId} · {c.field}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        You confirmed “{c.existing}”. A later AI read suggested “{c.aiValue}”.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-[11px]"
                          onClick={() => resolveConflict(item.id, c.field, false)}
                        >
                          Keep existing
                        </Button>
                        <Button
                          size="sm"
                          className="h-9 text-[11px]"
                          onClick={() => resolveConflict(item.id, c.field, true)}
                        >
                          Use AI value
                        </Button>
                      </div>
                    </li>
                  )),
                )}
              </ul>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
            <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Hardship coverage
            </h3>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {coverage.map((row) => (
                <div
                  key={row.category}
                  className={`rounded-lg border p-2.5 ${COVERAGE_STYLE[row.label] ?? "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">{row.category}</p>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {row.label}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {row.items} evidence · {row.events} events · {row.ready} ready · {row.gapCount}{" "}
                    gaps
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {row.sourceMix.length
                      ? row.sourceMix.map((s) => `${s.count} ${s.source}`).join(", ")
                      : "No sources yet"}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Most recent: {row.recentDate ? formatDate(row.recentDate) : "—"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="gaps" className="mt-3">
          {gaps.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
              No outstanding gaps found in what is stored today.
            </p>
          ) : (
            <ul className="space-y-2">
              {gaps.map((gap) => (
                <li
                  key={gap.id}
                  className="rounded-xl border border-border bg-card p-3 shadow-panel"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={`mt-0.5 size-3.5 shrink-0 ${
                        gap.severity === "high"
                          ? "text-destructive"
                          : gap.severity === "medium"
                            ? "text-warning"
                            : "text-muted-foreground"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">{gap.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{gap.detail}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {gap.recordType === "evidence" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-[11px]"
                        onClick={() => openInspector(gap.recordId)}
                      >
                        Open exhibit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-[11px]"
                      onClick={() => makeTask(gap)}
                    >
                      <ClipboardList className="size-3.5" /> Create task
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="aciah" className="mt-3 space-y-3">
          <div className="rounded-xl border border-border bg-card p-3 shadow-panel">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <HeartHandshake className="size-3.5" /> Is the impact on Aciah clear?
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Aciah is the qualifying relative. Evidence about Jibril is kept as it is — you are
              only asked to record how the issue affects Aciah where that is factually true.
            </p>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              {aciahChecks.length - needsExplanation.length} of {aciahChecks.length} records have
              the impact recorded.
            </p>
          </div>
          {needsExplanation.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
              Nothing is waiting for an explanation.
            </p>
          ) : (
            <ul className="space-y-2">
              {needsExplanation.map((c) => (
                <li key={c.id} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-medium text-foreground">{c.title}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {c.kind} · {c.date ? formatDate(c.date) : "no date"} · Needs explanation
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.kind === "Evidence" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-[11px]"
                        onClick={() => openInspector(c.id)}
                      >
                        Add explanation
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-[11px]"
                      onClick={() =>
                        addTask({
                          title: `Add explanation: how "${c.title}" affects Aciah`,
                          category: "",
                          dueDate: "",
                          done: false,
                          assignedTo: profile,
                          status: "To do",
                          priority: "Normal",
                          ...(c.kind === "Evidence" ? { evidenceIds: [c.id] } : { eventId: c.id }),
                        })
                      }
                    >
                      Create task
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-3">
          <TasksView onAddTask={onAddTask} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
