/**
 * Compares every original in Drive with the exhibit copies in the clones folder,
 * so you can see that each document has exactly one copy and every copy belongs
 * to a real original. Read-only: nothing is moved or deleted.
 */
import { isAppOutputPath, isEvidenceFile } from "@/lib/evidence/file-formats";

export interface CheckedFile {
  name: string;
  path: string;
  link: string;
}

export interface CopyCheck {
  checkedAt: string;
  /** False when Drive did not return everything; counts may then be incomplete. */
  complete: boolean;
  originals: number;
  /** Distinct documents (identical files count once and share one copy). */
  documents: number;
  /** Extra originals that are byte-for-byte identical to another one. */
  identicalOriginals: number;
  copies: number;
  /** Documents with exactly one copy. */
  matched: number;
  /** Documents with no copy yet, with what the builder last said about them. */
  missing: (CheckedFile & { status: string; note: string })[];
  /** Documents with more than one copy: keep one, the rest are extra. */
  extra: { original: CheckedFile; copies: CheckedFile[] }[];
  /** Copies whose original is no longer anywhere in Drive. */
  orphans: CheckedFile[];
}

type TreeFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  webViewLink: string;
  checksum?: string;
  originalId?: string;
};
type Row = { drive_file_id: string; clone_file_id: string | null; status: string; error: string | null };

export async function checkCopies(): Promise<CopyCheck> {
  const drive = await import("@/lib/drive-core.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tree = await drive.listTree();

  // What the background builder recorded: which copy belongs to which original.
  const rows: Row[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("gc_clone_jobs")
      .select("drive_file_id,clone_file_id,status,error")
      .order("drive_file_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  return compareCopies({
    files: tree.files,
    allFileIds: tree.allFileIds,
    complete: tree.complete,
    rows,
    cloneRoot: drive.CLONE_ROOT,
    isIgnoredPath: drive.isIgnoredDrivePath,
    slug: drive.slug,
  });
}

/** The comparison itself, separate from Drive and the database so it can be tested. */
export function compareCopies(input: {
  files: TreeFile[];
  allFileIds: string[];
  complete: boolean;
  rows: Row[];
  cloneRoot: string;
  isIgnoredPath: (path: string) => boolean;
  slug: (value: string) => string;
}): CopyCheck {
  const { rows } = input;
  const isCopy = (path: string) => path.split("/")[0] === input.cloneRoot;
  const originals = input.files.filter(
    (f) =>
      !isCopy(f.path) &&
      !input.isIgnoredPath(f.path) &&
      !isAppOutputPath(f.path) &&
      isEvidenceFile(f.name, f.mimeType),
  );
  const copies = input.files.filter((f) => isCopy(f.path) && /\.pdf$/i.test(f.name));
  const rowByOriginal = new Map(rows.map((r) => [r.drive_file_id, r]));
  const originalByCopy = new Map(
    rows.filter((r) => r.clone_file_id).map((r) => [r.clone_file_id!, r.drive_file_id]),
  );

  // Identical files are one document: Drive checksum, else name + size + type.
  const keyOf = (f: (typeof originals)[number]) =>
    f.checksum ? `md5:${f.checksum}` : `ns:${f.name.trim().toLowerCase()}|${f.size}|${f.mimeType}`;
  const docOf = new Map<string, string>();
  const docs = new Map<string, (typeof originals)[number][]>();
  for (const f of originals) {
    const key = keyOf(f);
    docOf.set(f.id, key);
    docs.set(key, [...(docs.get(key) ?? []), f]);
  }

  // Older copies have no recorded original: match them by folder and file name.
  const byFolderAndName = new Map<string, string>();
  for (const f of originals) {
    byFolderAndName.set(`${f.path}|${input.slug(f.name.replace(/\.[^.]+$/, "")).toLowerCase()}`, f.id);
  }
  const allIds = new Set(input.allFileIds);
  const copiesOfDoc = new Map<string, typeof copies>();
  const orphans: CheckedFile[] = [];
  for (const c of copies) {
    let originalId = c.originalId ?? originalByCopy.get(c.id);
    if (!originalId) {
      const folder = c.path.split("/").slice(1).join("/");
      const base = c.name.replace(/\.pdf$/i, "").split("_");
      // Name is <code>_<name>_<date>_<person>; the name itself may contain "_".
      const middle = base.slice(1, -2).join("_").toLowerCase();
      originalId = byFolderAndName.get(`${folder}|${middle}`);
    }
    const doc = originalId ? docOf.get(originalId) : undefined;
    if (doc) {
      copiesOfDoc.set(doc, [...(copiesOfDoc.get(doc) ?? []), c]);
    } else if (!originalId || !allIds.has(originalId)) {
      orphans.push({ name: c.name, path: c.path, link: c.webViewLink });
    }
    // An original that exists but is not evidence (e.g. in an "ignore" folder) is left alone.
  }

  const asFile = (f: { name: string; path: string; webViewLink: string }): CheckedFile => ({
    name: f.name,
    path: f.path,
    link: f.webViewLink,
  });
  const missing: CopyCheck["missing"] = [];
  const extra: CopyCheck["extra"] = [];
  let matched = 0;
  for (const [key, files] of docs) {
    const found = copiesOfDoc.get(key) ?? [];
    if (found.length === 1) matched += 1;
    else if (found.length > 1) extra.push({ original: asFile(files[0]!), copies: found.map(asFile) });
    else {
      const row = files.map((f) => rowByOriginal.get(f.id)).find(Boolean);
      missing.push({
        ...asFile(files[0]!),
        status: row?.status ?? "not seen yet",
        note: (row?.error ?? "").slice(0, 160),
      });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    complete: input.complete,
    originals: originals.length,
    documents: docs.size,
    identicalOriginals: originals.length - docs.size,
    copies: copies.length,
    matched,
    missing: missing.slice(0, 300),
    extra: extra.slice(0, 300),
    orphans: orphans.slice(0, 300),
  };
}
