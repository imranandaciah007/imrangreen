import { Bell, ChevronLeft, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEvidence } from "@/lib/evidence/store";
import { taskStatus } from "@/lib/evidence/types";
import type { MainTab } from "@/components/evidence/BottomNav";

const pageTitles: Record<MainTab, { title: string; subtitle: string }> = {
  home: { title: "Case overview", subtitle: "Where the case stands and what to do next" },
  documents: { title: "Documents", subtitle: "Every document, by folder or as a list" },
  timeline: { title: "Timeline", subtitle: "Hardship events since 18 August 2026" },
  finances: { title: "Financial strain", subtitle: "Costs of separation, with evidence" },
  review: { title: "Review", subtitle: "Things to check, and your tasks" },
};

export function AppHeader({
  tab,
  onOpenTasks,
  onSettings,
  onBack,
}: {
  tab: MainTab;
  onOpenTasks: () => void;
  onSettings: () => void;
  onBack: () => void;
}) {
  const { tasks } = useEvidence();
  const reminders = tasks.filter((t) => taskStatus(t) !== "Complete" && t.reminderAt);
  const page = pageTitles[tab];
  const iconButton =
    "size-11 text-navy-foreground/70 hover:bg-sidebar-accent/15 hover:text-navy-foreground sm:size-9";

  return (
    <header className="case-topbar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="grid min-h-[60px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 lg:px-8">
        {tab === "home" ? (
          <span className="w-2" />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={iconButton}
            onClick={onBack}
            aria-label="Go back to the previous page"
            title="Back"
          >
            <ChevronLeft className="size-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-black text-navy-foreground sm:text-lg">
            {page.title}
          </h1>
          <p className="mt-0.5 hidden truncate text-[10px] font-bold text-navy-foreground/50 min-[390px]:block">
            {page.subtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`relative ${iconButton}`}
            onClick={onOpenTasks}
            aria-label={`${reminders.length} reminders`}
            title="Reminders"
          >
            <Bell className="size-5" />
            {reminders.length ? (
              <span className="absolute right-1 top-1 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-black leading-4 text-destructive-foreground">
                {reminders.length}
              </span>
            ) : null}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={iconButton}
            onClick={onSettings}
            aria-label="Settings and tools"
            title="Settings"
          >
            <Settings className="size-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
