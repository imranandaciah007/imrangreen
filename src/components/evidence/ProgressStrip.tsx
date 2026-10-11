import { useEffect } from "react";
import { Loader2, PauseCircle, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getBackgroundStatus } from "@/lib/jobs/background.functions";
import { STALE_JOB_MS, deviceId, type JobKind, type SharedJob } from "@/lib/evidence/shared-state";
import { useEvidence } from "@/lib/evidence/store";

type Line = {
  key: string;
  text: string;
  done?: number;
  total?: number;
  paused?: boolean;
  onContinue?: () => void;
  onDismiss?: () => void;
};

const JOB_NAMES: Record<JobKind, string> = {
  drive: "Update from Drive",
  read: "Reading documents",
  filing: "Filing packet",
};

/**
 * One thin line per job, shown at the top of every screen. Jobs are shared, so a
 * run that stopped on another device (or when this one was closed) shows here
 * with a Continue button that picks it up from where it stopped.
 */
export function ProgressStrip({
  onContinueUpdate,
  onContinueFiling,
}: {
  onContinueUpdate: () => void;
  onContinueFiling: () => void;
}) {
  const { driveSyncing, scanProgress, jobs, jobsHere, reportJob } = useEvidence();
  const fetchStatus = useServerFn(getBackgroundStatus);
  const { data, refetch } = useQuery({
    queryKey: ["gc-background-status"],
    queryFn: () => fetchStatus(),
    // Check often while copies are being made, calmly otherwise.
    refetchInterval: (query) => (query.state.data?.waiting ? 6_000 : 30_000),
    refetchOnWindowFocus: true,
  });

  // An update from Drive usually queues new copies, so look again once it ends.
  useEffect(() => {
    if (!driveSyncing && !scanProgress.running) void refetch();
  }, [driveSyncing, scanProgress.running, refetch]);

  const lines: Line[] = [];
  if (driveSyncing) lines.push({ key: "drive", text: "Updating from Drive…" });
  if (scanProgress.running) {
    lines.push({
      key: "read",
      text: `Reading documents: ${scanProgress.done} of ${scanProgress.total}`,
      done: scanProgress.done,
      total: scanProgress.total,
    });
  }

  // Jobs recorded by another device, or by this one before it was closed.
  const me = deviceId();
  const runningHere: Record<JobKind, boolean> = {
    drive: driveSyncing,
    read: scanProgress.running,
    filing: false,
  };
  const describe = (kind: JobKind, job: SharedJob) =>
    job.total ? `${JOB_NAMES[kind]}: ${job.done} of ${job.total}` : JOB_NAMES[kind];
  for (const kind of ["drive", "read", "filing"] as const) {
    const job = jobs[kind];
    if (!job || job.status === "done" || runningHere[kind]) continue;
    const fresh = Date.now() - Date.parse(job.updatedAt) < STALE_JOB_MS;
    if (job.status === "running" && (fresh || jobsHere[kind])) {
      lines.push({
        key: `job-${kind}`,
        text:
          job.device === me
            ? describe(kind, job).replace("Filing packet:", "Building filing packet: part")
            : `On your other device — ${describe(kind, job)}`,
        done: job.done,
        total: job.total,
      });
      continue;
    }
    // The update and the reading resume together: Update from Drive does both.
    if (kind === "drive" && jobs.read && jobs.read.status !== "done") continue;
    lines.push({
      key: `job-${kind}`,
      text: `${describe(kind, job)} — ${job.status === "paused" ? "paused" : "stopped before finishing"}`,
      done: job.done,
      total: job.total,
      paused: true,
      onContinue: kind === "filing" ? onContinueFiling : onContinueUpdate,
      onDismiss: () => reportJob(kind, { status: "done" }),
    });
  }

  if (data?.status === "paused") {
    lines.push({
      key: "copies",
      text: "Exhibit copies paused. Press Update from Drive to carry on.",
      paused: true,
    });
  } else if (data?.waiting) {
    const total = data.clonesBuilt + data.waiting;
    lines.push({
      key: "copies",
      text: `Making exhibit copies: ${data.clonesBuilt} of ${total}`,
      done: data.clonesBuilt,
      total,
    });
  }

  if (!lines.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-border bg-accent/60 px-3 py-1.5 text-[11px] font-bold text-foreground sm:px-5 lg:px-7"
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-1">
        {lines.map((line) => (
          <div key={line.key} className="flex items-center gap-2">
            {line.paused ? (
              <PauseCircle className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            )}
            <span className="min-w-0 truncate">{line.text}</span>
            {line.onContinue && (
              <button
                type="button"
                onClick={line.onContinue}
                className="ml-auto h-7 shrink-0 rounded-md bg-primary px-2.5 text-[11px] font-bold text-primary-foreground"
              >
                Continue
              </button>
            )}
            {line.onDismiss && (
              <button
                type="button"
                onClick={line.onDismiss}
                aria-label="Hide this"
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            )}
            {line.total && !line.onContinue ? (
              <span className="ml-auto h-1 w-20 shrink-0 overflow-hidden rounded-full bg-border sm:w-32">
                <span
                  className="block h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.min(100, Math.round(((line.done ?? 0) / line.total) * 100))}%` }}
                />
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
