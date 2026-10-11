import { useEffect, useState } from "react";
import {
  EyeOff,
  History,
  Languages,
  Link2,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { TAGS, type Category, type EvidenceItem } from "@/lib/evidence/types";
import { toast } from "sonner";
import { DocumentPreview, shortSummaryOf } from "./DocumentPreview";
import { StatusSelect, TagChip } from "./status-ui";
import { VerificationBadge } from "./VerificationBadge";
import type { CaseGap } from "@/lib/evidence/review";

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

/**
 * The exact field a flag is about, rendered inline under the flag message so it
 * can be corrected right there instead of hunting for it elsewhere.
 */
function GapInlineField({
  item,
  gap,
  categories,
  updateItem,
  onReadWithAi,
  reading,
}: {
  item: EvidenceItem;
  gap: CaseGap;
  categories: Category[];
  updateItem: (id: string, patch: Partial<EvidenceItem>, message?: string) => void;
  onReadWithAi: () => void;
  reading: boolean;
}) {
  const [peopleDraft, setPeopleDraft] = useState<string | null>(null);
  const [impactDraft, setImpactDraft] = useState<string | null>(null);
  useEffect(() => {
    setPeopleDraft(null);
    setImpactDraft(null);
  }, [gap.id]);

  const peopleValue = peopleDraft ?? (item.people ?? []).join(", ");
  const impactValue = impactDraft ?? (item.affectsAciah ?? "");

  switch (gap.kind) {
    case "evidence-no-date":
      return (
        <div className="mt-2 space-y-1.5">
          <Label className="text-[11px]">Document date</Label>
          <Input
            type="date"
            value={item.dateOfDocument ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              if (!value || value === (item.dateOfDocument ?? "")) return;
              updateItem(item.id, { dateOfDocument: value }, `${item.exhibitId} dated ${value}`);
            }}
            className="h-10 text-xs"
          />
        </div>
      );
    case "evidence-no-person":
      return (
        <div className="mt-2 space-y-1.5">
          <Label className="text-[11px]">Who this is about (comma separated)</Label>
          <Input
            value={peopleValue}
            onChange={(e) => setPeopleDraft(e.target.value)}
            onBlur={() => {
              const people = peopleValue
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
              if (people.join(", ") === (item.people ?? []).join(", ")) return;
              updateItem(item.id, { people }, `${item.exhibitId} people recorded`);
            }}
            placeholder="e.g. Aciah, Jibril"
            className="h-10 text-xs"
          />
        </div>
      );
    case "evidence-no-category":
      return (
        <div className="mt-2 space-y-1.5">
          <Label className="text-[11px]">Hardship category</Label>
          <Select
            value={(item.categories?.length ? item.categories : [item.category])[0] ?? ""}
            onValueChange={(v) =>
              updateItem(item.id, { category: v, categories: [v] }, `Filed under ${v}`)
            }
          >
            <SelectTrigger className="h-10 text-xs">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "aciah-impact":
      return (
        <div className="mt-2 space-y-1.5">
          <Label className="text-[11px]">How this affects Aciah</Label>
          <Textarea
            value={impactValue}
            onChange={(e) => setImpactDraft(e.target.value)}
            onBlur={() => {
              if (impactValue === (item.affectsAciah ?? "")) return;
              updateItem(item.id, { affectsAciah: impactValue }, `${item.exhibitId} Aciah impact recorded`);
            }}
            rows={3}
            placeholder="Explain the effect on Aciah in your own words…"
            className="text-xs"
          />
        </div>
      );
    case "evidence-awaiting-confirmation":
    case "evidence-ai-conflict":
      return (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-[11px]"
            disabled={reading}
            onClick={onReadWithAi}
          >
            {reading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {reading ? "Reading…" : "Read with AI"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Then pick the correct option in the reading below.
          </p>
        </div>
      );
    default:
      return null;
  }
}

export function InspectorDrawer({ onEdit }: { onEdit: (item: EvidenceItem) => void }) {
  const {
    items,
    inspectorId,
    openInspector,
    updateItem,
    deleteItem,
    runExtraction,
    extractingIds,
    confirmExtractionField,
    dismissExtractionField,
    profile,
    gaps,
    ignoreGap,
    categories,
  } = useEvidence();
  const item = items.find((i) => i.id === inspectorId) ?? null;
  const itemGaps = item ? gaps.filter((g) => g.recordType === "evidence" && g.recordId === item.id) : [];

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
              <p className="text-[11px] leading-snug text-navy-foreground/80">
                {shortSummaryOf(item)}
              </p>
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
                <Button
                  size="sm"
                  className="h-9 text-xs"
                  disabled={extractingIds.includes(item.id)}
                  onClick={() => void runExtraction(item.id)}
                >
                  <Sparkles className="size-3.5" />
                  {extractingIds.includes(item.id) ? "Reading…" : "Read with AI"}
                </Button>
              </div>

              {itemGaps.length > 0 && (
                <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-3">
                  <p className="text-[10px] font-semibold tracking-wider text-destructive uppercase">
                    Needs your attention ({itemGaps.length})
                  </p>
                  <ul className="mt-2 space-y-2">
                    {itemGaps.map((gap) => (
                      <li
                        key={gap.id}
                        className="rounded-md border border-destructive/40 bg-card p-2.5"
                      >
                        <p className="text-xs font-semibold text-destructive">{gap.label}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{gap.detail}</p>
                        <GapInlineField
                          item={item}
                          gap={gap}
                          categories={categories}
                          updateItem={updateItem}
                          onReadWithAi={() => void runExtraction(item.id)}
                          reading={extractingIds.includes(item.id)}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            className="h-9 text-[11px]"
                            onClick={() => onEdit(item)}
                          >
                            <Pencil className="size-3.5" /> Fix now
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 text-[11px]"
                            onClick={() => {
                              ignoreGap(gap.id);
                              toast.success("Ignored", { description: gap.label });
                            }}
                          >
                            <EyeOff className="size-3.5" /> Ignore
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}



              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <Sparkles className="size-3" /> Reading the document
                </p>
                {!item.aiExtraction ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Not read yet. “Read with AI” scans the document twice and only fills in what
                    both scans agree on — anything uncertain is asked below.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {formatDateTime(item.aiExtraction.ranAt)} ·{" "}
                      {item.aiExtraction.contentRead
                        ? "double scan of the file"
                        : "file not readable — name and folder only"}
                      {item.aiExtraction.language ? ` · ${item.aiExtraction.language}` : ""}
                    </p>
                    {item.aiExtraction.summary && (
                      <p className="text-xs text-foreground/85">{item.aiExtraction.summary}</p>
                    )}
                    <VerificationBadge report={item.aiExtraction.verification} showAudit />
                    {item.aiExtraction.applied.length > 0 && (
                      <p className="text-[11px] text-success">
                        Checked twice: {item.aiExtraction.applied.join(", ")}
                      </p>
                    )}
                    {item.aiExtraction.uncertain.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Nothing left to confirm.</p>
                    ) : (
                      <ul className="space-y-2">
                        {item.aiExtraction.uncertain.map((u) => (
                          <li
                            key={u.field}
                            className="rounded-md border border-warning/50 bg-warning/10 p-2"
                          >
                            <p className="text-[11px] font-medium text-foreground">
                              Which {u.field} is correct?
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {u.options.map((opt) => (
                                <Button
                                  key={opt}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 max-w-full text-[11px]"
                                  onClick={() => confirmExtractionField(item.id, u.field, opt)}
                                >
                                  <span className="truncate">{opt}</span>
                                </Button>
                              ))}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-[11px] text-muted-foreground"
                                onClick={() => dismissExtractionField(item.id, u.field)}
                              >
                                Neither — keep as is
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <DocumentPreview item={item} />

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
                <Field
                  label="Added by"
                  value={`${item.createdBy} · ${formatDate(item.createdAt)}`}
                />
                <Field
                  label="Last edited"
                  value={`${formatDateTime(item.updatedAt)} · ${item.lastEditedBy}`}
                />
                <Field
                  label="Drive"
                  value={item.driveFileId ? (item.driveFolder ?? "Stored") : "Not synced to Drive"}
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
