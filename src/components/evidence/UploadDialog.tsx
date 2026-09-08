import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, Tags, UploadCloud } from "lucide-react";

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
  CATEGORIES,
  STATUSES,
  TAGS,
  type Category,
  type EvidenceStatus,
  type FileType,
  type Tag,
} from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

function fileTypeOf(name: string): FileType {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "docx" || ext === "doc") return "DOCX";
  if (ext === "png") return "PNG";
  if (ext === "jpg" || ext === "jpeg") return "JPG";
  return "PDF";
}

export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addItem, items } = useEvidence();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [exhibitId, setExhibitId] = useState("");
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [subCategory, setSubCategory] = useState("");
  const [status, setStatus] = useState<EvidenceStatus>("Draft");
  const [pageCount, setPageCount] = useState("1");
  const [dateOfDocument, setDateOfDocument] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suggestedExhibit = useMemo(() => {
    const n = items.filter((i) => i.category === category).length + 1;
    const letter = String.fromCharCode(65 + CATEGORIES.indexOf(category));
    return `Exhibit ${letter}-${n}`;
  }, [items, category]);

  function reset() {
    setFile(null);
    setTitle("");
    setExhibitId("");
    setSubCategory("");
    setStatus("Draft");
    setPageCount("1");
    setDateOfDocument("");
    setTags([]);
    setNotes("");
    setError(null);
  }

  function pick(next: File | null) {
    if (!next) return;
    setFile(next);
    setError(null);
    if (!title) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function submit() {
    if (!file) {
      setError("Attach a document file first.");
      return;
    }
    if (!title.trim()) {
      setError("Give the document a readable title.");
      return;
    }
    setSaving(true);
    try {
      await addItem(
        {
          exhibitId: exhibitId.trim() || suggestedExhibit,
          fileName: file.name,
          title: title.trim(),
          category,
          subCategory: subCategory.trim() || "General",
          fileType: fileTypeOf(file.name),
          fileSizeBytes: file.size,
          pageCount: Math.max(1, Number(pageCount) || 1),
          status,
          dateOfDocument: dateOfDocument || new Date().toISOString().slice(0, 10),
          tags,
          cloudDriveUrl: "",
          translationFileUrl: undefined,
          notes: notes.trim(),
        },
        file,
      );
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UploadCloud className="size-4" /> Add evidence document
          </DialogTitle>
          <DialogDescription className="text-xs">
            The file, exhibit number, category and tags are filed together and the summary bar
            updates immediately.
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
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-7 text-center transition-colors",
              dragging && "border-primary bg-primary/6",
            )}
          >
            <FileUp className="size-5 text-muted-foreground" />
            {file ? (
              <>
                <p className="font-mono text-xs font-semibold text-foreground">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fileTypeOf(file.name)} · {formatBytes(file.size)} · click to replace
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-foreground">
                  Drop a file here or click to browse
                </p>
                <p className="text-[11px] text-muted-foreground">PDF, DOCX, JPG or PNG</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Document title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="2024 Form 1040 Joint Tax Return"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exhibit ID</Label>
              <Input
                value={exhibitId}
                onChange={(e) => setExhibitId(e.target.value)}
                placeholder={suggestedExhibit}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Leave blank to use {suggestedExhibit}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sub-category</Label>
              <Input
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                placeholder="Federal tax filing"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Filing status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EvidenceStatus)}>
                <SelectTrigger className="text-xs">
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
              <Label className="text-xs">Page count</Label>
              <Input
                type="number"
                min={1}
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date of document</Label>
              <Input
                type="date"
                value={dateOfDocument}
                onChange={(e) => setDateOfDocument(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1.5 text-xs">
                <Tags className="size-3.5" /> Tags
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map((t) => {
                  const active = tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTags(active ? tags.filter((x) => x !== t) : [...tags, t])}
                      className={cn(
                        "rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/70",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Counsel notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="RFE defense strategy, provenance, translation needs…"
                className="min-h-20 text-xs"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" className="text-xs" onClick={submit} disabled={saving}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Paperclip className="size-3.5" />
            )}
            File document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
