import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files";
const CLONE_ROOT = "I601 Evidence Clones";

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
}

function driveHeaders() {
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

async function driveJson<T>(url: string, init?: RequestInit): Promise<T> {
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
}

/** Whole-Drive folder tree plus files, each with its full folder path. */
export const listDriveTree = createServerFn({ method: "GET" }).handler(async () => {
  const raw: RawFile[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 25; page += 1) {
    const params = new URLSearchParams({
      q: "trashed = false",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
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
});

/** Find or create a folder path, returning the deepest folder id. */
async function ensureFolder(path: string): Promise<string> {
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

/** Rename a Drive file or folder (originals keep their contents untouched). */
export const renameDriveNode = createServerFn({ method: "POST" })
  .inputValidator((data: { fileId: string; name: string }) => {
    if (!data?.fileId || !data?.name?.trim()) throw new Error("A file and a new name are required.");
    return { fileId: data.fileId, name: data.name.trim() };
  })
  .handler(async ({ data }) => {
    const updated = await driveJson<{ id: string; name: string }>(
      `${GATEWAY}/drive/v3/files/${data.fileId}?fields=id,name&supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name }),
      },
    );
    return updated;
  });

/** Move a Drive file or folder into another folder (by id, or "root"). */
export const moveDriveNode = createServerFn({ method: "POST" })
  .inputValidator((data: { fileId: string; targetFolderId: string; currentParentId?: string | null }) => {
    if (!data?.fileId || !data?.targetFolderId) throw new Error("A file and a destination are required.");
    return data;
  })
  .handler(async ({ data }) => {
    const current = await driveJson<{ parents?: string[] }>(
      `${GATEWAY}/drive/v3/files/${data.fileId}?fields=parents&supportsAllDrives=true`,
    );
    const removeParents = (current.parents ?? []).join(",");
    const params = new URLSearchParams({
      fields: "id,name,parents",
      addParents: data.targetFolderId,
      supportsAllDrives: "true",
    });
    if (removeParents) params.set("removeParents", removeParents);
    const moved = await driveJson<{ id: string; name: string; parents?: string[] }>(
      `${GATEWAY}/drive/v3/files/${data.fileId}?${params.toString()}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    return moved;
  });

/** Create a folder anywhere in the mirrored tree. */
export const createDriveFolder = createServerFn({ method: "POST" })
  .inputValidator((data: { path: string }) => {
    if (!data?.path?.trim()) throw new Error("A folder path is required.");
    return data;
  })
  .handler(async ({ data }) => {
    const id = await ensureFolder(data.path);
    return { id, path: data.path };
  });

async function uploadMultipart(input: {
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

/** Upload a new original evidence file into a mirrored Drive folder. */
export const uploadEvidenceToFolder = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { folderPath: string; name: string; mimeType: string; base64: string }) => {
      if (!data?.name || !data?.base64) throw new Error("A file name and contents are required.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const folderId = data.folderPath ? await ensureFolder(data.folderPath) : "root";
    const file = await uploadMultipart({
      name: data.name,
      mimeType: data.mimeType || "application/octet-stream",
      parents: [folderId],
      base64: data.base64,
    });
    return { ...file, folderPath: data.folderPath };
  });

async function fetchDriveBytes(fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media`, {
    headers: driveHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not download the original file [${res.status}]: ${text}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function slug(value: string) {
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

/**
 * Build the annotated clone of one exhibit: a cover sheet carrying the case
 * information, followed by the original pages. The original file is only read.
 */
export const generateCloneDocument = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      driveFileId?: string | undefined;
      fileName: string;
      folderPath: string;
      mimeType?: string | undefined;
      base64?: string | undefined;
      meta: CloneMeta;
    }) => {
      if (!data?.fileName || !data?.meta?.exhibitId) {
        throw new Error("The exhibit number and file name are required.");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const meta = data.meta;

    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const body = await doc.embedFont(StandardFonts.Helvetica);

    const page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const left = 56;
    let y = height - 74;

    page.drawRectangle({
      x: 0,
      y: height - 34,
      width,
      height: 34,
      color: rgb(0.09, 0.13, 0.28),
    });
    page.drawText("I-601 HARDSHIP EVIDENCE — ANNOTATED CLONE", {
      x: left,
      y: height - 23,
      size: 10,
      font: bold,
      color: rgb(1, 1, 1),
    });

    page.drawText(meta.exhibitId, { x: left, y, size: 26, font: bold, color: rgb(0.7, 0.11, 0.14) });
    y -= 30;
    for (const line of wrap(meta.title || data.fileName, 62)) {
      page.drawText(line, { x: left, y, size: 14, font: bold, color: rgb(0.09, 0.13, 0.28) });
      y -= 19;
    }
    y -= 10;

    const rows: [string, string][] = [
      ["Document date", meta.documentDate || "Not stated"],
      ["Original file", data.fileName],
      ["Drive folder", data.folderPath || "Drive root"],
      ["Hardship categories", meta.categories.join(", ") || "Uncategorised"],
      ["People involved", meta.people.join(", ") || "Not stated"],
      ["Source type", meta.sourceType || "Not stated"],
      ["Review status", meta.status || "Not stated"],
      ["Tags", meta.tags.join(", ") || "None"],
      ["Added by", meta.addedBy],
      ["Clone generated", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    ];
    if (data.driveFileId) rows.push(["Drive file id", data.driveFileId]);

    for (const [label, value] of rows) {
      page.drawText(label.toUpperCase(), {
        x: left,
        y,
        size: 7.5,
        font: bold,
        color: rgb(0.42, 0.45, 0.52),
      });
      const lines = wrap(value, 58);
      let vy = y - 12;
      for (const line of lines) {
        page.drawText(line, { x: left, y: vy, size: 10.5, font: body, color: rgb(0.1, 0.1, 0.14) });
        vy -= 13;
      }
      y = vy - 8;
      page.drawLine({
        start: { x: left, y: y + 4 },
        end: { x: width - left, y: y + 4 },
        thickness: 0.5,
        color: rgb(0.86, 0.87, 0.9),
      });
      y -= 6;
      if (y < 150) break;
    }

    if (meta.summary && y > 120) {
      page.drawText("FACTUAL SUMMARY", {
        x: left,
        y,
        size: 7.5,
        font: bold,
        color: rgb(0.42, 0.45, 0.52),
      });
      y -= 13;
      for (const line of wrap(meta.summary, 82)) {
        if (y < 80) break;
        page.drawText(line, { x: left, y, size: 9.5, font: body, color: rgb(0.1, 0.1, 0.14) });
        y -= 12;
      }
    }
    if (meta.affectsAciah && y > 70) {
      y -= 8;
      page.drawText("EFFECT ON ACIAH", {
        x: left,
        y,
        size: 7.5,
        font: bold,
        color: rgb(0.42, 0.45, 0.52),
      });
      y -= 13;
      for (const line of wrap(meta.affectsAciah, 82)) {
        if (y < 50) break;
        page.drawText(line, { x: left, y, size: 9.5, font: body, color: rgb(0.1, 0.1, 0.14) });
        y -= 12;
      }
    }

    // Append the original, untouched.
    let originalPages = 0;
    let originalNote = "The original file could not be embedded; it stays in Drive unchanged.";
    try {
      const bytes = data.base64
        ? Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0))
        : data.driveFileId
          ? await fetchDriveBytes(data.driveFileId)
          : null;
      const mime = data.mimeType ?? "";
      if (bytes && (mime === "application/pdf" || data.fileName.toLowerCase().endsWith(".pdf"))) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await doc.copyPages(src, src.getPageIndices());
        for (const p of copied) doc.addPage(p);
        originalPages = copied.length;
        originalNote = "";
      } else if (bytes && /image\/(png|jpe?g)/.test(mime)) {
        const image = mime.includes("png")
          ? await doc.embedPng(bytes)
          : await doc.embedJpg(bytes);
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
      }
    } catch (error) {
      originalNote = `The original could not be embedded (${error instanceof Error ? error.message : "unknown error"}); it stays in Drive unchanged.`;
    }

    if (originalNote) {
      page.drawText(originalNote, {
        x: left,
        y: 46,
        size: 8,
        font: body,
        color: rgb(0.55, 0.15, 0.15),
      });
    }

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
      totalPages: originalPages + 1,
      note: originalNote,
    };
  });

function wrap(text: string, perLine: number): string[] {
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
