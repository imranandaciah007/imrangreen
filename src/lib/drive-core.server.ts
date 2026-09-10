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
export async function buildClone(data: {
  driveFileId?: string | undefined;
  fileName: string;
  folderPath: string;
  mimeType?: string | undefined;
  base64?: string | undefined;
  meta: CloneMeta;
}): Promise<CloneResult> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const meta = data.meta;

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = await doc.embedFont(StandardFonts.Helvetica);

  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const left = 50;
  const right = width - 50;
  const contentW = right - left;

  const navy = rgb(0.06, 0.11, 0.25);
  const red = rgb(0.72, 0.1, 0.13);
  const ink = rgb(0.1, 0.11, 0.15);
  const muted = rgb(0.42, 0.45, 0.52);
  const ruleColor = rgb(0.86, 0.87, 0.9);
  const soft = rgb(0.965, 0.972, 0.985);
  const pale = rgb(0.72, 0.78, 0.88);

  // ---- Header band: the exhibit number and date read at a glance.
  page.drawRectangle({ x: 0, y: height - 124, width, height: 124, color: navy });
  page.drawRectangle({ x: 0, y: height - 130, width, height: 6, color: red });
  page.drawText("I-601 HARDSHIP EVIDENCE", {
    x: left,
    y: height - 40,
    size: 10,
    font: bold,
    color: rgb(0.82, 0.86, 0.94),
  });
  page.drawText("Annotated exhibit clone — original document unchanged", {
    x: left,
    y: height - 55,
    size: 9,
    font: body,
    color: pale,
  });
  page.drawText(meta.exhibitId, {
    x: left,
    y: height - 104,
    size: 34,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const dateValue = meta.documentDate || "Undated";
  page.drawText("DOCUMENT DATE", {
    x: right - body.widthOfTextAtSize("DOCUMENT DATE", 8),
    y: height - 78,
    size: 8,
    font: body,
    color: pale,
  });
  page.drawText(dateValue, {
    x: right - bold.widthOfTextAtSize(dateValue, 17),
    y: height - 100,
    size: 17,
    font: bold,
    color: rgb(1, 1, 1),
  });

  let y = height - 168;

  // ---- Title, large and clear.
  for (const line of wrap(meta.title || data.fileName, 44)) {
    if (y < 430) break;
    page.drawText(line, { x: left, y, size: 20, font: bold, color: navy });
    y -= 25;
  }
  y -= 12;

  // ---- Three key-fact panels.
  const panels: [string, string][] = [
    ["HARDSHIP CATEGORIES", meta.categories.join(", ") || "Uncategorised"],
    ["PEOPLE", meta.people.join(", ") || "Not stated"],
    ["SOURCE", meta.sourceType || "Not stated"],
  ];
  const panelW = (contentW - 20) / 3;
  const panelH = 68;
  panels.forEach(([label, value], index) => {
    const x = left + index * (panelW + 10);
    page.drawRectangle({
      x,
      y: y - panelH,
      width: panelW,
      height: panelH,
      color: soft,
      borderColor: ruleColor,
      borderWidth: 0.7,
    });
    page.drawRectangle({ x, y: y - panelH, width: 3, height: panelH, color: red });
    page.drawText(label, { x: x + 11, y: y - 17, size: 7, font: bold, color: muted });
    let vy = y - 32;
    for (const line of wrap(value, 24).slice(0, 3)) {
      page.drawText(line, { x: x + 11, y: vy, size: 10, font: bold, color: ink });
      vy -= 13;
    }
  });
  y -= panelH + 22;

  // ---- Prominent factual summary.
  function drawBlock(label: string, text: string, accent: ReturnType<typeof rgb>) {
    const lines = wrap(text, 88).slice(0, 9);
    const boxH = 30 + lines.length * 14;
    if (y - boxH < 250) return;
    page.drawRectangle({
      x: left,
      y: y - boxH,
      width: contentW,
      height: boxH,
      color: soft,
      borderColor: ruleColor,
      borderWidth: 0.7,
    });
    page.drawRectangle({ x: left, y: y - boxH, width: 3.5, height: boxH, color: accent });
    page.drawText(label, { x: left + 13, y: y - 18, size: 7.5, font: bold, color: muted });
    let ly = y - 34;
    for (const line of lines) {
      page.drawText(line, { x: left + 13, y: ly, size: 10.5, font: body, color: ink });
      ly -= 14;
    }
    y -= boxH + 16;
  }

  if (meta.summary) drawBlock("FACTUAL SUMMARY", meta.summary, red);
  if (meta.affectsAciah) drawBlock("EFFECT ON ACIAH", meta.affectsAciah, navy);

  // Space kept for the visual preview of the original, drawn once it is loaded.
  const previewTop = y;

  // ---- Routine reference details, kept small at the foot of the page.
  const detailTop = 196;
  page.drawLine({
    start: { x: left, y: detailTop + 16 },
    end: { x: right, y: detailTop + 16 },
    thickness: 0.7,
    color: ruleColor,
  });
  page.drawText("RECORD DETAILS", {
    x: left,
    y: detailTop + 2,
    size: 7,
    font: bold,
    color: muted,
  });

  const details: [string, string][] = [
    ["Original file", data.fileName],
    ["Drive folder", data.folderPath || "Drive root"],
    ["Review status", meta.status || "Not stated"],
    ["Tags", meta.tags.join(", ") || "None"],
    ["Added by", meta.addedBy],
    ["Clone generated", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
  ];
  if (data.driveFileId) details.push(["Drive file id", data.driveFileId]);

  const colW = contentW / 2 - 8;
  details.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = left + col * (colW + 16);
    const ry = detailTop - 14 - row * 32;
    if (ry < 66) return;
    page.drawText(label.toUpperCase(), { x, y: ry, size: 6.5, font: bold, color: muted });
    let vy = ry - 10;
    for (const line of wrap(value, 44).slice(0, 2)) {
      page.drawText(line, { x, y: vy, size: 8.5, font: body, color: ink });
      vy -= 10;
    }
  });

  // ---- Append the original, untouched.
  let originalPages = 0;
  let originalNote = "The original file could not be embedded; it stays in Drive unchanged.";
  try {
    let source: { bytes: Uint8Array; kind: "pdf" | "png" | "jpg" } | null = null;
    if (data.base64) {
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

  // ---- Page references so the cover sheet can be cited in the packet index.
  const totalPages = originalPages + 1;
  const pageReference = originalPages
    ? `Cover sheet: page 1 of ${totalPages} · Original document: pages 2–${totalPages} (${originalPages} page${originalPages > 1 ? "s" : ""})`
    : `Cover sheet: page 1 of ${totalPages} · Original document held separately in Drive`;

  page.drawText("PAGE REFERENCES", { x: left, y: 60, size: 6.5, font: bold, color: muted });
  page.drawText(pageReference, { x: left, y: 48, size: 8.5, font: body, color: ink });
  if (originalNote) {
    page.drawText(originalNote.slice(0, 110), {
      x: left,
      y: 36,
      size: 7.5,
      font: body,
      color: rgb(0.55, 0.15, 0.15),
    });
  }

  // Footer stamp on every page: exhibit number and page x of y.
  const all = doc.getPages();
  all.forEach((p, index) => {
    p.drawText(`${meta.exhibitId} · page ${index + 1} of ${all.length}`, {
      x: 40,
      y: 20,
      size: 7.5,
      font: body,
      color: rgb(0.45, 0.47, 0.53),
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
