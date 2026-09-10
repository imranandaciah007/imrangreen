import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DollarSign,
  FileText,
  ListChecks,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { isOpenTask } from "@/lib/task-reminders";

function Metric({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "yellow" | "blue" | "orange" | "green";
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={`case-metric case-metric-${tone}`}
    >
      <span className="case-metric-icon">{icon}</span>
      <span className="min-w-0 text-left">
        <span className="block font-display text-[2rem] font-black leading-none text-navy">{value}</span>
        <span className="mt-1.5 block text-[11px] font-extrabold uppercase tracking-[.08em] text-navy/65">{label}</span>
      </span>
    </Button>
  );
}

export function HomeView({
  onNavigate,
  onUpload,
  onAddTask,
  onBuildPacket,
  onSyncDrive,
}: {
  onNavigate: (tab: "timeline" | "finances" | "vault" | "review") => void;
  onUpload: () => void;
  onAddTask: () => void;
  onBuildPacket: () => void;
  onSyncDrive: () => Promise<void>;
}) {
  const { stats, caseSettings, tasks, events, items, gaps, connection, driveSyncing, driveTree, scanProgress } = useEvidence();
  const gbp = (n: number) => `£${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const openTasks = tasks.filter(isOpenTask);
  const recentEvents = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const recentEvidence = [...items]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  const attentionRecords = new Set(gaps.map((gap) => `${gap.recordType}:${gap.recordId}`)).size;
  const indexedDriveIds = new Set(items.map((item) => item.driveFileId).filter(Boolean)).size;
  const otherDriveFiles = Math.max(0, (driveTree?.files.length ?? 0) - indexedDriveIds);

  return (
    <div className="case-home space-y-4">
      <section className="case-hero">
        <div className="case-hero-copy">
          <span className="case-kicker">CASE OVERVIEW</span>
          <h2>Good morning, Imran</h2>
          <p>
             {attentionRecords} record{attentionRecords === 1 ? "" : "s"} need supporting evidence or important details.
          </p>
        </div>
        <div className="case-hero-actions">
          <div className="flex flex-col items-start gap-1">
            <Button onClick={() => void onSyncDrive()} variant="outline" className="case-secondary-action" disabled={driveSyncing || scanProgress.running}>
               {driveSyncing || scanProgress.running ? <Loader2 className="animate-spin" /> : <RefreshCw />} {driveSyncing || scanProgress.running ? "Synching…" : "Synch now"}
            </Button>
            <span className="pl-1 text-[11px] font-semibold text-navy/60" aria-live="polite">
              {scanProgress.running
                ? `Scanning documents ${scanProgress.done}/${scanProgress.total} · ${scanProgress.cloned} clone(s) built`
                : driveSyncing
                ? "Synching with Drive…"
                : connection?.lastSyncedAt
                  ? `Last updated ${new Date(connection.lastSyncedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : "Not synched yet"}
            </span>
          </div>
          <Button onClick={onUpload} className="case-primary-action">
             <Upload /> Add evidence
          </Button>
          <Button onClick={onAddTask} variant="outline" className="case-secondary-action">
             <ListChecks /> Add task
          </Button>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs">
        <span className="font-bold text-foreground">Drive originals and enriched clones</span>
        <span className="text-muted-foreground">
          {driveTree ? `${driveTree.folders.length} folders · ${indexedDriveIds} evidence files${otherDriveFiles ? ` · ${otherDriveFiles} other files` : ""}` : "Not checked yet"}
          {connection?.lastSyncedAt ? ` · Last synched ${new Date(connection.lastSyncedAt).toLocaleString()}` : ""}
        </span>
      </section>

      <BackgroundBuildPanel />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Total Exhibits" value={String(stats.total)} icon={<FileText />} tone="yellow" onClick={() => onNavigate("vault")} />
        <Metric label="Reviewed & Ready" value={String(stats.ready)} icon={<CheckCircle2 />} tone="blue" onClick={() => onNavigate("vault")} />
        <Metric label="Open Tasks" value={String(openTasks.length)} icon={<Clock3 />} tone="orange" onClick={() => onNavigate("review")} />
        <Metric label="Separation Costs" value={gbp(stats.financialImpact)} icon={<DollarSign />} tone="green" onClick={() => onNavigate("finances")} />
      </section>

      <div className="case-dashboard-grid">
        <section className="case-panel">
          <div className="case-panel-heading">
            <div>
              <span className="case-kicker">CASE PROGRESS</span>
              <h3>Hardship Evidence Coverage</h3>
            </div>
            <Button variant="ghost" onClick={() => onNavigate("review")}>View details <ChevronRight /></Button>
          </div>
          <div className="case-coverage-list">
            {stats.byCategory.slice(0, 6).map((row, index) => {
              const percent = row.total ? row.percent : 0;
              return (
                <div className="case-coverage-row" key={row.category}>
                  <div className={`case-coverage-icon case-tone-${index % 4}`}><FileText /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3 text-xs font-extrabold text-navy">
                      <span className="truncate">{row.category}</span>
                      <span>{row.ready} / {row.total}</span>
                    </div>
                    <Progress value={percent} className="mt-2 h-2.5 bg-slate-100" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="case-panel">
          <div className="case-panel-heading">
            <div>
              <span className="case-kicker">WHAT'S NEXT</span>
              <h3>Priority Tasks</h3>
            </div>
            <button className="case-view-link" onClick={() => onNavigate("review")}>View all</button>
          </div>
          <div className="case-list">
            {openTasks.length ? openTasks.slice(0, 4).map((task) => (
              <button key={task.id} className="case-list-row" onClick={() => onNavigate("review")}>
                <span className="case-check" />
                <span className="min-w-0 flex-1 text-left">
                  <strong>{task.title}</strong>
                  <small>{task.assignedTo || "Unassigned"}</small>
                </span>
                <span className={task.priority === "High" ? "case-pill-red" : "case-pill"}>{task.priority || "Normal"}</span>
              </button>
            )) : <div className="case-empty"><CheckCircle2 /> Nothing outstanding.</div>}
          </div>
        </section>

        <section className="case-panel">
          <div className="case-panel-heading">
            <div>
              <span className="case-kicker">ACTIVITY</span>
              <h3>Recent Timeline</h3>
            </div>
            <button className="case-view-link" onClick={() => onNavigate("timeline")}>View timeline</button>
          </div>
          <div className="case-timeline-list">
            {recentEvents.length ? recentEvents.map((event) => (
              <button key={event.id} onClick={() => onNavigate("timeline")} className="case-timeline-row">
                <span className="case-date-box"><strong>{new Date(event.date).getDate() || "—"}</strong><small>{new Date(event.date).toLocaleString("en", { month: "short" }).toUpperCase()}</small></span>
                <span className="min-w-0 text-left"><strong>{event.title}</strong><small>{event.category}</small></span>
              </button>
            )) : <div className="case-empty"><Clock3 /> No events recorded yet.</div>}
          </div>
        </section>

        <section className="case-panel">
          <div className="case-panel-heading">
            <div>
              <span className="case-kicker">DOCUMENTS</span>
              <h3>Recently Added</h3>
            </div>
            <button className="case-view-link" onClick={() => onNavigate("vault")}>View all</button>
          </div>
          <div className="case-list">
            {recentEvidence.length ? recentEvidence.map((item) => (
              <button key={item.id} className="case-document-row" onClick={() => onNavigate("vault")}>
                <span className="case-doc-icon"><FileText /></span>
                <span className="min-w-0 flex-1 text-left"><strong>{item.title}</strong><small>{item.exhibitId || item.fileName} · {formatDate(item.updatedAt)}</small></span>
                <span className="case-pill-green">{item.status}</span>
              </button>
            )) : <div className="case-empty"><FileText /> No evidence added yet.</div>}
          </div>
        </section>
      </div>

      <button className="case-review-banner" onClick={onBuildPacket}>
        <span className="case-review-icon"><CheckCircle2 /></span>
        <span className="min-w-0 flex-1 text-left"><strong>Case Review</strong><small>Review all evidence, resolve gaps, and prepare your submission.</small></span>
        <span className="case-review-button">Start Review <ChevronRight /></span>
      </button>

      <p className="case-last-edited">
        Last edited: {stats.lastEditedAt ? new Date(stats.lastEditedAt).toLocaleString() : "No case activity yet"}
        <span> · Separation began {formatDate(caseSettings.separationStartDate)}</span>
      </p>

      {openTasks.some((task) => task.reminderAt) && (
        <div className="sr-only"><Bell /> Task reminders are active.</div>
      )}
    </div>
  );
}