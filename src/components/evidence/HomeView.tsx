import { ArrowRight, FileStack, PauseCircle, RefreshCw, SearchCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STALE_JOB_MS } from "@/lib/evidence/shared-state";
import { useEvidence } from "@/lib/evidence/store";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function Counter({
  label,
  value,
  attention,
  onClick,
}: {
  label: string;
  value: number | string;
  attention?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
    >
      <span className={`block font-display text-xl font-black ${attention ? "text-destructive" : "text-foreground"}`}>
        {value}
      </span>
      <span className="block truncate text-[11px] font-bold text-muted-foreground">{label}</span>
    </button>
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
  onBuildPacket,
  onResumeFiling,
  onSyncDrive,
}: {
  onNavigate: (tab: "documents" | "review") => void;
  onBuildPacket: () => void;
  onResumeFiling: () => void;
  onSyncDrive: () => Promise<void>;
}) {
  const { stats, gaps, packets, connection, driveSyncing, scanProgress, pauseSync, jobs, jobsHere } = useEvidence();
  const busy = driveSyncing || scanProgress.running;
  const toCheck = new Set(gaps.map((gap) => `${gap.recordType}:${gap.recordId}`)).size;
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

  const lastUpdated = connection?.lastSyncedAt
    ? new Date(connection.lastSyncedAt).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="case-home mx-auto max-w-xl space-y-4">
      <section className="space-y-1 px-1 pt-2">
        <h2 className="font-display text-2xl font-black text-foreground">{greeting()}, Imran &amp; Aciah</h2>
        <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
          {statusLine}
        </p>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-panel">
        <span className="text-[10px] font-extrabold tracking-[.12em] text-muted-foreground uppercase">Next step</span>
        <Button onClick={next.run} size="lg" className="h-auto min-h-14 w-full justify-between py-3 text-base whitespace-normal">
          <span className="flex min-w-0 items-center gap-2 text-left">
            {next.icon} {next.label}
          </span>
          <ArrowRight />
        </Button>
        <p className="px-1 text-xs text-muted-foreground">{next.why}</p>
      </section>

      <section className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <Button
          variant="outline"
          className="h-11 shrink-0"
          disabled={busy}
          onClick={() => void onSyncDrive()}
        >
          <RefreshCw className={busy ? "animate-spin" : undefined} />
          {busy ? "Updating…" : "Update from Drive"}
        </Button>
        <span className="min-w-0 text-xs text-muted-foreground">
          {busy ? "Bringing in your latest Drive changes." : lastUpdated ? `Last updated ${lastUpdated}` : "Not updated yet"}
        </span>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Counter label="Documents" value={stats.total} onClick={() => onNavigate("documents")} />
        <Counter label="To check" value={toCheck} attention={toCheck > 0} onClick={() => onNavigate("review")} />
        <Counter
          label={latestPacket ? `Packet v${latestPacket.version}` : "Packet"}
          value={latestPacket?.filingBuiltAt ? "Ready" : latestPacket ? "Draft" : "—"}
          onClick={onBuildPacket}
        />
      </section>
    </div>
  );
}
