import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  CheckSquare,
  Coins,
  FileStack,
  FileText,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";

function Metric({
  label,
  value,
  hint,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  onClick?: (() => void) | undefined;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-auto min-h-28 w-full flex-col items-stretch justify-between rounded-lg border border-border bg-card p-4 text-left shadow-panel transition-all hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-extrabold text-muted-foreground">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          {icon}
        </span>
      </div>
      <div>
        <div className="font-display text-3xl leading-none font-extrabold text-foreground">{value}</div>
        {hint && <div className="mt-1 text-[11px] font-medium text-muted-foreground">{hint}</div>}
      </div>
    </Button>
  );
}

export function HomeView({
  onNavigate,
  onBuildPacket,
}: {
  onNavigate: (tab: "timeline" | "finances" | "vault" | "review") => void;
  onBuildPacket: () => void;
}) {
  const { stats, caseSettings, tasks, events, gaps } = useEvidence();
  const gbp = (n: number) => `£${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const openTasks = tasks.filter((t) => !t.done).slice(0, 4);
  const recentEvents = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-panel sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-extrabold text-foreground">Case packet</h2>
            <p className="text-xs text-muted-foreground">
              Review gaps, number exhibits and prepare the current case bundle.
            </p>
          </div>
        </div>
        <Button className="h-10 w-full sm:w-auto" onClick={onBuildPacket}>
          Open packet builder <ChevronRight className="size-4" />
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4 xl:gap-4">
        <Metric
          label="Exhibits"
          onClick={() => onNavigate("vault")}
          value={String(stats.total)}
          hint={`${stats.totalPages.toLocaleString()} pages`}
          icon={<FileStack className="size-3.5" />}
        />
        <Metric
          label="Reviewed & ready"
          onClick={() => onNavigate("vault")}
          value={String(stats.ready)}
          hint={`${stats.needsConfirmation} need confirmation`}
          icon={<ShieldCheck className="size-3.5" />}
        />
        <Metric
          label="Unresolved gaps"
          onClick={() => onNavigate("review")}
          value={String(gaps.length)}
          hint={`${stats.missingTranslation} need translation`}
          icon={<AlertTriangle className="size-3.5" />}
        />
        <Metric
          label="Separation costs"
          onClick={() => onNavigate("finances")}
          value={gbp(stats.financialImpact)}
          hint={`Since ${formatDate(caseSettings.separationStartDate)}`}
          icon={<Coins className="size-3.5" />}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
        <section className="rounded-xl border border-border bg-card p-4 shadow-panel sm:p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <h2 className="font-display text-base font-extrabold text-foreground">Hardship coverage</h2>
              <p className="truncate text-[11px] text-muted-foreground">Organisation and review status by category</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("review")}>Review</Button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            {stats.byCategory.slice(0, 8).map((row) => (
              <div key={row.category}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-bold text-foreground">{row.category}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{row.ready}/{row.total}</span>
                </div>
                <Progress value={row.percent} className="mt-1.5 h-1.5" />
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <Button
          variant="ghost"
          className="h-auto min-h-36 w-full flex-col items-stretch justify-start rounded-xl border border-border bg-card p-4 text-left shadow-panel hover:bg-accent/30"
          onClick={() => onNavigate("review")}
        >
          <div className="flex items-center justify-between"><h2 className="font-display text-base font-extrabold">Open tasks</h2><CheckSquare className="size-4 text-destructive" /></div>
          {openTasks.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Nothing outstanding.</p>
          ) : (
            <div className="mt-3 space-y-2">{openTasks.slice(0, 3).map((t) => <p key={t.id} className="truncate text-xs font-semibold">{t.title}</p>)}</div>
          )}
        </Button>

        <Button
          variant="ghost"
          className="h-auto min-h-36 w-full flex-col items-stretch justify-start rounded-xl border border-border bg-card p-4 text-left shadow-panel hover:bg-accent/30"
          onClick={() => onNavigate("timeline")}
        >
          <div className="flex items-center justify-between"><h2 className="font-display text-base font-extrabold">Recent timeline</h2><CalendarClock className="size-4 text-primary" /></div>
          {recentEvents.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No events recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-2">{recentEvents.slice(0, 3).map((e) => <p key={e.id} className="truncate text-xs font-semibold">{e.title} <span className="font-mono text-[10px] text-muted-foreground">{formatDate(e.date)}</span></p>)}</div>
          )}
        </Button>
        </div>
      </div>
    </div>
  );
}
