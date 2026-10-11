import { useState } from "react";
import { FolderTree, List } from "lucide-react";

import { CategoryPanel } from "@/components/evidence/CategoryPanel";
import { EvidenceTable } from "@/components/evidence/EvidenceTable";
import { FileBoardView } from "@/components/evidence/FileBoardView";
import { FilterToolbar } from "@/components/evidence/FilterToolbar";
import type { EvidenceItem } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

export type DocumentsLayout = "folders" | "list";

/** One page for every document: the Drive folders, or a filterable list. */
export function DocumentsView({
  layout,
  onLayout,
  onUploadTo,
  onEdit,
}: {
  layout: DocumentsLayout;
  onLayout: (layout: DocumentsLayout) => void;
  onUploadTo: (category: string) => void;
  onEdit: (item: EvidenceItem) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label="How to show documents"
        className="inline-flex rounded-lg border border-border bg-card p-1"
      >
        {(
          [
            { id: "folders", label: "By folder", icon: FolderTree },
            { id: "list", label: "As a list", icon: List },
          ] as const
        ).map((option) => {
          const Icon = option.icon;
          const active = layout === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onLayout(option.id)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-md px-4 text-xs font-bold transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              {option.label}
            </button>
          );
        })}
      </div>

      {layout === "folders" ? (
        <FileBoardView />
      ) : (
        <div className="space-y-3">
          <FilterToolbar showFilters={filtersOpen} onToggleFilters={() => setFiltersOpen((v) => !v)} />
          {filtersOpen && <CategoryPanel onUploadTo={onUploadTo} />}
          <EvidenceTable onEdit={onEdit} />
        </div>
      )}
    </div>
  );
}
