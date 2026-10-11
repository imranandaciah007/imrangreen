import { useEffect } from "react";
import { Loader2, PauseCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getBackgroundStatus } from "@/lib/jobs/background.functions";
import { useEvidence } from "@/lib/evidence/store";

type Line = { key: string; text: string; done?: number; total?: number; paused?: boolean };

/** One thin line per job that is running now, shown at the top of every screen. */
export function ProgressStrip() {
  const { driveSyncing, scanProgress } = useEvidence();
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
            {line.total ? (
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
