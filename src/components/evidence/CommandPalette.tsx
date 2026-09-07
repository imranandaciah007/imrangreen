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
import { CATEGORIES, STATUSES } from "@/lib/evidence/types";

export function CommandPalette({ onConnectDrive }: { onConnectDrive: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { items, openInspector, setFilters, resetFilters } = useEvidence();

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

  const q = query.trim().toLowerCase();
  const matches = q
    ? items
        .filter((i) =>
          [i.title, i.fileName, i.exhibitId, i.notes, i.tags.join(" ")].join(" ").toLowerCase().includes(q),
        )
        .slice(0, 8)
    : items.slice(0, 6);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} title="Command palette">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search exhibits, files, notes, tags — or run a command…"
      />
      <CommandList>
        <CommandEmpty>No matching exhibits.</CommandEmpty>
        <CommandGroup heading={q ? "Matching exhibits" : "Recent exhibits"}>
          {matches.map((item) => (
            <CommandItem
              key={item.id}
              value={item.id}
              onSelect={() => {
                openInspector(item.id);
                setOpen(false);
              }}
            >
              <span className="font-mono text-[10px] text-info">{item.exhibitId}</span>
              <span className="truncate">{item.title}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{item.status}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Filters">
          {STATUSES.map((s) => (
            <CommandItem
              key={s}
              value={`status-${s}`}
              onSelect={() => {
                setFilters({ statuses: [s] });
                setOpen(false);
              }}
            >
              Filter status: {s}
            </CommandItem>
          ))}
          {CATEGORIES.map((c) => (
            <CommandItem
              key={c}
              value={`cat-${c}`}
              onSelect={() => {
                setFilters({ categories: [c] });
                setOpen(false);
              }}
            >
              Filter category: {c}
            </CommandItem>
          ))}
          <CommandItem
            value="reset"
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
            value="connect-drive"
            onSelect={() => {
              onConnectDrive();
              setOpen(false);
            }}
          >
            Connect drive folder…
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
