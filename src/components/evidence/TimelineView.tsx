import { CalendarPlus, CheckSquare, Square, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { cn } from "@/lib/utils";

export function TimelineView({
  onAddEvent,
  onAddTask,
}: {
  onAddEvent: () => void;
  onAddTask: () => void;
}) {
  const { events, deleteEvent, tasks, toggleTask, deleteTask, caseSettings } = useEvidence();
  const ordered = [...events].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card shadow-panel">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Hardship timeline
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Separated since {formatDate(caseSettings.separationStartDate)}
            </p>
          </div>
          <Button size="sm" className="h-9" onClick={onAddEvent}>
            <CalendarPlus className="size-4" /> Add event
          </Button>
        </header>

        {ordered.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">
            No events yet. Add the moments that show the effect on Aciah and Jibril.
          </p>
        ) : (
          <ol className="space-y-0 divide-y divide-border/70">
            {ordered.map((e) => (
              <li key={e.id} className="flex gap-3 px-3 py-3">
                <div className="w-16 shrink-0 font-mono text-[10px] text-muted-foreground">
                  {formatDate(e.date)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{e.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{e.category}</p>
                  {e.description && (
                    <p className="mt-1 text-xs text-foreground/80">{e.description}</p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
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
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card shadow-panel">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Tasks
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
    </div>
  );
}
