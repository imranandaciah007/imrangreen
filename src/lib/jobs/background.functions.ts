import { createServerFn } from "@tanstack/react-start";

/** Progress of the always-on background sync (safe to poll from the app). */
export const getBackgroundStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readJobStatus } = await import("@/lib/jobs/clone-worker.server");
  return readJobStatus();
});

/** Kick one background batch by hand, e.g. from the Synch now button. */
export const runBackgroundBatch = createServerFn({ method: "POST" })
  .inputValidator((data: { batch?: number } | undefined) => ({
    batch: Math.min(Math.max(data?.batch ?? 6, 1), 12),
  }))
  .handler(async ({ data }) => {
    const { runCloneTick } = await import("@/lib/jobs/clone-worker.server");
    return runCloneTick(data.batch);
  });

/** Clear a paused state (after credits are topped up or access restored). */
export const resumeBackgroundSync = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("gc_job_state")
    .update({ status: "idle", paused_reason: null, lease_until: null })
    .eq("id", true);
  return { ok: true };
});
