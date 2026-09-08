import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { STAGES, stageForStatus, statusForStage, type Stage } from "@/lib/evidence/types";
import { StatusBadge, TagChip } from "./status-ui";

const stageHint: Record<Stage, string> = {
  New: "Just added, not yet checked",
  "Needs confirmation": "Details or supporting evidence to confirm",
  Reviewed: "Checked by Imran or Aciah",
  Ready: "Ready for the case packet",
};

export function KanbanBoard() {
  const { filtered, openInspector, updateItem } = useEvidence();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((stage) => {
        const rows = filtered.filter((item) => stageForStatus(item.status) === stage);
        const pages = rows.reduce((sum, r) => sum + r.pageCount, 0);
        return (
          <div
            key={stage}
            className="flex flex-col rounded-lg border border-border bg-secondary/50 shadow-panel"
          >
            <div className="border-b border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-tight text-foreground">{stage}</h3>
                <span className="rounded bg-navy px-1.5 py-0.5 font-mono text-[10px] text-navy-foreground">
                  {rows.length}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {stageHint[stage]} · {pages} pgs
              </p>
            </div>
            <div className="flex max-h-[58vh] flex-col gap-2 overflow-auto p-2">
              {rows.map((item) => {
                const stageIndex = STAGES.indexOf(stage);
                return (
                  <div
                    key={item.id}
                    className="rounded-md border border-border bg-card p-2.5 transition-shadow hover:shadow-panel"
                  >
                    <button
                      onClick={() => openInspector(item.id)}
                      className="block w-full text-left"
                    >
                      <span className="font-mono text-[10px] font-semibold text-info">
                        {item.exhibitId}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="mt-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <FileText className="size-3" />
                        {item.pageCount} pgs · {formatBytes(item.fileSizeBytes)}
                      </span>
                    </button>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <StatusBadge status={item.status} />
                      {item.tags.slice(0, 2).map((t) => (
                        <TagChip key={t} tag={t} />
                      ))}
                    </div>
                    <div className="mt-2 flex gap-1">
                      {stageIndex > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 flex-1 text-[10px]"
                          onClick={() =>
                            updateItem(
                              item.id,
                              { status: statusForStage(STAGES[stageIndex - 1]!) },
                              `${item.exhibitId} → ${STAGES[stageIndex - 1]!}`,
                            )
                          }
                        >
                          ← Back
                        </Button>
                      )}
                      {stageIndex < STAGES.length - 1 && (
                        <Button
                          size="sm"
                          className="h-6 flex-1 text-[10px]"
                          onClick={() =>
                            updateItem(
                              item.id,
                              { status: statusForStage(STAGES[stageIndex + 1]!) },
                              `${item.exhibitId} → ${STAGES[stageIndex + 1]!}`,
                            )
                          }
                        >
                          Advance →
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && (
                <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                  Nothing in this stage.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
