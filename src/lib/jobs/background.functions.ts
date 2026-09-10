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

/** Existing clones already on record, so Synch now can verify instead of rebuild. */
export const listCloneLedger = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: {
    drive_file_id: string;
    clone_file_id: string | null;
    clone_name: string | null;
    clone_link: string | null;
    status: string;
    duplicate_of: string | null;
    updated_at: string | null;
  }[] = [];
  const page = 1000;
  for (let from = 0; from < 5000; from += page) {
    const { data, error } = await supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id,clone_file_id,clone_name,clone_link,status,duplicate_of,updated_at")
      .in("status", ["done", "duplicate"])
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < page) break;
  }
  return { clones: rows };
});
