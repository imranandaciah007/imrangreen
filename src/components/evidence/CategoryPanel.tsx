import { useState } from "react";
import { FolderPlus, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useEvidence } from "@/lib/evidence/store";
import { cn } from "@/lib/utils";

export function CategoryPanel({ onUploadTo }: { onUploadTo: (category: string) => void }) {
  const { categories, stats, filters, setFilters, addCategory, renameCategory, deleteCategory } =
    useEvidence();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const counts = new Map(stats.byCategory.map((c) => [c.category, c]));

  function selectCategory(category: string) {
    const active = filters.categories.includes(category);
    setFilters({ categories: active ? [] : [category] });
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-panel">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Hardship categories
        </h2>
      </header>

      <ul className="divide-y divide-border/70">
        {categories.map((category) => {
          const row = counts.get(category);
          const active = filters.categories.includes(category);
          return (
            <li key={category} className={cn("px-3 py-2.5", active && "bg-accent/50")}>
              {renaming === category ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        renameCategory(category, renameValue);
                        setRenaming(null);
                      }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="h-9 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      renameCategory(category, renameValue);
                      setRenaming(null);
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => selectCategory(category)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {category}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {row?.ready ?? 0}/{row?.total ?? 0} ready
                      </span>
                    </span>
                    <Progress value={row?.percent ?? 0} className="mt-1.5 h-1.5" />
                  </button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    aria-label={`Add evidence to ${category}`}
                    onClick={() => onUploadTo(category)}
                  >
                    <Plus className="size-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                        aria-label={`More actions for ${category}`}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-xs"
                        onSelect={() => {
                          setRenaming(category);
                          setRenameValue(category);
                        }}
                      >
                        <Pencil className="size-3.5" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-xs text-destructive"
                        onSelect={() => deleteCategory(category)}
                      >
                        <Trash2 className="size-3.5" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-1.5 border-t border-border p-2.5">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              addCategory(newName);
              setNewName("");
            }
          }}
          placeholder="New category name"
          className="h-10 text-xs"
        />
        <Button
          className="h-10"
          onClick={() => {
            addCategory(newName);
            setNewName("");
          }}
        >
          <FolderPlus className="size-4" /> Add
        </Button>
      </div>
    </section>
  );
}
