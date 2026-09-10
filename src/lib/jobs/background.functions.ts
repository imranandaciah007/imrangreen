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

/** Stop the always-on builder until the next Synch now. */
export const pauseBackgroundSync = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("gc_job_state")
    .update({ status: "paused", paused_reason: "Paused by you", lease_until: null })
    .eq("id", true);
  return { ok: true };
});

export interface CloneFileRow {
  driveFileId: string;
  /** Link to the untouched original PDF in your Drive. */
  originalLink: string;
  fileName: string;
  exhibitTitle: string;
  documentDate: string | null;
  summary: string | null;
  pageCount: number | null;
  cloneName: string | null;
  cloneLink: string | null;
  status: string;
}

/** The exhibits filed inside one folder of the clones root. */
export const listCloneFiles = createServerFn({ method: "GET" })
  .inputValidator((data: { path?: string } | undefined) => ({
    path: (data?.path ?? "").replace(/^\/+|\/+$/g, ""),
  }))
  .handler(async ({ data }): Promise<{ path: string; files: CloneFileRow[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("gc_clone_jobs")
      .select(
        "drive_file_id,file_name,clone_name,clone_link,status,ai_title,ai_date,ai_summary,ai_page_count",
      )
      .eq("folder_path", data.path)
      .neq("status", "duplicate")
      .limit(500);
    if (error) throw new Error(error.message);
    const files = (rows ?? []).map((row) => {
      const r = row as {
        drive_file_id: string;
        file_name: string | null;
        clone_name: string | null;
        clone_link: string | null;
        status: string;
        ai_title: string | null;
        ai_date: string | null;
        ai_summary: string | null;
        ai_page_count: number | null;
      };
      return {
        driveFileId: r.drive_file_id,
        originalLink: `https://drive.google.com/file/d/${r.drive_file_id}/view`,
        fileName: r.file_name ?? r.drive_file_id,
        exhibitTitle: r.ai_title ?? r.file_name ?? "Untitled document",
        documentDate: r.ai_date,
        summary: r.ai_summary,
        pageCount: r.ai_page_count,
        cloneName: r.clone_name,
        cloneLink: r.clone_link,
        status: r.status,
      };
    });
    files.sort((a, b) => a.exhibitTitle.localeCompare(b.exhibitTitle));
    return { path: data.path, files };
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
    ai_title: string | null;
    ai_date: string | null;
    ai_people: string[] | null;
    ai_categories: string[] | null;
    ai_source_type: string | null;
    ai_summary: string | null;
    ai_aciah_impact: string | null;
    ai_page_count: number | null;
    ai_model: string | null;
    ai_read_at: string | null;
  }[] = [];
  const page = 1000;
  for (let from = 0; from < 5000; from += page) {
    const { data, error } = await supabaseAdmin
      .from("gc_clone_jobs")
      .select(
        "drive_file_id,clone_file_id,clone_name,clone_link,status,duplicate_of,updated_at,ai_title,ai_date,ai_people,ai_categories,ai_source_type,ai_summary,ai_aciah_impact,ai_page_count,ai_model,ai_read_at",
      )
      .in("status", ["done", "duplicate"])
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < page) break;
  }
  return { clones: rows };
});

export interface CloneFolderRow {
  /** Folder path inside the clones root ("" is the root itself). */
  path: string;
  total: number;
  built: number;
  pending: number;
  duplicates: number;
  failed: number;
}

/**
 * The folder structure inside the "I601 Evidence Clones" root, with how many
 * exhibits in each folder are already built. Case progress mirrors this.
 */
export const listCloneFolders = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const byPath = new Map<string, CloneFolderRow>();
  const page = 1000;
  for (let from = 0; from < 20000; from += page) {
    const { data, error } = await supabaseAdmin
      .from("gc_clone_jobs")
      .select("folder_path,status")
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data as { folder_path: string | null; status: string }[]) {
      const path = (row.folder_path ?? "").replace(/^\/+|\/+$/g, "");
      const entry =
        byPath.get(path) ??
        ({ path, total: 0, built: 0, pending: 0, duplicates: 0, failed: 0 } as CloneFolderRow);
      if (row.status === "duplicate") entry.duplicates += 1;
      else {
        entry.total += 1;
        if (row.status === "done") entry.built += 1;
        else if (row.status === "error") entry.failed += 1;
        else entry.pending += 1;
      }
      byPath.set(path, entry);
    }
    if (data.length < page) break;
  }
  const folders = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  return { root: "I601 Evidence Clones", folders };
});

