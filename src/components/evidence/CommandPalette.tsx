import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useEvidence } from "@/lib/evidence/store";
import { STATUSES } from "@/lib/evidence/types";

export function CommandPalette({ onConnectDrive }: { onConnectDrive: () => void }) {
  const [open, setOpen] = useState(false);
  const { items, categories, openInspector, setFilters, resetFilters } = useEvidence();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search exhibits, files, notes, tags — or run a command…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No matching exhibits or commands.</CommandEmpty>
        <CommandGroup heading="Exhibits">
          {items.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.exhibitId} ${item.title} ${item.fileName} ${item.subCategory} ${item.notes} ${item.tags.join(" ")}`}
              onSelect={() => {
                openInspector(item.id);
                setOpen(false);
              }}
            >
              <span className="font-mono text-[10px] text-info">{item.exhibitId}</span>
              <span className="truncate">{item.title}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {item.status}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Filter commands">
          {STATUSES.map((s) => (
            <CommandItem
              key={s}
              value={`filter status ${s}`}
              onSelect={() => {
                setFilters({ statuses: [s] });
                setOpen(false);
              }}
            >
              Filter status: {s}
            </CommandItem>
          ))}
          {categories.map((c) => (
            <CommandItem
              key={c}
              value={`filter category ${c}`}
              onSelect={() => {
                setFilters({ categories: [c] });
                setOpen(false);
              }}
            >
              Filter category: {c}
            </CommandItem>
          ))}
          <CommandItem
            value="clear all filters reset"
            onSelect={() => {
              resetFilters();
              setOpen(false);
            }}
          >
            Clear all filters
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Storage">
          <CommandItem
            value="sync drive folder google"
            onSelect={() => {
              onConnectDrive();
              setOpen(false);
            }}
          >
            Synch Drive…
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
