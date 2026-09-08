import { useMemo, useState } from "react";
import { CalendarPlus, CheckSquare, Flag, Square, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EvidencePicker, LinkedEvidenceChips } from "@/components/evidence/EvidencePicker";
import { formatDate, formatDateTime } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { cn } from "@/lib/utils";
import { PEOPLE } from "@/lib/evidence/types";

type Range = "all" | "since" | "before";

function monthsBetween(fromIso: string, to: Date) {
  const from = new Date(fromIso);
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000);
  return { days: Math.max(0, days), months: Math.max(0, Math.floor(days / 30.44)) };
}

export function TimelineView({
  onAddEvent,
  onAddTask,
}: {
  onAddEvent: () => void;
  onAddTask: () => void;
}) {
  const {
    events,
    updateEvent,
    deleteEvent,
    tasks,
    toggleTask,
    deleteTask,
    caseSettings,
    categories,
    finances,
  } = useEvidence();

  const [range, setRange] = useState<Range>("since");
  const [person, setPerson] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [linkFor, setLinkFor] = useState<string | null>(null);

  const separation = caseSettings.separationStartDate;
  const elapsed = monthsBetween(separation, new Date());

  const sinceEvents = useMemo(() => events.filter((e) => e.date >= separation), [events, separation]);
  const filtered = useMemo(() => {
    return [...events]
      .filter((e) =>
        range === "since" ? e.date >= separation : range === "before" ? e.date < separation : true,
      )
      .filter((e) => (person ? (e.people ?? []).includes(person) : true))
      .filter((e) => (category ? e.category === category : true))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [events, range, person, category, separation]);

  const linkedEvidenceCount = new Set(sinceEvents.flatMap((e) => e.evidenceIds ?? [])).size;
  const documentedGbp = finances
    .filter((f) => f.date >= separation)
    .reduce((s, f) => s + (f.currency === "USD" ? f.amount * 0.79 : f.amount), 0);
  const openFollowUps = tasks.filter((t) => !t.done).length;

  const linkTarget = events.find((e) => e.id === linkFor) ?? null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-navy/25 bg-navy p-3.5 text-navy-foreground shadow-panel">
        <div className="flex items-center gap-2">
          <Flag className="size-4" />
          <h2 className="text-[11px] font-semibold tracking-wider uppercase">
            Since {formatDate(separation)} — family separation begins
          </h2>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[
            { k: "Separated", v: `${elapsed.days} days`, h: `${elapsed.months} months` },
            { k: "Hardship events", v: String(sinceEvents.length) },
            { k: "Linked evidence", v: String(linkedEvidenceCount) },
            {
              k: "Documented cost",
              v: `£${Math.round(documentedGbp).toLocaleString()}`,
            },
            { k: "Open follow-ups", v: String(openFollowUps) },
          ].map((m) => (
            <div key={m.k}>
              <dt className="text-[10px] tracking-wider text-navy-foreground/65 uppercase">
                {m.k}
              </dt>
              <dd className="mt-0.5 font-mono text-xl leading-none font-semibold">{m.v}</dd>
              {m.h && (
                <dd className="mt-0.5 font-mono text-[10px] text-navy-foreground/60">{m.h}</dd>
              )}
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-panel">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Hardship timeline
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Effects on Aciah first, with Jibril and the wider family noted alongside.
            </p>
          </div>
          <Button size="sm" className="h-9" onClick={onAddEvent}>
            <CalendarPlus className="size-4" /> Add event
          </Button>
        </header>

        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
          {(
            [
              ["since", `Since ${formatDate(separation)}`],
              ["before", "Before separation"],
              ["all", "All"],
            ] as [Range, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setRange(id)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px]",
                range === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-border" />
          {PEOPLE.map((p) => (
            <button
              key={p}
              onClick={() => setPerson((prev) => (prev === p ? "" : p))}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px]",
                person === p
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {p}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-border" />
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory((prev) => (prev === c ? "" : c))}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px]",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <ol className="divide-y divide-border/70">
          {filtered.map((e) => (
            <li key={e.id} className="flex gap-3 px-3 py-3">
              <div className="w-16 shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatDate(e.date)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{e.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{e.category}</p>
                {e.description && <p className="mt-1 text-xs text-foreground/80">{e.description}</p>}
                <LinkedEvidenceChips
                  ids={e.evidenceIds ?? []}
                  onEdit={() => setLinkFor(e.id)}
                />
                <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                  {(e.people ?? []).join(", ")} · Last edited {formatDateTime(e.updatedAt)} by{" "}
                  {e.lastEditedBy}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-destructive"
                aria-label="Delete event"
                onClick={() => deleteEvent(e.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
          <li className="flex gap-3 bg-muted/40 px-3 py-3">
            <div className="w-16 shrink-0 font-mono text-[10px] font-semibold text-foreground">
              {formatDate(separation)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Flag className="size-3.5" /> Family separation begins
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Permanent milestone — the start of the “since separation” view.
              </p>
            </div>
          </li>
        </ol>
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No events in this view yet.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card shadow-panel">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Follow-ups
          </h2>
          <Button size="sm" variant="outline" className="h-9" onClick={onAddTask}>
            <CheckSquare className="size-4" /> Add task
          </Button>
        </header>
        {tasks.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">No tasks yet.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => toggleTask(t.id)}
                  aria-label={t.done ? "Mark as not done" : "Mark as done"}
                  className="flex size-9 shrink-0 items-center justify-center text-muted-foreground"
                >
                  {t.done ? (
                    <CheckSquare className="size-5 text-success" />
                  ) : (
                    <Square className="size-5" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm text-foreground",
                      t.done && "text-muted-foreground line-through",
                    )}
                  >
                    {t.title}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t.assignedTo}
                    {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                    {t.category ? ` · ${t.category}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-destructive"
                  aria-label="Delete task"
                  onClick={() => deleteTask(t.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EvidencePicker
        open={linkFor !== null}
        onOpenChange={(v) => setLinkFor(v ? linkFor : null)}
        selected={linkTarget?.evidenceIds ?? []}
        onChange={(ids) => linkTarget && updateEvent(linkTarget.id, { evidenceIds: ids })}
      />
    </div>
  );
}
