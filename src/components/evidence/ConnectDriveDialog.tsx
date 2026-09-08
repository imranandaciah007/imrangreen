import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudCog, FolderSync, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listDriveFiles } from "@/lib/drive.functions";
import { classifyDriveFile, fileTypeFor, titleFromName } from "@/lib/evidence/drive-classify";
import { useEvidence } from "@/lib/evidence/store";
import type { EvidenceItem } from "@/lib/evidence/types";

type Draft = Omit<
  EvidenceItem,
  "id" | "auditTrail" | "createdBy" | "lastEditedBy" | "createdAt" | "updatedAt"
>;

interface SyncResult {
  added: number;
  skipped: number;
  needsConfirmation: number;
  unsupported: number;
}

export function ConnectDriveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { connection, connectDrive, importItems, profile } = useEvidence();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const startedForOpen = useRef(false);

  const syncNow = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const { files } = await listDriveFiles();
      const drafts: Draft[] = [];
      let unsupported = 0;

      files.forEach((file, index) => {
        const fileType = fileTypeFor(file.name, file.mimeType);
        if (!fileType) {
          unsupported += 1;
          return;
        }
        const cls = classifyDriveFile(file);
        const title = titleFromName(file.name);
        const primary = cls?.categories[0] ?? "Other";
        drafts.push({
          exhibitId: `Exhibit D-${index + 1}`,
          fileName: file.name,
          title,
          category: primary,
          categories: cls?.categories ?? ["Other"],
          subCategory: file.parentFolders[0] || "Google Drive",
          sourceType: cls?.sourceType ?? "Other",
          people: cls?.people ?? ["Third party"],
          fileType,
          fileSizeBytes: file.size,
          mimeType: file.mimeType,
          pageCount: 1,
          status: cls?.status ?? "Needs confirmation",
          dateOfDocument: (file.modifiedTime || new Date().toISOString()).slice(0, 10),
          tags: cls?.tags ?? [],
          cloudDriveUrl: file.webViewLink || "",
          driveFileId: file.id,
          driveFolder: file.parentFolders[0],
          aiConfidence: cls?.confidence,
          notes: cls ? `Imported from Google Drive. ${cls.reason}` : "Imported from Google Drive.",
        });
      });

      const { added, skipped } = await importItems(drafts);
      const needsConfirmation = drafts.filter((d) => d.status === "Needs confirmation").length;
      connectDrive({ accountLabel: "Google Drive", folderPath: "/My Drive/" });
      setResult({ added, skipped, needsConfirmation, unsupported });
      toast.success(`Drive sync complete`, {
        description: `${added} new item(s) sorted · ${skipped} already imported · ${needsConfirmation} need your confirmation`,
      });
    } catch (error) {
      console.error(error);
      toast.error("Drive sync failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!open) {
      startedForOpen.current = false;
      return;
    }
    if (!startedForOpen.current) {
      startedForOpen.current = true;
      void syncNow();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CloudCog className="size-4" /> Synch Drive
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your Google Drive account is linked. Sync scans it, imports each PDF, Word document or
            photo, and sorts it between Imran, Aciah and Jibril using the file and folder names.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-border bg-secondary/60 p-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <p>
              Originals are never changed — the app reads file names and details only. Anything it
              can't sort with confidence is marked <em>Needs confirmation</em> so you can check it
              yourself.
            </p>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <div>
                  <p className="text-sm font-bold text-foreground">Drive synched successfully</p>
                  <p className="text-[11px] text-muted-foreground">
                    Your latest Drive files have been checked and the case is up to date.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold">{result.added}</p>
                <p className="text-muted-foreground">New items imported</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold">{result.needsConfirmation}</p>
                <p className="text-muted-foreground">Need your confirmation</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold">{result.skipped}</p>
                <p className="text-muted-foreground">Already imported</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold">{result.unsupported}</p>
                <p className="text-muted-foreground">Unsupported files skipped</p>
              </div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Last synched:{" "}
            {connection?.lastSyncedAt
              ? new Date(connection.lastSyncedAt).toLocaleString()
              : "never"}
            {profile ? ` · acting as ${profile}` : ""}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Close
          </Button>
          <Button size="sm" className="text-xs" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FolderSync className="size-3.5" />
            )}
            {syncing ? "Synching Drive…" : "Synch Drive again"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
