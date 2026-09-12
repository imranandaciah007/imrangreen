import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, FileUp, Save, Sparkles, UploadCloud } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractUploadedFile, type ExtractionResult } from "@/lib/ai.functions";
import { generateCloneDocument, uploadEvidenceToFolder } from "@/lib/drive-tree.functions";
import { formatBytes } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import {
  PEOPLE,
  SOURCE_TYPES,
  STATUSES,
  TAGS,
  type Category,
  type EvidenceItem,
  type EvidenceStatus,
  type FileType,
  type SourceType,
} from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

function fileTypeOf(name: string): FileType {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "docx" || ext === "doc") return "DOCX";
  if (ext === "png") return "PNG";
  if (ext === "jpg" || ext === "jpeg") return "JPG";
  return "PDF";
}

/** Reads a picked file as base64 so the AI can read it before it reaches Drive. */
function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-navy bg-navy text-navy-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

export function UploadDialog({
  open,
  onOpenChange,
  initialCategory,
  editItem,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialCategory?: string | undefined;
  editItem?: EvidenceItem | null;
}) {
  const { addItem, updateItem, items, categories, addEvent, addTask, profile } = useEvidence();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const editing = !!editItem;

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [exhibitId, setExhibitId] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [subCategory, setSubCategory] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("Other");
  const [people, setPeople] = useState<string[]>([]);
  const [status, setStatus] = useState<EvidenceStatus>("New");
  const [pageCount, setPageCount] = useState("1");
  const [dateOfDocument, setDateOfDocument] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [affectsAciah, setAffectsAciah] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [ai, setAi] = useState<ExtractionResult | null>(null);
  const [uncertain, setUncertain] = useState<{ field: string; options: string[] }[]>([]);
  const [duplicate, setDuplicate] = useState<EvidenceItem | null>(null);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [alsoEvent, setAlsoEvent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFile(null);
    setAi(null);
    setAiRunning(false);
    setUncertain([]);
    setDuplicate(null);
    setDuplicateAck(false);
    setAlsoEvent(false);
    if (editItem) {
      setTitle(editItem.title);
      setExhibitId(editItem.exhibitId);
      setCats(editItem.categories?.length ? [...editItem.categories] : [editItem.category]);
      setSubCategory(editItem.subCategory);
      setSourceType(editItem.sourceType ?? "Other");
      setPeople([...(editItem.people ?? [])]);
      setStatus(editItem.status);
      setPageCount(String(editItem.pageCount));
      setDateOfDocument(editItem.dateOfDocument.slice(0, 10));
      setTags([...editItem.tags]);
      setNotes(editItem.notes);
      setAffectsAciah(editItem.affectsAciah ?? "");
    } else {
      setTitle("");
      setExhibitId("");
      setCats(initialCategory ? [initialCategory] : []);
      setSubCategory("");
      setSourceType("Other");
      setPeople(["Aciah"]);
      setStatus("New");
      setPageCount("1");
      setDateOfDocument("");
      setTags([]);
      setNotes("");
      setAffectsAciah("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editItem?.id, initialCategory]);

  const primary = cats[0] ?? initialCategory ?? categories[0] ?? "Other";

  const suggestedExhibit = useMemo(() => {
    const n = items.filter((i) => i.category === primary).length + 1;
    const idx = Math.max(0, categories.indexOf(primary));
    const letter = String.fromCharCode(65 + (idx % 26));
    return `Exhibit ${letter}-${n}`;
  }, [items, primary, categories]);

  /** Possible duplicate: same file name, or same size and same document date. */
  function findDuplicate(next: File, date: string) {
    const name = next.name.toLowerCase();
    return (
      items.find(
        (i) =>
          i.id !== editItem?.id &&
          (i.fileName.toLowerCase() === name ||
            (i.fileSizeBytes === next.size && next.size > 0) ||
            (!!date && i.dateOfDocument.slice(0, 10) === date && i.fileType === fileTypeOf(name))),
      ) ?? null
    );
  }

  async function runAi(next: File) {
    setAiRunning(true);
    try {
      const base64 = await toBase64(next);
      const result = await extractUploadedFile({
        data: {
          base64,
          fileName: next.name,
          mimeType: next.type || "application/pdf",
          allowedCategories: categories,
          allowedPeople: [...PEOPLE],
          allowedSourceTypes: [...SOURCE_TYPES],
          knownTitle: "",
        },
      });
      setAi(result);
      setUncertain(result.uncertain);
      const a = result.agreed;
      if (a.title) setTitle(a.title);
      if (a.documentDate && /^\d{4}-\d{2}-\d{2}$/.test(a.documentDate))
        setDateOfDocument(a.documentDate);
      if (a.people?.length) setPeople(a.people);
      if (a.categories?.length) {
        const valid = a.categories.filter((c) => categories.includes(c));
        if (valid.length) setCats(valid);
      }
      if (a.sourceType && (SOURCE_TYPES as readonly string[]).includes(a.sourceType))
        setSourceType(a.sourceType as SourceType);
      if (a.pageCount) setPageCount(String(a.pageCount));
      if (result.summary) setNotes((prev) => prev || result.summary);
      if (result.aciahImpact) setAffectsAciah((prev) => prev || result.aciahImpact);
      setStatus(result.uncertain.length ? "Needs confirmation" : "Reviewed");
      const dup = findDuplicate(next, a.documentDate ?? "");
      setDuplicate(dup);
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 180) : "AI could not read this file.");
    } finally {
      setAiRunning(false);
    }
  }

  function pick(next: File | null) {
    if (!next) return;
    setFile(next);
    setError(null);
    setAi(null);
    setUncertain([]);
    setDuplicate(null);
    setDuplicateAck(false);
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    void runAi(next);
  }

  function resolveUncertain(field: string, value: string | null) {
    if (value) {
      if (field === "title") setTitle(value);
      if (field === "documentDate") setDateOfDocument(value);
      if (field === "pageCount") setPageCount(value);
      if (field === "sourceType" && (SOURCE_TYPES as readonly string[]).includes(value))
        setSourceType(value as SourceType);
      if (field === "people")
        setPeople(
          value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        );
      if (field === "categories")
        setCats(
          value
            .split(",")
            .map((v) => v.trim())
            .filter((c) => categories.includes(c)),
        );
    }
    setUncertain((prev) => prev.filter((u) => u.field !== field));
  }

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function submit() {
    if (!editing && !file) {
      setError("Attach a file, or take a photo of the document.");
      return;
    }
    if (!title.trim()) {
      setError("Give the document a readable title.");
      return;
    }
    if (duplicate && !duplicateAck) {
      setError(
        `Possible duplicate of ${duplicate.exhibitId} — choose “Keep both” below or cancel.`,
      );
      return;
    }
    setSaving(true);
    try {
      const chosen = cats.length ? cats : [primary];
      const docDate = dateOfDocument || new Date().toISOString().slice(0, 10);
      const common = {
        exhibitId: exhibitId.trim() || suggestedExhibit,
        title: title.trim(),
        category: chosen[0]!,
        categories: chosen,
        subCategory: subCategory.trim() || "General",
        sourceType,
        people,
        pageCount: Math.max(1, Number(pageCount) || 1),
        status: uncertain.length ? ("Needs confirmation" as EvidenceStatus) : status,
        dateOfDocument: docDate,
        tags,
        notes: notes.trim(),
        affectsAciah: affectsAciah.trim() || undefined,
        needsTranslation: status === "Translation needed",
        duplicateSuspected: duplicate ? true : undefined,
        duplicateOfId: duplicate?.id,
        ...(ai
          ? {
              aiExtraction: {
                ranAt: ai.ranAt,
                contentRead: ai.contentRead,
                summary: ai.summary,
                language: ai.language,
                applied: Object.keys(ai.agreed),
                uncertain,
                passes: ai.passes as unknown as Record<string, unknown>[],
              },
            }
          : {}),
      };

      if (editing && editItem) {
        updateItem(
          editItem.id,
          {
            ...common,
            ...(file
              ? {
                  fileName: file.name,
                  fileType: fileTypeOf(file.name),
                  fileSizeBytes: file.size,
                  mimeType: file.type,
                  cloudDriveUrl:
                    typeof URL !== "undefined" && URL.createObjectURL
                      ? URL.createObjectURL(file)
                      : editItem.cloudDriveUrl,
                }
              : {}),
          },
          `${common.exhibitId} updated`,
        );
      } else if (file) {
        const base64 = await toBase64(file);
        const original = await uploadEvidenceToFolder({
          data: {
            folderPath: "I601 Evidence/Original Evidence",
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            base64,
          },
        });
        const created = await addItem(
          {
            ...common,
            fileName: file.name,
            fileType: fileTypeOf(file.name),
            fileSizeBytes: file.size,
            mimeType: file.type,
            cloudDriveUrl: original.webViewLink ?? "",
            driveFileId: original.id,
            driveFolder: "I601 Evidence/Original Evidence",
            translationFileUrl: undefined,
          },
          file,
        );
        await generateCloneDocument({
          data: {
            driveFileId: original.id,
            fileName: file.name,
            folderPath: "I601 Evidence/Original Evidence",
            mimeType: file.type || "application/octet-stream",
            meta: {
              exhibitId: created.exhibitId,
              title: created.title,
              documentDate: created.dateOfDocument,
              person: created.people[0] ?? "Aciah",
              categories: created.categories,
              people: created.people,
              sourceType: created.sourceType,
              status: created.status,
              summary: created.notes,
              tags: created.tags,
              affectsAciah: created.affectsAciah,
              addedBy: profile,
            },
          },
        });
        if (alsoEvent) {
          addEvent({
            date: docDate,
            title: common.title,
            category: common.category,
            categories: chosen,
            people,
            description: notes.trim(),
            effectOnAciah: affectsAciah.trim(),
            status: "Recorded",
            evidenceIds: [created.id],
          });
        }
        if (people.includes("Jibril") && !affectsAciah.trim()) {
          addTask({
            title: `Note how "${common.title}" affects Aciah`,
            category: common.category,
            dueDate: "",
            done: false,
            assignedTo: profile,
          });
        }
      }
      onOpenChange(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The evidence could not be saved to Drive.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {editing ? <Save className="size-4" /> : <UploadCloud className="size-4" />}
            {editing ? "Edit evidence" : "Add evidence"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            One item can sit in several hardship categories. The original file is never altered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "rounded-lg border border-dashed border-border bg-secondary/40 p-4 text-center transition-colors",
              dragging && "border-primary bg-primary/6",
            )}
          >
            <FileUp className="mx-auto size-5 text-muted-foreground" />
            {file ? (
              <p className="mt-1.5 font-mono text-xs font-semibold text-foreground">
                {file.name} · {formatBytes(file.size)}
              </p>
            ) : editing && editItem ? (
              <p className="mt-1.5 font-mono text-xs font-semibold text-foreground">
                {editItem.fileName} · {formatBytes(editItem.fileSizeBytes)}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">PDF, DOCX, JPG or PNG</p>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="size-4" /> Take photo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => inputRef.current?.click()}
              >
                <FileUp className="size-4" /> Choose file
              </Button>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,image/*,application/pdf"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>

          {(aiRunning || ai) && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <Sparkles className="size-3.5" />
                {aiRunning
                  ? "Reading the document twice…"
                  : uncertain.length === 0
                    ? "Verified by double scan"
                    : `${uncertain.length} field(s) need your confirmation`}
              </p>
              {ai && !ai.contentRead && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The file content could not be read — check the details below yourself.
                </p>
              )}
              {ai?.summary && <p className="mt-1.5 text-xs text-foreground/85">{ai.summary}</p>}
              {uncertain.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {uncertain.map((u) => (
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
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 max-w-full text-[11px]"
                            onClick={() => resolveUncertain(u.field, opt)}
                          >
                            <span className="truncate">{opt}</span>
                          </Button>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-9 text-[11px] text-muted-foreground"
                          onClick={() => resolveUncertain(u.field, null)}
                        >
                          Neither
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {duplicate && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <AlertTriangle className="size-3.5" /> Possible duplicate of {duplicate.exhibitId} —{" "}
                {duplicate.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 text-[11px]"
                  onClick={() => {
                    setDuplicateAck(true);
                    setDuplicate(null);
                    setError(null);
                  }}
                >
                  Keep both
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 text-[11px]"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel this upload
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Nothing is ever deleted automatically.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="GP letter — Aciah, anxiety review"
              className="h-11 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Hardship categories</Label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <Chip key={c} active={cats.includes(c)} onClick={() => toggle(cats, c, setCats)}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Evidence / source type</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
                <SelectTrigger className="h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EvidenceStatus)}>
                <SelectTrigger className="h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Document date</Label>
              <Input
                type="date"
                value={dateOfDocument}
                onChange={(e) => setDateOfDocument(e.target.value)}
                className="h-11 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pages</Label>
              <Input
                type="number"
                min="1"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                className="h-11 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exhibit ID</Label>
              <Input
                value={exhibitId}
                onChange={(e) => setExhibitId(e.target.value)}
                placeholder={suggestedExhibit}
                className="h-11 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sub-category</Label>
              <Input
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                placeholder="e.g. GP records"
                className="h-11 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">People involved</Label>
            <div className="flex flex-wrap gap-1.5">
              {PEOPLE.map((p) => (
                <Chip
                  key={p}
                  active={people.includes(p)}
                  onClick={() => toggle(people, p, setPeople)}
                >
                  {p}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {TAGS.map((t) => (
                <Chip key={t} active={tags.includes(t)} onClick={() => toggle(tags, t, setTags)}>
                  <span className="font-mono">{t}</span>
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Why this matters for Aciah's hardship…"
              className="text-xs"
            />
          </div>

          {(people.includes("Jibril") || people.includes("Other family")) && (
            <div className="space-y-1.5">
              <Label className="text-xs">How does this affect Aciah?</Label>
              <Textarea
                value={affectsAciah}
                onChange={(e) => setAffectsAciah(e.target.value)}
                rows={2}
                placeholder="Only what you can state as fact — e.g. Aciah is Jibril's sole carer during the separation."
                className="text-xs"
              />
            </div>
          )}

          {!editing && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={alsoEvent}
                onChange={(e) => setAlsoEvent(e.target.checked)}
                className="size-4"
              />
              Also add this to the hardship timeline
            </label>
          )}

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving || aiRunning} onClick={() => void submit()}>
            {editing ? "Save changes" : "Add evidence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
