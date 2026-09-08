import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useEvidence } from "@/lib/evidence/store";
import { cn } from "@/lib/utils";

/** Bottom sheet for attaching stored evidence to an event or a financial entry. */
export function EvidencePicker({
  open,
  onOpenChange,
  selected,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { items } = useEvidence();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? items.filter((i) =>
          [i.title, i.fileName, i.exhibitId, i.category, ...(i.people ?? [])]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : items;
    return pool.slice(0, 80);
  }, [items, query]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[86vh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle className="text-base">Link evidence</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, file name, exhibit"
              className="h-11 pl-8 text-sm"
            />
          </div>

          <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-border">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                No documents found.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {results.map((i) => {
                  const on = selected.includes(i.id);
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => toggle(i.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
                          on && "bg-accent/60",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded border border-border",
                            on && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {on && <Check className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground">
                            {i.title}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">
                            {i.exhibitId} · {i.category}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {selected.length} linked
            </span>
            <Button className="h-11" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Inline row of linked-evidence chips; clicking one opens the document inspector. */
export function LinkedEvidenceChips({
  ids,
  onEdit,
}: {
  ids: string[];
  onEdit?: (() => void) | undefined;
}) {
  const { items, openInspector } = useEvidence();
  const linked = ids.map((id) => items.find((i) => i.id === id)).filter(Boolean);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {linked.length === 0 ? (
        <span className="rounded border border-warning/50 bg-warning/12 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
          Missing supporting evidence
        </span>
      ) : (
        linked.map((i) => (
          <button
            key={i!.id}
            type="button"
            onClick={() => openInspector(i!.id)}
            className="max-w-[180px] truncate rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground hover:bg-accent"
          >
            {i!.exhibitId} · {i!.title}
          </button>
        ))
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
        >
          Link evidence
        </button>
      )}
    </div>
  );
}
