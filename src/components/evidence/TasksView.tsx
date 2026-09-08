import { CheckCircle2, Clock, ListTodo, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatDateTime } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { TASK_STATUSES, taskStatus, type CaseTask, type TaskStatus } from "@/lib/evidence/types";

const COLUMNS: { status: TaskStatus; icon: typeof ListTodo }[] = [
  { status: "To do", icon: ListTodo },
  { status: "Waiting", icon: Clock },
  { status: "Complete", icon: CheckCircle2 },
];

export function TasksView({ onAddTask }: { onAddTask: () => void }) {
  const { tasks, updateTask, deleteTask, items, events, finances, openInspector } = useEvidence();
  const today = new Date().toISOString().slice(0, 10);

  function linked(task: CaseTask) {
    const parts: string[] = [];
    const evidence = (task.evidenceIds ?? [])
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean);
    if (evidence.length) parts.push(evidence.map((e) => e!.exhibitId).join(", "));
    const event = task.eventId ? events.find((e) => e.id === task.eventId) : undefined;
    if (event) parts.push(`Event: ${event.title}`);
    const finance = task.financeId ? finances.find((f) => f.id === task.financeId) : undefined;
    if (finance) parts.push(`Expense: ${finance.label}`);
    return { parts, evidenceIds: evidence.map((e) => e!.id) };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
          <p className="text-[11px] text-muted-foreground">
            Everything still to collect, chase or explain. {tasks.filter((t) => !t.done).length} open.
          </p>
        </div>
        <Button size="sm" className="h-10" onClick={onAddTask}>
          <Plus className="size-4" /> Add task
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNS.map(({ status, icon: Icon }) => {
          const rows = tasks
            .filter((t) => taskStatus(t) === status)
            .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
          return (
            <section
              key={status}
              className="rounded-xl border border-border bg-card p-3 shadow-panel"
            >
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                <Icon className="size-3.5" /> {status}
                <span className="ml-auto font-mono">{rows.length}</span>
              </h3>
              {rows.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nothing here.</p>
              ) : (
                <ul className="mt-2.5 space-y-2">
                  {rows.map((task) => {
                    const link = linked(task);
                    const overdue =
                      status !== "Complete" && task.dueDate && task.dueDate < today;
                    return (
                      <li
                        key={task.id}
                        className="rounded-lg border border-border bg-background p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-foreground">{task.title}</p>
                          <button
                            type="button"
                            aria-label="Delete task"
                            onClick={() => deleteTask(task.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {task.assignedTo}
                          </Badge>
                          {task.priority && task.priority !== "Normal" && (
                            <Badge
                              variant={task.priority === "High" ? "destructive" : "secondary"}
                              className="text-[10px]"
                            >
                              {task.priority}
                            </Badge>
                          )}
                          {task.dueDate && (
                            <span
                              className={`font-mono text-[10px] ${
                                overdue ? "text-destructive" : "text-muted-foreground"
                              }`}
                            >
                              due {formatDate(task.dueDate)}
                              {overdue ? " · overdue" : ""}
                            </span>
                          )}
                          {task.category && (
                            <span className="truncate text-[10px] text-muted-foreground">
                              {task.category}
                            </span>
                          )}
                        </div>
                        {task.notes && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">{task.notes}</p>
                        )}
                        {link.parts.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              link.evidenceIds[0] && openInspector(link.evidenceIds[0])
                            }
                            className="mt-1.5 block w-full truncate rounded-md bg-secondary/60 px-2 py-1 text-left text-[10px] text-foreground"
                          >
                            Linked: {link.parts.join(" · ")}
                          </button>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <Select
                            value={taskStatus(task)}
                            onValueChange={(v) => updateTask(task.id, { status: v as TaskStatus })}
                          >
                            <SelectTrigger className="h-9 flex-1 text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TASK_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                          Last edited: {formatDateTime(task.updatedAt)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
