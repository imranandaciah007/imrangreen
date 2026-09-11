import { createServerFn } from "@tanstack/react-start";

export type {
  CloneMeta,
  DriveFileNode,
  DriveFolderNode,
} from "./drive-core.server";

/** Whole-Drive folder tree plus files, each with its full folder path. */
export const listDriveTree = createServerFn({ method: "GET" }).handler(async () => {
  const { listTree } = await import("./drive-core.server");
  return listTree();
});

/** Rename a Drive file or folder (contents stay untouched). */
export const renameDriveNode = createServerFn({ method: "POST" })
  .inputValidator((data: { fileId: string; name: string }) => {
    if (!data?.fileId || !data?.name?.trim()) throw new Error("A file and a new name are required.");
    return { fileId: data.fileId, name: data.name.trim() };
  })
  .handler(async ({ data }) => {
    const { renameNode } = await import("./drive-core.server");
    return renameNode(data.fileId, data.name);
  });

/** Move a Drive file or folder into another folder (by id, or "root"). */
export const moveDriveNode = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { fileId: string; targetFolderId: string; currentParentId?: string | null }) => {
      if (!data?.fileId || !data?.targetFolderId)
        throw new Error("A file and a destination are required.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { moveNode } = await import("./drive-core.server");
    return moveNode(data.fileId, data.targetFolderId);
  });

/** Create a folder anywhere in the mirrored tree. */
export const createDriveFolder = createServerFn({ method: "POST" })
  .inputValidator((data: { path: string }) => {
    if (!data?.path?.trim()) throw new Error("A folder path is required.");
    return data;
  })
  .handler(async ({ data }) => {
    const { ensureFolder } = await import("./drive-core.server");
    const id = await ensureFolder(data.path);
    return { id, path: data.path };
  });

/** Upload a new original evidence file into a mirrored Drive folder. */
export const uploadEvidenceToFolder = createServerFn({ method: "POST" })
  .inputValidator((data: { folderPath: string; name: string; mimeType: string; base64: string }) => {
    if (!data?.name || !data?.base64) throw new Error("A file name and contents are required.");
    return data;
  })
  .handler(async ({ data }) => {
    const { ensureFolder, uploadMultipart } = await import("./drive-core.server");
    const folderId = data.folderPath ? await ensureFolder(data.folderPath) : "root";
    const file = await uploadMultipart({
      name: data.name,
      mimeType: data.mimeType || "application/octet-stream",
      parents: [folderId],
      base64: data.base64,
    });
    return { ...file, folderPath: data.folderPath };
  });

/**
 * Build the annotated clone of one exhibit: cover sheet with exhibit number,
 * title, date and page references, followed by the original pages.
 */
export const generateCloneDocument = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      driveFileId?: string | undefined;
      fileName: string;
      folderPath: string;
      mimeType?: string | undefined;
      base64?: string | undefined;
      meta: import("./drive-core.server").CloneMeta;
    }) => {
      if (!data?.fileName || !data?.meta?.exhibitId) {
        throw new Error("The exhibit number and file name are required.");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { buildClone, findExistingClone } = await import("./drive-core.server");
    // Scan Drive first: adopt a clone that already exists for this original
    // instead of spending time and AI credit building a duplicate.
    if (data.driveFileId) {
      const existing = await findExistingClone(data.driveFileId, data.meta.exhibitId);
      if (existing) {
        return {
          id: existing.id,
          name: existing.name,
          webViewLink: existing.webViewLink,
          folderPath: "",
          originalPages: 0,
          totalPages: 0,
          note: "Existing clone adopted — no rebuild needed",
        };
      }
    }
    return buildClone(data);
  });
