import { Check, ChevronDown, Search, Tags, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEvidence } from "@/lib/evidence/store";
import { CATEGORIES, STATUSES, TAGS, type Tag } from "@/lib/evidence/types";

function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          {label}
          {selected.length > 0 && (
            <span className="rounded bg-primary px-1 font-mono text-[10px] text-primary-foreground">
              {selected.length}
            </span>
          )}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <DropdownMenuItem
              key={option}
              onSelect={(e) => {
                e.preventDefault();
                onChange(active ? selected.filter((s) => s !== option) : [...selected, option]);
              }}
              className="text-xs"
            >
              <Check className={cn("size-3.5", active ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{option}</span>
            </DropdownMenuItem>
          );
        })}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])} className="text-xs text-muted-foreground">
              Clear
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterToolbar() {
  const {
    filters,
    setFilters,
    resetFilters,
    filtered,
    items,
    exhibitGroups,
    selectedIds,
    clearSelected,
    bulkUpdate,
    bulkAssignPrefix,
    bulkAddTag,
  } = useEvidence();

  const activeCount =
    filters.categories.length +
    filters.statuses.length +
    filters.tags.length +
    filters.exhibitGroups.length +
    (filters.translationOnly ? 1 : 0) +
    (filters.query ? 1 : 0);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-2.5 shadow-panel">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(e) => setFilters({ query: e.target.value })}
            placeholder="Filter exhibits, files, notes, tags…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <MultiSelect
          label="Category"
          options={CATEGORIES}
          selected={filters.categories}
          onChange={(categories) => setFilters({ categories })}
        />
        <MultiSelect
          label="Status"
          options={STATUSES}
          selected={filters.statuses}
          onChange={(statuses) => setFilters({ statuses })}
        />
        <MultiSelect label="Tags" options={TAGS} selected={filters.tags} onChange={(tags) => setFilters({ tags })} />
        <MultiSelect
          label="Exhibit group"
          options={exhibitGroups}
          selected={filters.exhibitGroups}
          onChange={(exhibitGroups) => setFilters({ exhibitGroups })}
        />
        <Button
          variant={filters.translationOnly ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setFilters({ translationOnly: !filters.translationOnly })}
        >
          Translation pending
        </Button>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {filtered.length} / {items.length} shown
        </span>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
            <X className="size-3.5" /> Reset
          </Button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-navy/25 bg-navy/6 p-2">
          <span className="font-mono text-[11px] font-semibold text-foreground">
            {selectedIds.length} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Bulk status <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {STATUSES.map((s) => (
                <DropdownMenuItem key={s} className="text-xs" onSelect={() => bulkUpdate({ status: s }, `Status → ${s}`)}>
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Assign exhibit prefix <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {["A", "B", "C", "D", "E", "F", "G"].map((p) => (
                <DropdownMenuItem key={p} className="text-xs" onSelect={() => bulkAssignPrefix(p)}>
                  Exhibit {p}-1 … {p}-{selectedIds.length}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                <Tags className="size-3" /> Bulk tag <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {TAGS.map((t) => (
                <DropdownMenuItem key={t} className="font-mono text-xs" onSelect={() => bulkAddTag(t as Tag)}>
                  {t}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelected}>
            Clear selection
          </Button>
        </div>
      )}
    </div>
  );
}
