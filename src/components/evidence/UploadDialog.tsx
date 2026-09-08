import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileUp, Save, UploadCloud } from "lucide-react";

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
  const { addItem, updateItem, items, categories } = useEvidence();
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFile(null);
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

  function pick(next: File | null) {
    if (!next) return;
    setFile(next);
    setError(null);
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
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
    setSaving(true);
    try {
      const chosen = cats.length ? cats : [primary];
      const common = {
        exhibitId: exhibitId.trim() || suggestedExhibit,
        title: title.trim(),
        category: chosen[0]!,
        categories: chosen,
        subCategory: subCategory.trim() || "General",
        sourceType,
        people,
        pageCount: Math.max(1, Number(pageCount) || 1),
        status,
        dateOfDocument: dateOfDocument || new Date().toISOString().slice(0, 10),
        tags,
        notes: notes.trim(),
        needsTranslation: status === "Translation needed",
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
        await addItem(
          {
            ...common,
            fileName: file.name,
            fileType: fileTypeOf(file.name),
            fileSizeBytes: file.size,
            mimeType: file.type,
            cloudDriveUrl: "",
            driveFolder: "/I601 Evidence/Original Evidence/",
            translationFileUrl: undefined,
          },
          file,
        );
      }
      onOpenChange(false);
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

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving} onClick={() => void submit()}>
            {editing ? "Save changes" : "Add evidence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
