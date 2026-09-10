/**
 * Background exhibit/clone worker.
 *
 * Runs on a schedule so syncing and clone building continue with the app closed.
 * Each run is bounded, leased (only one run at a time), idempotent per Drive
 * file, and pauses itself if the AI/Drive gateway blocks the workspace.
 */

import { classifyDriveFile } from "@/lib/evidence/drive-classify";

const LEASE_MINUTES = 10;
const TREE_REFRESH_MINUTES = 15;
const DEFAULT_BATCH = 6;
const MAX_ATTEMPTS = 3;
const CLONE_ROOT = "I601 Evidence Clones";

export interface TickResult {
  ok: boolean;
  state: "idle" | "running" | "paused" | "busy";
  scanned?: number;
  queued?: number;
  cloned?: number;
  failed?: number;
  pending?: number;
  folders?: number;
  files?: number;
  reason?: string;
}

interface JobRow {
  drive_file_id: string;
  file_name: string;
  folder_path: string;
  mime_type: string;
  exhibit_id: string;
  attempts: number;
}

function exhibitIdFor(driveFileId: string): string {
  let hash = 0;
  for (const char of driveFileId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `EX-${hash.toString(36).toUpperCase().padStart(5, "0").slice(-5)}`;
}

function supportedFile(name: string, mimeType: string): boolean {
  const lower = name.toLowerCase();
  // Email archives, videos and archives cannot become page-accurate exhibits.
  if (/\.(msg|eml|zip|rar|7z|mp4|mov|m4a|mp3|wav|heic|numbers|pages|key)$/.test(lower)) return false;
  return (
    mimeType === "application/pdf" ||
    lower.endsWith(".pdf") ||
    /^image\/(png|jpe?g)$/.test(mimeType) ||
    /\.(png|jpe?g)$/.test(lower) ||
    /wordprocessingml|presentationml|spreadsheetml|msword|ms-powerpoint|ms-excel/.test(mimeType) ||
    /\.(docx?|pptx?|xlsx?)$/.test(lower) ||
    /^application\/vnd\.google-apps\.(document|spreadsheet|presentation)$/.test(mimeType)
  );
}

function titleFromName(name: string) {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A 402/403 from Drive or the AI gateway means: stop the whole job. */
function blockedReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/\[(402|403)\]/.test(message)) return message.slice(0, 400);
  return null;
}

export async function runCloneTick(limit = DEFAULT_BATCH): Promise<TickResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const drive = await import("@/lib/drive-core.server");
  const now = new Date();

  const { data: state } = await supabaseAdmin
    .from("gc_job_state")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const paused = state?.status === "paused";

  // Lease: a second concurrent run exits instead of doubling the work.
  const { data: leased } = await supabaseAdmin
    .from("gc_job_state")
    .update({
      status: "running",
      lease_until: new Date(now.getTime() + LEASE_MINUTES * 60_000).toISOString(),
      last_run_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", true)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("id")
    .maybeSingle();

  if (!leased) return { ok: true, state: "busy" };

  // While paused, do at most one probe item per run to detect recovery.
  const batch = paused ? 1 : limit;
  let scanned = 0;
  let queued = 0;
  let cloned = 0;
  let failed = 0;
  let folders = state?.folders ?? 0;
  let files = state?.files ?? 0;
  let pauseReason: string | null = paused ? (state?.paused_reason ?? "Paused") : null;

  try {
    // 1. Refresh the Drive picture periodically, or when nothing is queued.
    const lastTree = state?.last_tree_sync_at ? new Date(state.last_tree_sync_at).getTime() : 0;
    const { count: pendingBefore } = await supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id", { count: "exact", head: true })
      .eq("status", "pending");

    const treeStale = now.getTime() - lastTree > TREE_REFRESH_MINUTES * 60_000;
    if (treeStale || !pendingBefore) {
      const tree = await drive.listTree();
      folders = tree.folders.length;
      files = tree.files.length;
      scanned = tree.files.length;

      const originals = tree.files.filter(
        (file) => !file.path.startsWith(CLONE_ROOT) && supportedFile(file.name, file.mimeType),
      );

      const { data: known } = await supabaseAdmin
        .from("gc_clone_jobs")
        .select("drive_file_id,content_key,status,duplicate_of");
      const liveIds = new Set(originals.map((file) => file.id));

      // One exhibit per identical document: Drive checksum first, else name + byte size.
      const contentKeyOf = (file: (typeof originals)[number]) =>
        file.checksum
          ? `md5:${file.checksum}`
          : `ns:${file.name.trim().toLowerCase()}|${file.size}|${file.mimeType}`;

      // Whichever copy sits in the shallowest, then alphabetically first folder wins.
      const canonical = new Map<string, (typeof originals)[number]>();
      for (const file of originals) {
        const key = contentKeyOf(file);
        const held = canonical.get(key);
        if (!held) {
          canonical.set(key, file);
          continue;
        }
        const depth = (p: string) => p.split("/").length;
        const better =
          depth(file.path) < depth(held.path) ||
          (depth(file.path) === depth(held.path) && file.path.localeCompare(held.path) < 0);
        if (better) canonical.set(key, file);
      }

      // Keep any copy that already has a clone as the canonical one, so nothing is rebuilt twice.
      for (const row of known ?? []) {
        if (row.status === "done" && row.content_key && !row.duplicate_of) {
          const existing = originals.find((file) => file.id === row.drive_file_id);
          if (existing) canonical.set(row.content_key, existing);
        }
      }

      const knownRows = new Map((known ?? []).map((row) => [row.drive_file_id, row]));

      const newRows: Record<string, unknown>[] = [];
      for (const file of originals) {
        const key = contentKeyOf(file);
        const winner = canonical.get(key)!;
        const isCopy = winner.id !== file.id;
        const existing = knownRows.get(file.id);

        if (!existing) {
          newRows.push({
            drive_file_id: file.id,
            file_name: file.name,
            folder_path: file.path,
            mime_type: file.mimeType,
            exhibit_id: exhibitIdFor(winner.id),
            content_key: key,
            duplicate_of: isCopy ? winner.id : null,
            status: isCopy ? "duplicate" : "pending",
          });
          continue;
        }

        // Only correct what changed, so finished clones are never rebuilt.
        const wasCopy = Boolean(existing.duplicate_of);
        if (existing.content_key !== key || wasCopy !== isCopy) {
          await supabaseAdmin
            .from("gc_clone_jobs")
            .update({
              file_name: file.name,
              folder_path: file.path,
              content_key: key,
              duplicate_of: isCopy ? winner.id : null,
              status: isCopy ? "duplicate" : existing.status === "duplicate" ? "pending" : existing.status,
              updated_at: now.toISOString(),
            })
            .eq("drive_file_id", file.id);
        }
      }

      for (let index = 0; index < newRows.length; index += 200) {
        const slice = newRows.slice(index, index + 200);
        await supabaseAdmin.from("gc_clone_jobs").upsert(slice, { onConflict: "drive_file_id" });
        queued += slice.length;
      }

      // Drop queue rows whose Drive original no longer exists.
      const stale = (known ?? [])
        .map((row) => row.drive_file_id)
        .filter((id) => !liveIds.has(id));
      for (let index = 0; index < stale.length; index += 200) {
        await supabaseAdmin
          .from("gc_clone_jobs")
          .delete()
          .in("drive_file_id", stale.slice(index, index + 200));
      }

      await supabaseAdmin
        .from("gc_job_state")
        .update({ last_tree_sync_at: now.toISOString(), folders, files })
        .eq("id", true);
    }

    // 2. Build a bounded batch of clones.
    const { data: pending } = await supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id,file_name,folder_path,mime_type,exhibit_id,attempts")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(batch);

    for (const job of (pending ?? []) as JobRow[]) {
      try {
        const classification = classifyDriveFile({
          id: job.drive_file_id,
          name: job.file_name,
          mimeType: job.mime_type,
          size: 0,
          modifiedTime: "",
          webViewLink: "",
          parentFolders: job.folder_path.split("/").filter(Boolean),
        });

        const result = await drive.buildClone({
          driveFileId: job.drive_file_id,
          fileName: job.file_name,
          folderPath: job.folder_path,
          mimeType: job.mime_type,
          meta: {
            exhibitId: job.exhibit_id,
            title: titleFromName(job.file_name),
            documentDate: "",
            person: classification?.people[0] ?? "",
            categories: classification?.categories ?? ["Other"],
            people: classification?.people ?? [],
            sourceType: classification?.sourceType ?? "Other",
            status: classification?.status ?? "New",
            summary: `Prepared automatically from the Drive original in "${job.folder_path || "Drive root"}".`,
            tags: classification?.tags ?? [],
            addedBy: "GC background sync",
          },
        });

        await supabaseAdmin
          .from("gc_clone_jobs")
          .update({
            status: "done",
            clone_file_id: result.id,
            clone_name: result.name,
            clone_link: result.webViewLink,
            original_pages: result.originalPages,
            total_pages: result.totalPages,
            error: result.note || null,
            attempts: job.attempts + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("drive_file_id", job.drive_file_id);
        cloned += 1;
        pauseReason = null;
      } catch (error) {
        const blocked = blockedReason(error);
        const attempts = job.attempts + 1;
        await supabaseAdmin
          .from("gc_clone_jobs")
          .update({
            status: blocked || attempts < MAX_ATTEMPTS ? "pending" : "failed",
            attempts,
            error: (error instanceof Error ? error.message : String(error)).slice(0, 600),
            updated_at: new Date().toISOString(),
          })
          .eq("drive_file_id", job.drive_file_id);
        failed += 1;
        if (blocked) {
          pauseReason = blocked;
          break;
        }
      }
    }

    const { count: pendingAfter } = await supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id", { count: "exact", head: true })
      .eq("status", "pending");

    await supabaseAdmin
      .from("gc_job_state")
      .update({
        status: pauseReason ? "paused" : "idle",
        paused_reason: pauseReason,
        lease_until: null,
        folders,
        files,
        note: `${cloned} clone(s) built, ${pendingAfter ?? 0} waiting`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);

    return {
      ok: true,
      state: pauseReason ? "paused" : "idle",
      scanned,
      queued,
      cloned,
      failed,
      pending: pendingAfter ?? 0,
      folders,
      files,
      ...(pauseReason ? { reason: pauseReason } : {}),
    };
  } catch (error) {
    const blocked = blockedReason(error);
    await supabaseAdmin
      .from("gc_job_state")
      .update({
        status: blocked ? "paused" : "idle",
        paused_reason: blocked,
        lease_until: null,
        note: (error instanceof Error ? error.message : String(error)).slice(0, 400),
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    throw error;
  }
}

export async function readJobStatus() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: state }, total, done, pendingCount, failedCount, duplicateCount] = await Promise.all([
    supabaseAdmin.from("gc_job_state").select("*").eq("id", true).maybeSingle(),
    // Duplicate copies are not separate documents, so they stay out of every count.
    supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id", { count: "exact", head: true })
      .is("duplicate_of", null),
    supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id", { count: "exact", head: true })
      .eq("status", "done"),
    supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  return {
    status: (state?.status ?? "idle") as "idle" | "running" | "paused",
    pausedReason: state?.paused_reason ?? null,
    lastRunAt: state?.last_run_at ?? null,
    lastTreeSyncAt: state?.last_tree_sync_at ?? null,
    folders: state?.folders ?? 0,
    files: state?.files ?? 0,
    note: state?.note ?? null,
    totalDocuments: total.count ?? 0,
    clonesBuilt: done.count ?? 0,
    waiting: pendingCount.count ?? 0,
    failed: failedCount.count ?? 0,
  };
}
