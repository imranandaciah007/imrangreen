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
      fields:
        "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
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
