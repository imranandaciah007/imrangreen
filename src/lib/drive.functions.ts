import { createServerFn } from "@tanstack/react-start";

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  webViewLink: string;
  parentFolders: string[];
}

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

/** List every non-trashed file in the connected Google Drive account (metadata only). */
export const listDriveFiles = createServerFn({ method: "GET" }).handler(async () => {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Google Drive is not linked to this project yet.");
  }

  const files: DriveFileSummary[] = [];
  const folderNames = new Map<string, string>();
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      q: "trashed = false",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
      pageSize: "1000",
      orderBy: "modifiedTime desc",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${GATEWAY}/drive/v3/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Drive list failed [${res.status}]: ${body}`);
      throw new Error(`Google Drive request failed [${res.status}]: ${body}`);
    }
    const data = (await res.json()) as {
      nextPageToken?: string;
      files?: {
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        modifiedTime?: string;
        webViewLink?: string;
        parents?: string[];
      }[];
    };

    for (const f of data.files ?? []) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        folderNames.set(f.id, f.name);
        continue;
      }
      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: Number(f.size ?? 0),
        modifiedTime: f.modifiedTime ?? "",
        webViewLink: f.webViewLink ?? "",
        parentFolders: f.parents ?? [],
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  // Resolve parent folder names for context-aware classification.
  for (const file of files) {
    file.parentFolders = file.parentFolders.map((p) => folderNames.get(p) ?? p);
  }

  return { files };
});

/** Find or create a folder path in Drive, returning the deepest folder id. */
async function ensureFolder(headers: HeadersInit, path: string): Promise<string> {
  let parent = "root";
  for (const name of path.split("/").filter(Boolean)) {
    const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parent}' in parents`;
    const res = await fetch(
      `${GATEWAY}/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)" })}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Drive folder lookup failed [${res.status}]: ${await res.text()}`);
    const found = ((await res.json()) as { files?: { id: string }[] }).files?.[0];
    if (found) {
      parent = found.id;
      continue;
    }
    const created = await fetch(`${GATEWAY}/drive/v3/files?fields=id`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parent],
      }),
    });
    if (!created.ok)
      throw new Error(`Could not create Drive folder [${created.status}]: ${await created.text()}`);
    parent = ((await created.json()) as { id: string }).id;
  }
  return parent;
}

/** Save a generated packet file into /I601 Evidence/Generated Case Packets/. Originals untouched. */
export const uploadPacketFile = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; mimeType: string; content: string; folderPath?: string }) => {
      if (!data?.name || !data?.content) throw new Error("A file name and content are required.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
    if (!lovableKey || !connectionKey)
      throw new Error("Google Drive is not linked to this project yet.");
    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
    };

    const folderPath = data.folderPath ?? "I601 Evidence/Generated Case Packets";
    const folderId = await ensureFolder(headers, folderPath);

    const boundary = `packet${Date.now()}`;
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({ name: data.name, parents: [folderId] }),
      `--${boundary}`,
      `Content-Type: ${data.mimeType}`,
      "",
      data.content,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    if (!res.ok) {
      const text = await res.text();
      console.error(`Drive upload failed [${res.status}]: ${text}`);
      throw new Error(`Google Drive upload failed [${res.status}]: ${text}`);
    }
    const file = (await res.json()) as { id: string; name: string; webViewLink?: string };
    return { id: file.id, name: file.name, webViewLink: file.webViewLink ?? "", folderPath };
  });
