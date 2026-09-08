import {
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  CircleHelp,
  Coins,
  FileStack,
  Layers,
  ShieldCheck,
} from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { formatDate, formatDateTime } from "@/lib/evidence/format";
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
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`rounded-xl border border-border bg-card p-3.5 text-left shadow-panel ${
        onClick ? "transition-colors hover:border-primary/60 hover:bg-accent/40" : ""
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 font-mono text-2xl leading-none font-semibold text-foreground">
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </Tag>
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
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBuildPacket}
        className="flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3.5 text-left transition-colors hover:bg-primary/15"
      >
        <FileText className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Build case packet</span>
          <span className="block text-[11px] text-muted-foreground">
            Check the case, number the exhibits and export the bundle
          </span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
          label={`Cost since ${formatDate(caseSettings.separationStartDate)}`}
          onClick={() => onNavigate("finances")}
          value={gbp(stats.financialImpact)}
          hint="Recorded separation costs"
          icon={<Coins className="size-3.5" />}
        />
        <Metric
          label="Timeline events"
          onClick={() => onNavigate("timeline")}
          value={String(stats.timelineEvents)}
          icon={<CalendarClock className="size-3.5" />}
        />
        <Metric
          label="Open tasks"
          onClick={() => onNavigate("review")}
          value={String(stats.openTasks)}
          icon={<CheckSquare className="size-3.5" />}
        />
        <Metric
          label="Total pages"
          value={stats.totalPages.toLocaleString()}
          icon={<Layers className="size-3.5" />}
        />
        <Metric
          label="Last edited"
          value={stats.lastEditedAt ? formatDate(stats.lastEditedAt) : "—"}
          hint={stats.lastEditedAt ? formatDateTime(stats.lastEditedAt) : "Nothing recorded yet"}
          icon={<CircleHelp className="size-3.5" />}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Hardship coverage
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          How completely each category is organised and reviewed. This is an organisation measure
          only — it says nothing about the outcome of the case.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 md:grid-cols-2 xl:grid-cols-3">
          {stats.byCategory.map((row) => (
            <div key={row.category}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate font-medium text-foreground">{row.category}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {row.ready}/{row.total}
                </span>
              </div>
              <Progress value={row.percent} className="mt-1 h-1.5" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-panel"
          onClick={() => onNavigate("review")}
        >
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Open tasks
          </h2>
          {openTasks.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Nothing outstanding.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {openTasks.map((t) => (
                <li key={t.id} className="text-xs text-foreground">
                  {t.title}
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {t.assignedTo}
                    {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-panel"
          onClick={() => onNavigate("timeline")}
        >
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Latest timeline entries
          </h2>
          {recentEvents.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No events recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {recentEvents.map((e) => (
                <li key={e.id} className="text-xs text-foreground">
                  {e.title}
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {formatDate(e.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
