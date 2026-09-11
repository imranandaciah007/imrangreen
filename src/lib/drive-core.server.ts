/**
 * Server-only Google Drive core.
 *
 * Everything that talks to Drive or builds clone PDFs lives here so both the
 * app's server functions and the background job can share exactly one
 * implementation. Originals are only ever read — never modified.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files";
export const CLONE_ROOT = "I601 Evidence Clones";

export interface DriveFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  fileCount: number;
  folderCount: number;
}

export interface DriveFileNode {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  webViewLink: string;
  parentId: string | null;
  path: string;
  /** Drive content checksum, when Drive provides one (binary uploads only). */
  checksum?: string;
}

export function driveHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Google Drive is not linked to this project yet.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  } satisfies Record<string, string>;
}

export async function driveJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...driveHeaders(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Drive request failed [${res.status}] ${url}: ${body}`);
    throw new Error(`Google Drive request failed [${res.status}]: ${body}`);
  }
  return (await res.json()) as T;
}

interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
  md5Checksum?: string;
}

/** Whole-Drive folder tree plus files, each with its full folder path. */
export async function listTree(): Promise<{
  folders: DriveFolderNode[];
  files: DriveFileNode[];
  syncedAt: string;
}> {
  const raw: RawFile[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 25; page += 1) {
    const params = new URLSearchParams({
      q: "trashed = false",
      fields:
        "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents,md5Checksum)",
      pageSize: "1000",
      orderBy: "folder,name",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await driveJson<{ nextPageToken?: string; files?: RawFile[] }>(
      `${GATEWAY}/drive/v3/files?${params.toString()}`,
    );
    raw.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  const folderMeta = new Map<string, { name: string; parentId: string | null }>();
  for (const f of raw) {
    if (f.mimeType === "application/vnd.google-apps.folder") {
      folderMeta.set(f.id, { name: f.name, parentId: f.parents?.[0] ?? null });
    }
  }

  function pathOf(parentId: string | null): string {
    const parts: string[] = [];
    let cursor = parentId;
    for (let depth = 0; cursor && depth < 25; depth += 1) {
      const meta = folderMeta.get(cursor);
      if (!meta) break;
      parts.unshift(meta.name);
      cursor = meta.parentId;
    }
    return parts.join("/");
  }

  const folders: DriveFolderNode[] = [];
  const files: DriveFileNode[] = [];

  for (const f of raw) {
    const parentId = f.parents?.[0] ?? null;
    if (f.mimeType === "application/vnd.google-apps.folder") {
      folders.push({
        id: f.id,
        name: f.name,
        parentId: folderMeta.has(parentId ?? "") ? parentId : null,
        path: pathOf(f.id),
        fileCount: 0,
        folderCount: 0,
      });
    } else {
      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: Number(f.size ?? 0),
        modifiedTime: f.modifiedTime ?? "",
        webViewLink: f.webViewLink ?? "",
        parentId: folderMeta.has(parentId ?? "") ? parentId : null,
        path: pathOf(parentId),
        ...(f.md5Checksum ? { checksum: f.md5Checksum } : {}),
      });
    }
  }

  const byId = new Map(folders.map((f) => [f.id, f]));
  for (const file of files) {
    const parent = file.parentId ? byId.get(file.parentId) : undefined;
    if (parent) parent.fileCount += 1;
  }
  for (const folder of folders) {
    const parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    if (parent) parent.folderCount += 1;
  }

  return { folders, files, syncedAt: new Date().toISOString() };
}

/** Find or create a folder path, returning the deepest folder id. */
export async function ensureFolder(path: string): Promise<string> {
  let parent = "root";
  for (const name of path.split("/").filter(Boolean)) {
    const q = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `'${parent}' in parents`,
    ].join(" and ");
    const found = await driveJson<{ files?: { id: string }[] }>(
      `${GATEWAY}/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)" })}`,
    );
    const hit = found.files?.[0];
    if (hit) {
      parent = hit.id;
      continue;
    }
    const created = await driveJson<{ id: string }>(`${GATEWAY}/drive/v3/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parent],
      }),
    });
    parent = created.id;
  }
  return parent;
}

export async function renameNode(fileId: string, name: string) {
  return driveJson<{ id: string; name: string }>(
    `${GATEWAY}/drive/v3/files/${fileId}?fields=id,name&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
}

export async function moveNode(fileId: string, targetFolderId: string) {
  const current = await driveJson<{ parents?: string[] }>(
    `${GATEWAY}/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
  );
  const removeParents = (current.parents ?? []).join(",");
  const params = new URLSearchParams({
    fields: "id,name,parents",
    addParents: targetFolderId,
    supportsAllDrives: "true",
  });
  if (removeParents) params.set("removeParents", removeParents);
  return driveJson<{ id: string; name: string; parents?: string[] }>(
    `${GATEWAY}/drive/v3/files/${fileId}?${params.toString()}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
}

/**
 * Scan Drive for a clone that already exists for this original file.
 * Clones carry the original's Drive ID in their file properties, so a
 * metadata query finds them without downloading anything. Falls back to a
 * name-prefix match on the exhibit ID for clones written before properties
 * were recorded. Returns null when no clone exists.
 */
export async function findExistingClone(
  originalDriveId: string,
  exhibitId: string,
): Promise<{ id: string; name: string; webViewLink: string } | null> {
  const fields = "files(id,name,webViewLink)";
  const byProperty = await driveJson<{ files?: { id: string; name: string; webViewLink?: string }[] }>(
    `${GATEWAY}/drive/v3/files?q=${encodeURIComponent(
      `properties has { key='originalDriveId' and value='${originalDriveId}' } and trashed=false`,
    )}&fields=${encodeURIComponent(fields)}&pageSize=5`,
  );
  const hit = byProperty.files?.[0];
  if (hit) return { id: hit.id, name: hit.name, webViewLink: hit.webViewLink ?? "" };

  const byName = await driveJson<{ files?: { id: string; name: string; webViewLink?: string }[] }>(
    `${GATEWAY}/drive/v3/files?q=${encodeURIComponent(
      `name contains '${exhibitId}_' and trashed=false`,
    )}&fields=${encodeURIComponent(fields)}&pageSize=5`,
  );
  const named = byName.files?.find((f) => f.name.startsWith(`${exhibitId}_`));
  if (named) return { id: named.id, name: named.name, webViewLink: named.webViewLink ?? "" };
  return null;
}

export async function uploadMultipart(input: {
  name: string;
  mimeType: string;
  parents: string[];
  base64: string;
  properties?: Record<string, string>;
  description?: string;
}) {
  const boundary = `gc${Date.now()}${Math.random().toString(36).slice(2)}`;
  const metadata: Record<string, unknown> = {
    name: input.name,
    parents: input.parents,
  };
  if (input.description) metadata["description"] = input.description;
  if (input.properties) metadata["properties"] = input.properties;

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${input.mimeType}`,
    "Content-Transfer-Encoding: base64",
    "",
    input.base64,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink`, {
    method: "POST",
    headers: { ...driveHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Drive upload failed [${res.status}]: ${text}`);
    throw new Error(`Google Drive upload failed [${res.status}]: ${text}`);
  }
  return (await res.json()) as { id: string; name: string; webViewLink?: string };
}

export async function fetchDriveBytes(fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media`, {
    headers: driveHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not download the original file [${res.status}]: ${text}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

const GOOGLE_NATIVE = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation|drawing)$/;

const OFFICE_TO_GOOGLE: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "application/vnd.google-apps.document",
  "application/msword": "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "application/vnd.google-apps.presentation",
  "application/vnd.ms-powerpoint": "application/vnd.google-apps.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "application/vnd.google-apps.spreadsheet",
  "application/vnd.ms-excel": "application/vnd.google-apps.spreadsheet",
  "text/plain": "application/vnd.google-apps.document",
  "text/csv": "application/vnd.google-apps.spreadsheet",
  "application/rtf": "application/vnd.google-apps.document",
};

async function exportAsPdf(fileId: string): Promise<Uint8Array> {
  const res = await fetch(
    `${GATEWAY}/drive/v3/files/${fileId}/export?mimeType=application%2Fpdf`,
    { headers: driveHeaders() },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not convert the original to PDF [${res.status}]: ${text}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Returns the original's page content as embeddable bytes.
 * PDFs come straight through, images stay images, Google Docs/Sheets/Slides and
 * Office documents are converted to PDF through a temporary Drive copy that is
 * deleted afterwards. The original file is never touched.
 */
export async function fetchOriginalForEmbedding(input: {
  fileId: string;
  fileName: string;
  mimeType: string;
}): Promise<{ bytes: Uint8Array; kind: "pdf" | "png" | "jpg" } | null> {
  const mime = input.mimeType || "";
  const name = input.fileName.toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return { bytes: await fetchDriveBytes(input.fileId), kind: "pdf" };
  }
  if (/^image\/png$/.test(mime) || name.endsWith(".png")) {
    return { bytes: await fetchDriveBytes(input.fileId), kind: "png" };
  }
  if (/^image\/jpe?g$/.test(mime) || /\.jpe?g$/.test(name)) {
    return { bytes: await fetchDriveBytes(input.fileId), kind: "jpg" };
  }
  if (GOOGLE_NATIVE.test(mime)) {
    return { bytes: await exportAsPdf(input.fileId), kind: "pdf" };
  }

  const googleTarget = OFFICE_TO_GOOGLE[mime];
  if (!googleTarget) return null;

  // Convert through a throwaway Google-format copy, then remove the copy.
  const copy = await driveJson<{ id: string }>(
    `${GATEWAY}/drive/v3/files/${input.fileId}/copy?fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `GC conversion ${input.fileName}`, mimeType: googleTarget }),
    },
  );
  try {
    return { bytes: await exportAsPdf(copy.id), kind: "pdf" };
  } finally {
    await fetch(`${GATEWAY}/drive/v3/files/${copy.id}`, {
      method: "DELETE",
      headers: driveHeaders(),
    }).catch(() => undefined);
  }
}

export function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export interface CloneMeta {
  exhibitId: string;
  title: string;
  documentDate: string;
  person: string;
  categories: string[];
  people: string[];
  sourceType: string;
  status: string;
  summary: string;
  tags: string[];
  affectsAciah?: string | undefined;
  addedBy: string;
}

export interface CloneResult {
  id: string;
  name: string;
  webViewLink: string;
  folderPath: string;
  originalPages: number;
  totalPages: number;
  note: string;
}

export function wrap(text: string, perLine: number): string[] {
  const words = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > perLine) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines.slice(0, 12) : [""];
}

/**
 * Build the annotated clone of one exhibit: a cover sheet carrying the case
 * information and page references, followed by the original pages, with an
 * exhibit + page stamp on every page.
 */
type CloneInput = {
  driveFileId?: string | undefined;
  fileName: string;
  folderPath: string;
  mimeType?: string | undefined;
  base64?: string | undefined;
  meta: CloneMeta;
};

/**
 * A handful of originals use compression pdf-lib only rejects while writing the
 * finished file. Retry once as a cover sheet only, so the exhibit still exists.
 */
export async function buildClone(data: CloneInput): Promise<CloneResult> {
  try {
    return await buildCloneOnce(data, true);
  } catch {
    return await buildCloneOnce(data, false);
  }
}

async function buildCloneOnce(data: CloneInput, embedOriginal: boolean): Promise<CloneResult> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const meta = data.meta;

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const left = 52;
  const right = width - 52;
  const contentW = right - left;

  // Restrained federal palette: deep navy, muted crimson, slate.
  const navy = rgb(0.043, 0.137, 0.255);
  const crimson = rgb(0.545, 0, 0);
  const slate = rgb(0.176, 0.216, 0.278);
  const rule = rgb(0.78, 0.8, 0.84);
  const label = rgb(0.36, 0.39, 0.45);
  const paper = rgb(1, 1, 1);
  const pale = rgb(0.78, 0.82, 0.88);

  const rightText = (text: string, y: number, size: number, font: typeof bold, color = paper) =>
    page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });

  // ---- Top band: navy bar over a thin crimson stripe. No seals or emblems.
  page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: navy });
  page.drawRectangle({ x: 0, y: height - 99.5, width, height: 3.5, color: crimson });
  // Hairline frame, inset, keeps the sheet looking like a filed document.
  page.drawRectangle({
    x: 30,
    y: 30,
    width: width - 60,
    height: height - 130,
    borderColor: rule,
    borderWidth: 0.5,
  });

  page.drawText("FORM I-601 — SUPPORTING EVIDENCE", {
    x: left,
    y: height - 38,
    size: 11,
    font: bold,
    color: paper,
  });
  page.drawText("Annotated exhibit cover sheet — the original document is unchanged", {
    x: left,
    y: height - 54,
    size: 8.5,
    font: body,
    color: pale,
  });
  page.drawText("Filed in support of a waiver of inadmissibility (extreme hardship)", {
    x: left,
    y: height - 68,
    size: 8.5,
    font: body,
    color: pale,
  });
  rightText("APPLICANT", height - 38, 7.5, bold, pale);
  rightText("Imran", height - 51, 10.5, bold);
  rightText("U.S. CITIZEN SPOUSE (QUALIFYING RELATIVE)", height - 66, 7.5, bold, pale);
  rightText("Aciah", height - 79, 10.5, bold);

  // ---- Exhibit anchor: the first thing an officer cross-checks.
  let y = height - 148;
  page.drawText(meta.exhibitId.toUpperCase(), { x: left, y, size: 32, font: bold, color: navy });
  const dateValue = meta.documentDate || "Undated";
  page.drawText("DOCUMENT DATE", {
    x: right - bold.widthOfTextAtSize("DOCUMENT DATE", 7.5),
    y: y + 20,
    size: 7.5,
    font: bold,
    color: label,
  });
  page.drawText(dateValue, {
    x: right - bold.widthOfTextAtSize(dateValue, 15),
    y: y + 2,
    size: 15,
    font: bold,
    color: slate,
  });
  y -= 16;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.2, color: navy });
  page.drawLine({
    start: { x: left, y: y - 3 },
    end: { x: left + 96, y: y - 3 },
    thickness: 1.2,
    color: crimson,
  });
  y -= 30;

  // ---- Specific document title, left aligned.
  for (const line of wrap(meta.title || data.fileName, 52).slice(0, 3)) {
    page.drawText(line, { x: left, y, size: 18, font: bold, color: slate });
    y -= 23;
  }
  y -= 8;

  // ---- Evidentiary purpose.
  page.drawText("PERTAINS TO", { x: left, y, size: 8.5, font: bold, color: navy });
  y -= 14;
  for (const line of wrap(meta.categories.join(" · ") || "Not yet categorised", 84).slice(0, 2)) {
    page.drawText(line, { x: left, y, size: 10.5, font: body, color: slate });
    y -= 14;
  }
  y -= 8;

  // ---- Left-aligned metadata grid: faster to read than centred blocks.
  const grid: [string, string][] = [
    ["People named", meta.people.join(", ") || "Not stated"],
    ["Source / issuing party", meta.sourceType || "Not stated"],
    ["Original file", data.fileName],
    ["Drive folder", data.folderPath || "Drive root"],
  ];
  const colW = contentW / 2 - 10;
  grid.forEach(([key, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = left + col * (colW + 20);
    const ry = y - row * 30;
    page.drawText(key.toUpperCase(), { x, y: ry, size: 7, font: bold, color: label });
    let vy = ry - 11;
    for (const line of wrap(value, 46).slice(0, 2)) {
      page.drawText(line, { x, y: vy, size: 9.5, font: body, color: slate });
      vy -= 10.5;
    }
  });
  y -= 30 * Math.ceil(grid.length / 2) + 10;

  // ---- Narrative blocks, hairline ruled rather than filled.
  function drawBlock(heading: string, text: string) {
    const lines = wrap(text, 92).slice(0, 9);
    const boxH = 26 + lines.length * 13;
    if (y - boxH < 300) return;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.5,
      color: rule,
    });
    page.drawRectangle({ x: left, y: y - boxH, width: 2, height: boxH, color: crimson });
    page.drawText(heading, { x: left + 10, y: y - 14, size: 8.5, font: bold, color: navy });
    let ly = y - 30;
    for (const line of lines) {
      page.drawText(line, { x: left + 10, y: ly, size: 10, font: body, color: slate });
      ly -= 13;
    }
    y -= boxH + 14;
  }

  if (meta.summary) drawBlock("FACTUAL SUMMARY OF THIS DOCUMENT", meta.summary);
  if (meta.affectsAciah) drawBlock("BEARING ON HARDSHIP TO THE U.S. CITIZEN SPOUSE", meta.affectsAciah);

  // Space kept for the visual preview of the original, drawn once it is loaded.
  const previewTop = y;

  // ---- Append the original, untouched.
  let originalPages = 0;
  let originalNote = "The original file could not be embedded; it stays in Drive unchanged.";
  let preview:
    | {
        width: number;
        height: number;
        page?: import("pdf-lib").PDFEmbeddedPage;
        image?: import("pdf-lib").PDFImage;
      }
    | null = null;
  try {
    let source: { bytes: Uint8Array; kind: "pdf" | "png" | "jpg" } | null = null;
    if (!embedOriginal) {
      originalNote =
        "The original pages could not be copied by the reader; the untouched original stays in Drive.";
    } else if (data.base64) {
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      const mime = data.mimeType ?? "";
      const name = data.fileName.toLowerCase();
      if (mime === "application/pdf" || name.endsWith(".pdf")) source = { bytes, kind: "pdf" };
      else if (/png/.test(mime) || name.endsWith(".png")) source = { bytes, kind: "png" };
      else if (/jpe?g/.test(mime) || /\.jpe?g$/.test(name)) source = { bytes, kind: "jpg" };
      else if (data.driveFileId)
        source = await fetchOriginalForEmbedding({
          fileId: data.driveFileId,
          fileName: data.fileName,
          mimeType: mime,
        });
    } else if (data.driveFileId) {
      source = await fetchOriginalForEmbedding({
        fileId: data.driveFileId,
        fileName: data.fileName,
        mimeType: data.mimeType ?? "",
      });
    }

    if (source?.kind === "pdf") {
      const src = await PDFDocument.load(source.bytes, { ignoreEncryption: true });
      // Some originals only reveal broken compression when their streams are
      // rewritten. Probe here so a bad original degrades to a cover sheet.
      await src.save({ useObjectStreams: false });
      const copied = await doc.copyPages(src, src.getPageIndices());
      for (const p of copied) doc.addPage(p);
      originalPages = copied.length;
      originalNote = "";
      const [firstPage] = await doc.embedPdf(src, [0]);
      if (firstPage) preview = { width: firstPage.width, height: firstPage.height, page: firstPage };
    } else if (source) {
      const image =
        source.kind === "png" ? await doc.embedPng(source.bytes) : await doc.embedJpg(source.bytes);
      const imgPage = doc.addPage([595.28, 841.89]);
      const scale = Math.min((595.28 - 72) / image.width, (841.89 - 72) / image.height, 1);
      imgPage.drawImage(image, {
        x: (595.28 - image.width * scale) / 2,
        y: (841.89 - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
      });
      originalPages = 1;
      originalNote = "";
      preview = { width: image.width, height: image.height, image };
    }
  } catch (error) {
    originalNote = `The original could not be embedded (${error instanceof Error ? error.message : "unknown error"}); it stays in Drive unchanged.`;
  }

  // ---- Visual preview of the original's first page, filling the cover sheet.
  const previewBottom = 132;
  const availableH = previewTop - previewBottom - 24;
  if (preview && availableH > 90) {
    const availableW = contentW;
    const scale = Math.min(availableW / preview.width, availableH / preview.height);
    const drawW = preview.width * scale;
    const drawH = preview.height * scale;
    const frameX = left + (availableW - drawW) / 2;
    const frameY = previewBottom + (availableH - drawH) / 2;
    page.drawText("FIRST PAGE OF THE ORIGINAL, REPRODUCED FOR REFERENCE", {
      x: left,
      y: previewTop - 10,
      size: 7,
      font: bold,
      color: label,
    });
    page.drawRectangle({
      x: frameX - 4,
      y: frameY - 4,
      width: drawW + 8,
      height: drawH + 8,
      color: paper,
      borderColor: rule,
      borderWidth: 0.6,
    });
    if (preview.page) {
      page.drawPage(preview.page, { x: frameX, y: frameY, width: drawW, height: drawH });
    } else if (preview.image) {
      page.drawImage(preview.image, { x: frameX, y: frameY, width: drawW, height: drawH });
    }
  } else if (availableH > 60) {
    // Nothing to reproduce: state it plainly rather than leaving a blank void.
    const noticeH = Math.min(availableH, 96);
    const noticeY = previewBottom + (availableH - noticeH) / 2;
    page.drawRectangle({
      x: left,
      y: noticeY,
      width: contentW,
      height: noticeH,
      borderColor: rule,
      borderWidth: 0.6,
    });
    page.drawText("ORIGINAL PAGES NOT REPRODUCED IN THIS CLONE", {
      x: left + 14,
      y: noticeY + noticeH - 22,
      size: 8.5,
      font: bold,
      color: navy,
    });
    let ny = noticeY + noticeH - 40;
    for (const line of wrap(
      `The original file "${data.fileName}" is retained unchanged in the case record and is available on request. This cover sheet indexes that original.`,
      90,
    ).slice(0, 3)) {
      page.drawText(line, { x: left + 14, y: ny, size: 9, font: body, color: slate });
      ny -= 13;
    }
    if (originalNote) {
      page.drawText(originalNote.slice(0, 110), {
        x: left + 14,
        y: ny - 2,
        size: 7.5,
        font: italic,
        color: label,
      });
    }
  }


  // ---- Verification zone: page references and the routine trail, kept last.
  let totalPages = originalPages + 1;
  const pageReference = originalPages
    ? `Cover sheet: page 1 of ${totalPages} · Original document: pages 2–${totalPages} (${originalPages} page${originalPages > 1 ? "s" : ""})`
    : `Cover sheet: page 1 of ${totalPages} · Original document held separately in Drive`;

  page.drawLine({
    start: { x: left, y: 112 },
    end: { x: right, y: 112 },
    thickness: 0.5,
    color: rule,
  });
  page.drawText("VERIFICATION AND PAGE REFERENCES", {
    x: left,
    y: 100,
    size: 7.5,
    font: bold,
    color: navy,
  });
  page.drawText(pageReference, { x: left, y: 86, size: 9, font: body, color: slate });
  page.drawText(
    originalPages
      ? "This cover sheet was prepared from the original record; the original pages that follow are reproduced without alteration."
      : "This cover sheet was prepared from the original record, which is retained unchanged in the case file.",
    { x: left, y: 74, size: 8, font: body, color: slate },
  );

  const trail: [string, string][] = [
    ["Review status", meta.status || "Not stated"],
    ["Prepared by", meta.addedBy],
    ["Prepared on", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    ["Drive file id", data.driveFileId ?? "Not recorded"],
  ];
  trail.forEach(([key, value], index) => {
    const x = left + (index % 2) * (colW + 20);
    const ry = 58 - Math.floor(index / 2) * 20;
    const keyText = `${key.toUpperCase()}:`;
    page.drawText(keyText, { x, y: ry, size: 6.5, font: bold, color: label });
    page.drawText(wrap(value, 40)[0] ?? "", {
      x: x + bold.widthOfTextAtSize(keyText, 6.5) + 4,
      y: ry,
      size: 6.5,
      font: body,
      color: slate,
    });
  });
  if (originalNote && originalPages) {
    page.drawText(originalNote.slice(0, 116), {
      x: left,
      y: 27,
      size: 7,
      font: italic,
      color: crimson,
    });
  }


  // Footer stamp on every page, so any loose page can be traced back.
  const all = doc.getPages();
  const stampRight = `I-601 · Imran & Aciah · ${data.folderPath || "Drive root"}`.slice(0, 78);
  all.forEach((p, index) => {
    const size = p.getSize();
    if (index > 0) {
      p.drawLine({
        start: { x: 40, y: 30 },
        end: { x: size.width - 40, y: 30 },
        thickness: 0.4,
        color: rule,
      });
    }
    p.drawText(`${meta.exhibitId} · page ${index + 1} of ${all.length}`, {
      x: 40,
      y: 19,
      size: 7.5,
      font: italic,
      color: label,
    });
    p.drawText(stampRight, {
      x: size.width - 40 - italic.widthOfTextAtSize(stampRight, 7),
      y: 19,
      size: 7,
      font: italic,
      color: label,
    });
  });

  doc.setTitle(`${meta.exhibitId} — ${meta.title || data.fileName}`);
  doc.setSubject(meta.summary || meta.title);
  doc.setKeywords([meta.exhibitId, ...meta.categories, ...meta.people, ...meta.tags]);
  doc.setAuthor(meta.addedBy);
  doc.setProducer("GC Case Portal");

  const base = slug(data.fileName.replace(/\.[^.]+$/, ""));
  const date = (meta.documentDate || "undated").slice(0, 10);
  const name = `${meta.exhibitId}_${base}_${date}_${slug(meta.person || "unassigned")}.pdf`;

  const clonePath = [CLONE_ROOT, data.folderPath].filter(Boolean).join("/");
  const folderId = await ensureFolder(clonePath);

  const pdfBase64 = await doc.saveAsBase64();
  const uploaded = await uploadMultipart({
    name,
    mimeType: "application/pdf",
    parents: [folderId],
    base64: pdfBase64,
    description: `${meta.exhibitId} · ${meta.title} · ${meta.categories.join(", ")}`,
    properties: {
      exhibitId: meta.exhibitId,
      documentDate: date,
      person: meta.person || "",
      originalFile: data.fileName.slice(0, 120),
      originalDriveId: data.driveFileId ?? "",
    },
  });

  return {
    id: uploaded.id,
    name: uploaded.name,
    webViewLink: uploaded.webViewLink ?? "",
    folderPath: clonePath,
    originalPages,
    totalPages,
    note: originalNote,
  };
}
