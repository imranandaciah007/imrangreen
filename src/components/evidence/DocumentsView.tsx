import { FolderTree, List } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryPanel } from "@/components/evidence/CategoryPanel";
import { EvidenceTable } from "@/components/evidence/EvidenceTable";
import { ExhibitIndexView } from "@/components/evidence/ExhibitIndexView";
import { FileBoardView } from "@/components/evidence/FileBoardView";
import { FilterToolbar } from "@/components/evidence/FilterToolbar";
import { KanbanBoard } from "@/components/evidence/KanbanBoard";
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
        <div className="space-y-4 lg:grid lg:grid-cols-[320px_1fr] lg:items-start lg:gap-4 lg:space-y-0">
          <CategoryPanel onUploadTo={onUploadTo} />
          <div className="space-y-3">
            <FilterToolbar />
            <Tabs defaultValue="table">
              <TabsList>
                <TabsTrigger value="table" className="text-xs">
                  List
                </TabsTrigger>
                <TabsTrigger value="kanban" className="text-xs">
                  Review stages
                </TabsTrigger>
                <TabsTrigger value="index" className="text-xs">
                  Exhibit index
                </TabsTrigger>
              </TabsList>
              <TabsContent value="table" className="mt-3">
                <EvidenceTable onEdit={onEdit} />
              </TabsContent>
              <TabsContent value="kanban" className="mt-3">
                <KanbanBoard />
              </TabsContent>
              <TabsContent value="index" className="mt-3">
                <ExhibitIndexView />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
