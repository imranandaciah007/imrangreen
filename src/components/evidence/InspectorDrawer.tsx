import { useEffect, useState } from "react";
import { ExternalLink, FileText, History, Languages, Link2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatBytes, formatDate, formatDateTime } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { TAGS, type EvidenceItem } from "@/lib/evidence/types";
import { StatusSelect, TagChip } from "./status-ui";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-xs text-foreground">{value}</dd>
    </div>
  );
}

export function InspectorDrawer({ onEdit }: { onEdit: (item: EvidenceItem) => void }) {
  const { items, inspectorId, openInspector, updateItem, deleteItem } = useEvidence();
  const item = items.find((i) => i.id === inspectorId) ?? null;
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(item?.notes ?? "");
  }, [item?.id, item?.notes]);

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && openInspector(null)}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {item && (
          <>
            <SheetHeader className="border-b border-border bg-navy px-4 py-3 text-navy-foreground">
              <SheetTitle className="font-mono text-xs tracking-wide text-navy-foreground/80">
                {item.exhibitId}
              </SheetTitle>
              <SheetDescription className="text-sm leading-snug font-semibold text-navy-foreground">
                {item.title}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusSelect
                  value={item.status}
                  onChange={(status) =>
                    updateItem(item.id, { status }, `${item.exhibitId} → ${status}`)
                  }
                  className="w-auto"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => onEdit(item)}
                >
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs text-destructive"
                  onClick={() => deleteItem(item.id)}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
                {item.cloudDriveUrl && (
                  <Button variant="outline" size="sm" className="h-9 text-xs" asChild>
                    <a href={item.cloudDriveUrl} target="_blank" rel="noreferrer">
                      <Link2 className="size-3.5" /> Open file
                    </a>
                  </Button>
                )}
                {item.translationFileUrl && (
                  <Button variant="outline" size="sm" className="h-9 text-xs" asChild>
                    <a href={item.translationFileUrl} target="_blank" rel="noreferrer">
                      <Languages className="size-3.5" /> Translation
                    </a>
                  </Button>
                )}
              </div>

              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/60 text-muted-foreground">
                <FileText className="size-8 opacity-50" />
                <p className="text-xs font-medium">Document preview</p>
                <p className="max-w-[80%] text-center text-[10px]">
                  A PDF viewer mounts here once Google Drive is connected.
                </p>
                {item.cloudDriveUrl && (
                  <a
                    href={item.cloudDriveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-info underline"
                  >
                    Open original <ExternalLink className="size-3" />
                  </a>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field
                  label="File name"
                  value={<span className="font-mono">{item.fileName}</span>}
                />
                <Field label="File type" value={item.fileType} />
                <Field
                  label="Categories"
                  value={(item.categories?.length ? item.categories : [item.category]).join(", ")}
                />
                <Field label="Source type" value={item.sourceType} />
                <Field label="People" value={(item.people ?? []).join(", ") || "—"} />
                <Field label="Sub-category" value={item.subCategory} />
                <Field label="Pages" value={<span className="font-mono">{item.pageCount}</span>} />
                <Field
                  label="Size"
                  value={<span className="font-mono">{formatBytes(item.fileSizeBytes)}</span>}
                />
                <Field label="Document date" value={formatDate(item.dateOfDocument)} />
                <Field label="Added by" value={`${item.createdBy} · ${formatDate(item.createdAt)}`} />
                <Field
                  label="Last edited"
                  value={`${formatDateTime(item.updatedAt)} · ${item.lastEditedBy}`}
                />
                <Field
                  label="Drive"
                  value={item.driveFileId ? item.driveFolder ?? "Stored" : "Not synced to Drive"}
                />
              </dl>

              <div>
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Tags
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Array.from(new Set([...TAGS, ...item.tags])).map((tag) => {
                    const active = item.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() =>
                          updateItem(
                            item.id,
                            {
                              tags: active
                                ? item.tags.filter((t) => t !== tag)
                                : [...item.tags, tag],
                            },
                            active ? `Removed ${tag}` : `Tagged ${tag}`,
                          )
                        }
                        className={cn(
                          "min-h-9 rounded border px-2 font-mono text-[10px] transition-colors",
                          active
                            ? "border-navy bg-navy text-navy-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((t) => (
                    <TagChip key={t} tag={t} />
                  ))}
                </div>
              )}

              <Separator />

              <div>
                <div className="flex items-baseline justify-between">
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Case notes
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[10px]"
                    onClick={() => updateItem(item.id, { notes }, "Notes saved")}
                  >
                    Save notes
                  </Button>
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  placeholder="Why this matters for Aciah's hardship…"
                  className="mt-1.5 text-xs"
                />
              </div>

              <Separator />

              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <History className="size-3" /> History
                </p>
                <ol className="mt-2 space-y-2 border-l border-border pl-3">
                  {[...item.auditTrail].reverse().map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute top-1.5 -left-[17px] size-1.5 rounded-full bg-info" />
                      <p className="text-xs text-foreground">{entry.action}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {formatDateTime(entry.at)} · {entry.actor}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
