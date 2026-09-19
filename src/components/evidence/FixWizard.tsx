import { useEffect, useMemo, useState } from "react";
import { EyeOff, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useEvidence } from "@/lib/evidence/store";
import { SOURCE_TYPES, type SourceType } from "@/lib/evidence/types";

interface Draft {
  title: string;
  dateOfDocument: string;
  sourceType: SourceType;
  category: string;
  people: string;
  affectsAciah: string;
  notes: string;
}


/**
 * Step-by-step repair flow for the documents flagged in the packet audit.
 * Every move (Next, Back, Close) writes the current changes first, so nothing is lost.
 */
export function FixWizard({
  open,
  onOpenChange,
  itemIds,
  startId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemIds: string[];
  startId?: string | undefined;
}) {
  const { items, gaps, categories, updateItem, ignoreGap, runExtraction, extractingIds } =
    useEvidence();


  const queue = useMemo(
    () => itemIds.filter((id) => items.some((i) => i.id === id)),
    [itemIds, items],
  );
  const [index, setIndex] = useState(0);
  const item = items.find((i) => i.id === queue[index]) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!open) return;
    const start = startId ? queue.indexOf(startId) : 0;
    setIndex(start >= 0 ? start : 0);
  }, [open, startId, queue]);

  useEffect(() => {
    if (!item) {
      setDraft(null);
      return;
    }
    setDraft({
      title: item.title ?? "",
      dateOfDocument: item.dateOfDocument ?? "",
      sourceType: item.sourceType,
      category: item.category ?? "",
      people: (item.people ?? []).join(", "),
      affectsAciah: item.affectsAciah ?? "",
      notes: item.notes ?? "",
    });
  }, [item?.id]);

  const itemGaps = item
    ? gaps.filter((g) => g.recordType === "evidence" && g.recordId === item.id)
    : [];

  function saveCurrent() {
    if (!item || !draft) return;
    const people = draft.people
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const changed =
      draft.title !== (item.title ?? "") ||
      draft.dateOfDocument !== (item.dateOfDocument ?? "") ||
      draft.sourceType !== item.sourceType ||
      draft.category !== (item.category ?? "") ||
      people.join(", ") !== (item.people ?? []).join(", ") ||
      draft.affectsAciah !== (item.affectsAciah ?? "") ||
      draft.notes !== (item.notes ?? "");
    if (!changed) return;
    const categoryPatch =
      draft.category && draft.category !== item.category
        ? {
            category: draft.category as (typeof item)["category"],
            categories: [
              draft.category,
              ...(item.categories ?? []).filter(
                (c) => c !== draft.category && c !== item.category,
              ),
            ] as (typeof item)["categories"],
          }
        : {};
    updateItem(
      item.id,
      {
        title: draft.title,
        dateOfDocument: draft.dateOfDocument,
        sourceType: draft.sourceType,
        people,
        affectsAciah: draft.affectsAciah,
        notes: draft.notes,
        ...categoryPatch,
      },
      `${item.exhibitId} details updated`,
    );
    toast.success("Changes saved", { description: item.exhibitId });
  }


  function go(next: number) {
    saveCurrent();
    if (next < 0 || next >= queue.length) {
      onOpenChange(false);
      return;
    }
    setIndex(next);
  }

  const busy = item ? extractingIds.includes(item.id) : false;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) saveCurrent();
        onOpenChange(v);
      }}
    >
      <DialogContent className="flex max-h-[94svh] flex-col gap-3 overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            Fix details {queue.length ? `(${index + 1} of ${queue.length})` : ""}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Make your changes and press Next for the following document. You can close at any point —
            what you have typed is saved first.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {!item || !draft ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing left needing attention.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
                <p className="font-mono text-[10px] text-muted-foreground">{item.exhibitId}</p>
                <p className="truncate text-xs font-semibold text-foreground">{item.fileName}</p>
              </div>

              {itemGaps.length > 0 && (
                <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-2.5">
                  <p className="text-[10px] font-semibold tracking-wider text-destructive uppercase">
                    Needs your attention ({itemGaps.length})
                  </p>
                  <ul className="mt-2 space-y-2">
                    {itemGaps.map((gap) => (
                      <li key={gap.id} className="rounded-md border border-destructive/40 bg-card p-2">
                        <p className="text-[11px] font-semibold text-destructive">{gap.label}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{gap.detail}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1.5 h-9 text-[11px]"
                          onClick={() => {
                            ignoreGap(gap.id);
                            toast.success("Ignored", { description: gap.label });
                          }}
                        >
                          <EyeOff className="size-3.5" /> Ignore
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={busy}
                onClick={() => void runExtraction(item.id)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy ? "Reading the document…" : "Fix with AI"}
              </Button>

              <div className="space-y-1.5">
                <Label htmlFor="fw-title" className="text-[11px]">Title</Label>
                <Input
                  id="fw-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fw-date" className="text-[11px]">Document date</Label>
                  <Input
                    id="fw-date"
                    type="date"
                    value={draft.dateOfDocument}
                    onChange={(e) => setDraft({ ...draft, dateOfDocument: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fw-source" className="text-[11px]">Source type</Label>
                  <Select
                    value={draft.sourceType}
                    onValueChange={(v) => setDraft({ ...draft, sourceType: v as SourceType })}
                  >
                    <SelectTrigger id="fw-source" className="text-xs">
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
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fw-category" className="text-[11px]">Hardship category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft({ ...draft, category: v })}
                >
                  <SelectTrigger id="fw-category" className="text-xs">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fw-people" className="text-[11px]">People (separated by commas)</Label>
                <Input
                  id="fw-people"
                  value={draft.people}
                  onChange={(e) => setDraft({ ...draft, people: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fw-aciah" className="text-[11px]">How this affects Aciah</Label>
                <Textarea
                  id="fw-aciah"
                  value={draft.affectsAciah}
                  onChange={(e) => setDraft({ ...draft, affectsAciah: e.target.value })}
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fw-notes" className="text-[11px]">Case notes</Label>
                <Textarea
                  id="fw-notes"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  rows={4}
                  className="text-xs"
                />
              </div>

            </>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            className="h-11 flex-1"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            Back
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => {
              saveCurrent();
              onOpenChange(false);
            }}
          >
            Save &amp; close
          </Button>
          <Button className="h-11 flex-1" onClick={() => go(index + 1)}>
            {index + 1 >= queue.length ? "Save & finish" : "Save & next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
