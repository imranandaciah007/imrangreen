import { useEffect, useState } from "react";
import { Bell, ChevronLeft, Home, ListTodo, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAiUsage, type AiUsageSummary } from "@/lib/ai-usage.functions";
import { useEvidence } from "@/lib/evidence/store";
import { taskStatus } from "@/lib/evidence/types";
import type { MainTab } from "@/components/evidence/BottomNav";

const pageTitles: Record<MainTab, { title: string; subtitle: string }> = {
  home: { title: "Case overview", subtitle: "Progress, sync and what needs attention" },
  board: { title: "File explorer", subtitle: "Your Drive folders, mirrored" },
  timeline: { title: "Timeline", subtitle: "Hardship events since 18 August 2026" },
  finances: { title: "Financial strain", subtitle: "Costs of separation, with evidence" },
  review: { title: "Case review", subtitle: "Coverage, gaps and missing details" },
  vault: { title: "Evidence vault", subtitle: "Every exhibit, filter and index" },
};

function formatWhen(iso: string | null) {
  if (!iso) return "not used yet";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppHeader({
  tab,
  onSearch,
  onOpenTasks,
  onAddTask,
  onHome,
  onBack,
}: {
  tab: MainTab;
  onSearch: () => void;
  onOpenTasks: () => void;
  onAddTask: () => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { tasks } = useEvidence();
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      getAiUsage()
        .then((u) => {
          if (alive) setUsage(u);
        })
        .catch(() => undefined);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const openTasks = tasks.filter((t) => taskStatus(t) !== "Complete");
  const reminders = openTasks.filter((t) => t.reminderAt);
  const page = pageTitles[tab];

  const readerLabel = !usage
    ? "Checking reader"
    : !usage.geminiConfigured
      ? "Built-in reader"
      : usage.outOfCredit
        ? "Gemini limit hit"
        : "Gemini active";
  const readerTone = usage?.outOfCredit
    ? "border-destructive/50 bg-destructive/15 text-destructive-foreground"
    : "border-white/10 bg-white/5 text-white/80";

  return (
    <header className="case-topbar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-[64px] flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onBack}
            aria-label="Go back to the previous page"
            title="Back"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`size-9 hover:bg-white/10 hover:text-white ${
              tab === "home" ? "bg-white/10 text-white" : "text-white/70"
            }`}
            onClick={onHome}
            aria-label="Go to the main menu"
            title="Home"
          >
            <Home className="size-5" />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-black text-white sm:text-lg">
            {page.title}
          </h1>
          <p className="mt-0.5 truncate text-[10px] font-bold text-white/50">{page.subtitle}</p>
        </div>

        <div className="ml-auto hidden max-w-xs flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-white/60 xl:flex">
          <Search className="size-4" />
          <button onClick={onSearch} className="h-10 flex-1 text-left text-xs">
            Ask my evidence…
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* AI reader status */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold ${readerTone}`}
                aria-label="AI reader usage"
              >
                <Sparkles className="size-3.5" />
                <span className="hidden sm:inline">{readerLabel}</span>
                <span className="tabular-nums">{usage?.geminiToday ?? 0}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 text-xs">
              <p className="font-display text-sm font-black">AI reading usage</p>
              <p className="mt-1 text-muted-foreground">
                Google does not publish a remaining-credit figure for your key, so this shows what
                the app has actually used.
              </p>
              <ul className="mt-3 space-y-1.5">
                <li className="flex justify-between">
                  <span>Gemini reads today</span>
                  <strong className="tabular-nums">{usage?.geminiToday ?? 0}</strong>
                </li>
                <li className="flex justify-between">
                  <span>Gemini reads (30 days)</span>
                  <strong className="tabular-nums">{usage?.geminiMonth ?? 0}</strong>
                </li>
                <li className="flex justify-between">
                  <span>Tokens (30 days)</span>
                  <strong className="tabular-nums">
                    {(usage?.geminiTokensMonth ?? 0).toLocaleString()}
                  </strong>
                </li>
                <li className="flex justify-between">
                  <span>Paid built-in reads</span>
                  <strong className="tabular-nums">{usage?.fallbackMonth ?? 0}</strong>
                </li>
                <li className="flex justify-between">
                  <span>Last read</span>
                  <strong>{formatWhen(usage?.lastCallAt ?? null)}</strong>
                </li>
              </ul>
              {usage?.lastError ? (
                <p className="mt-3 rounded-md bg-destructive/10 p-2 text-[11px] font-semibold text-destructive">
                  Last Gemini problem ({formatWhen(usage.lastErrorAt)}): {usage.lastError}
                  <br />
                  The built-in reader steps in automatically so nothing stalls.
                </p>
              ) : null}
            </PopoverContent>
          </Popover>

          {/* Reminders */}
          <Button
            variant="ghost"
            size="icon"
            className="relative size-9 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onOpenTasks}
            aria-label={`${reminders.length} reminders`}
            title="Reminders"
          >
            <Bell className="size-4" />
            {reminders.length ? (
              <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-black leading-4 text-destructive-foreground">
                {reminders.length}
              </span>
            ) : null}
          </Button>

          {/* To-do list */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="relative flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11px] font-bold text-white/80"
                aria-label={`${openTasks.length} open tasks`}
              >
                <ListTodo className="size-3.5" />
                <span className="tabular-nums">{openTasks.length}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-black">To-do</p>
                <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={onAddTask}>
                  Add task
                </Button>
              </div>
              {openTasks.length === 0 ? (
                <p className="mt-3 text-muted-foreground">Nothing open. Everything is done.</p>
              ) : (
                <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {openTasks.slice(0, 12).map((task) => (
                    <li key={task.id} className="rounded-md border border-border/60 p-2">
                      <p className="font-semibold leading-snug">{task.title}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                        {taskStatus(task)}
                        {task.dueDate ? ` · due ${task.dueDate}` : ""}
                        {task.reminderAt ? " · reminder set" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8 w-full text-[11px]"
                onClick={onOpenTasks}
              >
                Open all tasks
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
