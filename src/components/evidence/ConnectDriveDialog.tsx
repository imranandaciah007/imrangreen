import { useState } from "react";
import { CloudCog, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEvidence } from "@/lib/evidence/store";

export function ConnectDriveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { connection, connectDrive } = useEvidence();
  const [provider, setProvider] = useState("Google Drive");
  const [apiKey, setApiKey] = useState("");
  const [accountLabel, setAccountLabel] = useState(connection?.accountLabel ?? "");
  const [folderPath, setFolderPath] = useState(connection?.folderPath ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CloudCog className="size-4" /> Connect evidence folder
          </DialogTitle>
          <DialogDescription className="text-xs">
            Placeholder connection screen. The dashboard reads through a storage abstraction layer, so a live
            Google Drive, OneDrive, or S3 sync can replace the mock source without changing this UI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Storage provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Google Drive", "OneDrive / SharePoint", "Amazon S3", "Dropbox"].map((p) => (
                  <SelectItem key={p} value={p} className="text-xs">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Service account / API key</Label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza… (stored securely server-side once wired up)"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Connected account</Label>
            <Input
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
              placeholder="counsel@firm.com"
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Evidence folder path</Label>
            <Input
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/Petitions/2026/Evidence"
              className="font-mono text-xs"
            />
          </div>
          <p className="rounded-md border border-border bg-secondary/60 p-2 text-[11px] text-muted-foreground">
            Currently reading from <span className="font-mono">mock-google-drive</span> — 40 sample records, no
            network calls.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={() => {
              connectDrive({ apiKey, accountLabel, folderPath });
              onOpenChange(false);
            }}
          >
            <KeyRound className="size-3.5" /> Save connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
