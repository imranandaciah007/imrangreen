import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DollarSign,
  FileStack,
  FileText,
  ListChecks,
  PauseCircle,
  RefreshCw,
  SearchCheck,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { statusLabel } from "@/components/evidence/status-ui";
import { formatDate, parseDay } from "@/lib/evidence/format";
import { STALE_JOB_MS } from "@/lib/evidence/shared-state";
import { useEvidence } from "@/lib/evidence/store";
import { CaseProgressPanel } from "@/components/evidence/CaseProgressPanel";
import { isOpenTask } from "@/lib/task-reminders";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

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
      className={`case-metric case-metric-${tone} min-w-0 whitespace-normal`}
    >
      <span className="case-metric-icon">{icon}</span>
      <span className="min-w-0 text-left">
        <span className="block font-display text-xl font-black leading-none text-navy">{value}</span>
        <span className="mt-1.5 block break-words text-[10px] font-extrabold uppercase leading-tight tracking-[.06em] text-navy/65 sm:text-[11px]">{label}</span>
      </span>
    </Button>
  );
}

type NextStep = {
  label: string;
  why: string;
  icon: React.ReactNode;
  run: () => void;
};

export function HomeView({
  onNavigate,
  onOpenFolders,
  onUpload,
  onAddTask,
  onBuildPacket,
  onResumeFiling,
  onSyncDrive,
  onOpenCategory,
}: {
  onNavigate: (tab: "timeline" | "finances" | "documents" | "review") => void;
  onOpenFolders: () => void;
  onUpload: () => void;
  onAddTask: () => void;
  onBuildPacket: () => void;
  onResumeFiling: () => void;
  onSyncDrive: () => Promise<void>;
  onOpenCategory: (category: string) => void;
}) {
  const { stats, caseSettings, tasks, events, items, gaps, packets, connection, driveSyncing, scanProgress, pauseSync, openInspector, jobs, jobsHere } = useEvidence();
  const busy = driveSyncing || scanProgress.running;
  const gbp = (n: number) => `£${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const openTasks = tasks.filter(isOpenTask);
  const recentEvents = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const recentEvidence = [...items]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  const attentionRecords = new Set(gaps.map((gap) => `${gap.recordType}:${gap.recordId}`)).size;
  const latestPacket = packets.at(-1);
  const filingLink = latestPacket?.filingFiles?.[0]?.webViewLink;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  const packetLine = !latestPacket
    ? "Packet not built yet"
    : latestPacket.filingBuiltAt
      ? `Filing packet ready${latestPacket.filingPageCount ? ` (${latestPacket.filingPageCount} pages)` : ""}`
      : `Packet version ${latestPacket.version} saved, filing packet not built yet`;
  const statusLine = [
    plural(stats.total, "document"),
    stats.needsConfirmation ? `${stats.needsConfirmation} to check` : "",
    packetLine,
  ]
    .filter(Boolean)
    .join(" · ");

  // Work left unfinished, on this device or another one, comes first.
  const unfinished = (kind: "drive" | "read" | "filing") => {
    const job = jobs[kind];
    if (!job || job.status === "done" || jobsHere[kind]) return null;
    const quiet = Date.now() - Date.parse(job.updatedAt) > STALE_JOB_MS;
    return job.status !== "running" || quiet ? job : null;
  };
  const stoppedRead = unfinished("read") ?? unfinished("drive");
  const stoppedFiling = unfinished("filing");

  // The single most useful thing to do next, in the order a filing comes together.
  const next: NextStep = busy
    ? {
        label: "Pause the update",
        why: "Drive is being read now. You can pause it and carry on later without losing anything.",
        icon: <PauseCircle />,
        run: () => pauseSync(),
      }
    : stoppedRead && connection?.lastSyncedAt
      ? {
          label: stoppedRead.total
            ? `Carry on reading (${stoppedRead.done} of ${stoppedRead.total})`
            : "Carry on updating from Drive",
          why: "The last run stopped before it finished. It picks up where it left off; nothing is read twice.",
          icon: <RefreshCw />,
          run: () => void onSyncDrive(),
        }
      : stoppedFiling && latestPacket && !latestPacket.filingBuiltAt
        ? {
            label: `Carry on the filing packet (part ${stoppedFiling.done + 1} of ${stoppedFiling.total})`,
            why: "The finished parts are already saved, so it carries on from the next one.",
            icon: <FileStack />,
            run: onResumeFiling,
          }
    : !connection?.lastSyncedAt
      ? {
          label: "Update from Drive",
          why: "Bring in your Drive folders so every document can be read and numbered.",
          icon: <RefreshCw />,
          run: () => void onSyncDrive(),
        }
      : stats.needsConfirmation
        ? {
            label: `Check details on ${plural(stats.needsConfirmation, "document")}`,
            why: "The reader was unsure about a date, name or amount. A quick look keeps the packet accurate.",
            icon: <SearchCheck />,
            run: () => onNavigate("review"),
          }
        : !latestPacket
          ? {
              label: "Build the case packet",
              why: "Every document is checked. Put them in order with exhibit numbers.",
              icon: <FileStack />,
              run: onBuildPacket,
            }
          : !latestPacket.filingBuiltAt
            ? {
                label: "Build the filing packet",
                why: "Turn the saved packet into one numbered PDF ready to file.",
                icon: <FileStack />,
                run: onBuildPacket,
              }
            : {
                label: "Open the filing packet",
                why: "Your filing packet is ready. Open it to read it through before filing.",
                icon: <FileStack />,
                run: () => (filingLink ? window.open(filingLink, "_blank") : onBuildPacket()),
              };

  return (
    <div className="case-home space-y-4">
      <section className="case-hero">
        <div className="case-hero-copy">
          <span className="case-kicker">NEXT STEP</span>
          <h2>{greeting()}, Imran &amp; Aciah</h2>
          <p aria-live="polite">{statusLine}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:max-w-md">
          <Button onClick={next.run} size="lg" className="case-primary-action h-14 w-full justify-between text-base">
            <span className="flex items-center gap-2">
              {next.icon} {next.label}
            </span>
            <ArrowRight />
          </Button>
          <p className="px-1 text-xs font-semibold text-navy/70">{next.why}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {!busy && connection?.lastSyncedAt && (
              <Button onClick={() => void onSyncDrive()} variant="outline" size="sm" className="case-secondary-action">
                <RefreshCw /> Update from Drive
              </Button>
            )}
            <Button onClick={onUpload} variant="outline" size="sm" className="case-secondary-action">
              <Upload /> Add evidence
            </Button>
            <Button onClick={onAddTask} variant="outline" size="sm" className="case-secondary-action">
              <ListChecks /> Add task
            </Button>
          </div>
          {connection?.lastSyncedAt && (
            <span className="px-1 text-[11px] font-semibold text-navy/60">
              Last updated from Drive{" "}
              {new Date(connection.lastSyncedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {attentionRecords ? ` · ${plural(attentionRecords, "record")} need supporting evidence or details` : ""}
            </span>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Total Exhibits" value={String(stats.total)} icon={<FileText />} tone="yellow" onClick={() => onNavigate("documents")} />
        <Metric label="Reviewed & Ready" value={String(stats.ready)} icon={<CheckCircle2 />} tone="blue" onClick={() => onNavigate("documents")} />
        <Metric label="Open Tasks" value={String(openTasks.length)} icon={<Clock3 />} tone="orange" onClick={() => onNavigate("review")} />
        <Metric label={stats.financialUnconfirmed ? "Separation costs (estimate)" : "Separation Costs"} value={gbp(stats.financialImpact)} icon={<DollarSign />} tone="green" onClick={() => onNavigate("finances")} />
      </section>

      <div className="case-dashboard-grid">
        <CaseProgressPanel
          onOpenCategory={onOpenCategory}
          onOpenBoard={onOpenFolders}
        />


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
                <span className="case-date-box"><strong>{parseDay(event.date).getDate() || "—"}</strong><small>{parseDay(event.date).toLocaleString("en", { month: "short" }).toUpperCase()}</small></span>
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
            <button className="case-view-link" onClick={() => onNavigate("documents")}>View all</button>
          </div>
          <div className="case-list">
            {recentEvidence.length ? recentEvidence.map((item) => (
              <button key={item.id} className="case-document-row" onClick={() => openInspector(item.id)}>
                <span className="case-doc-icon"><FileText /></span>
                <span className="min-w-0 flex-1 text-left"><strong>{item.title}</strong><small>{item.exhibitId || item.fileName} · {formatDate(item.updatedAt)}</small></span>

                <span className="case-pill-green">{statusLabel(item.status)}</span>
              </button>
            )) : <div className="case-empty"><FileText /> No evidence added yet.</div>}
          </div>
        </section>
      </div>

      <button className="case-review-banner" onClick={onBuildPacket}>
        <span className="case-review-icon"><CheckCircle2 /></span>
        <span className="min-w-0 flex-1 text-left"><strong>Case packet</strong><small>Put the evidence in order, number the exhibits and build the filing PDF.</small></span>
        <span className="case-review-button">Open packet <ChevronRight /></span>
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