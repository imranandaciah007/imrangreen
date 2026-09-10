import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "@/lib/evidence/types";

/** The one-line description shown on cards, rows and the clone cover sheet. */
export function shortSummaryOf(item: EvidenceItem) {
  const summary = item.aiExtraction?.summary?.trim();
  if (summary) return summary;
  const notes = item.notes?.trim();
  if (notes) return notes;
  const people = (item.people ?? []).filter((p) => p && p !== "Third party");
  const parts = [
    (item.categories?.length ? item.categories : [item.category]).join(", "),
    people.length ? people.join(" & ") : "",
    item.sourceType,
  ].filter(Boolean);
  return parts.join(" · ");
}

function previewSrc(id: string) {
  return `https://drive.google.com/file/d/${id}/preview`;
}

/** In-app viewer for the exhibit clone and the untouched original. */
export function DocumentPreview({ item, className }: { item: EvidenceItem; className?: string }) {
  const hasClone = Boolean(item.cloneFileId);
  const [showing, setShowing] = useState<"clone" | "original">(hasClone ? "clone" : "original");
  const activeId = showing === "clone" ? item.cloneFileId : item.driveFileId;
  const activeLink =
    showing === "clone" ? (item.cloneUrl ?? item.cloudDriveUrl) : item.cloudDriveUrl;

  return (
    <div className={cn("rounded-lg border border-border bg-secondary/40", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          {hasClone && (
            <>
              <Button
                size="sm"
                variant={showing === "clone" ? "default" : "outline"}
                className="h-8 text-[11px]"
                onClick={() => setShowing("clone")}
              >
                Exhibit clone
              </Button>
              <Button
                size="sm"
                variant={showing === "original" ? "default" : "outline"}
                className="h-8 text-[11px]"
                onClick={() => setShowing("original")}
              >
                Original
              </Button>
            </>
          )}
          {!hasClone && (
            <span className="text-[11px] font-medium text-muted-foreground">Original document</span>
          )}
        </div>
        {activeLink && (
          <Button size="sm" variant="outline" className="h-8 text-[11px]" asChild>
            <a href={activeLink} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> Open externally
            </a>
          </Button>
        )}
      </div>

      {activeId ? (
        <iframe
          key={activeId}
          title={`${item.exhibitId} preview`}
          src={previewSrc(activeId)}
          className="h-[52vh] max-h-[560px] w-full rounded-b-lg bg-background"
          allow="autoplay"
        />
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
          <FileText className="size-8 opacity-50" />
          <p className="text-xs font-medium">No file stored for this record yet</p>
          <p className="max-w-[80%] text-center text-[10px]">
            Synch Drive or upload the document to preview it here.
          </p>
        </div>
      )}
    </div>
  );
}
