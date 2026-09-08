import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, PanelRightOpen, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBytes, formatDate, formatDateTime } from "@/lib/evidence/format";
import { useEvidence, type SortKey } from "@/lib/evidence/store";
import type { EvidenceItem } from "@/lib/evidence/types";
import { StatusBadge, StatusSelect, TagChip } from "./status-ui";

const PAGE_SIZE = 25;

const columns: { key: SortKey; label: string; className?: string }[] = [
  { key: "exhibitId", label: "Exhibit", className: "w-[132px]" },
  { key: "title", label: "Title / File" },
  { key: "category", label: "Category", className: "w-[190px]" },
  { key: "status", label: "Status", className: "w-[196px]" },
  { key: "pageCount", label: "Pgs", className: "w-[60px] text-right" },
  { key: "fileSizeBytes", label: "Size", className: "w-[80px] text-right" },
  { key: "dateOfDocument", label: "Doc date", className: "w-[110px]" },
];

export function EvidenceTable({ onEdit }: { onEdit: (item: EvidenceItem) => void }) {
  const {
    filtered,
    items,
    sort,
    toggleSort,
    selectedIds,
    toggleSelected,
    setSelected,
    openInspector,
    updateItem,
    deleteItem,
  } = useEvidence();
  const [page, setPage] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
    setCursor(0);
  }, [filtered.length]);

  const rows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filtered, page],
  );
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editingId) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(rows.length - 1, c + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Enter" && rows[cursor]) {
        e.preventDefault();
        openInspector(rows[cursor].id);
      } else if (e.key === "x" && rows[cursor]) {
        e.preventDefault();
        toggleSelected(rows[cursor].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, openInspector, toggleSelected, editingId]);

  function commitExhibit(id: string) {
    if (editValue.trim())
      updateItem(id, { exhibitId: editValue.trim() }, `Exhibit ID set to ${editValue.trim()}`);
    setEditingId(null);
  }

  const emptyState =
    items.length === 0 ? (
      <span className="text-xs">
        Nothing filed yet — connect Google Drive to sync, or use{" "}
        <span className="font-semibold text-foreground">Add</span> to file something now.
      </span>
    ) : (
      "Nothing matches the current filters."
    );

  return (
    <div className="rounded-xl border border-border bg-card shadow-panel">
      {/* Mobile cards */}
      <ul className="divide-y divide-border/70 md:hidden">
        {rows.map((item) => (
          <li key={item.id} className="px-3 py-3">
            <div className="flex items-start gap-2">
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => toggleSelected(item.id)}
                className="mt-1"
              />
              <button onClick={() => openInspector(item.id)} className="min-w-0 flex-1 text-left">
                <span className="block font-mono text-[10px] text-muted-foreground">
                  {item.exhibitId} · {formatDate(item.dateOfDocument)}
                </span>
                <span className="mt-0.5 block text-sm font-medium text-foreground">
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {item.category} · {item.pageCount} pg · {formatBytes(item.fileSizeBytes)}
                </span>
                <span className="mt-1.5 block">
                  <StatusBadge status={item.status} />
                </span>
              </button>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Edit"
                  onClick={() => onEdit(item)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 text-destructive"
                  aria-label="Delete"
                  onClick={() => deleteItem(item.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-12 text-center text-muted-foreground">{emptyState}</li>
        )}
      </ul>

      {/* Desktop table */}
      <div ref={containerRef} className="hidden max-h-[62vh] overflow-auto md:block">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-navy text-navy-foreground">
            <tr>
              <th className="w-9 px-2 py-2">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={(v) =>
                    v
                      ? setSelected(Array.from(new Set([...selectedIds, ...rows.map((r) => r.id)])))
                      : setSelected(selectedIds.filter((id) => !rows.some((r) => r.id === id)))
                  }
                  className="border-navy-foreground/40 data-[state=checked]:border-navy-foreground data-[state=checked]:bg-navy-foreground data-[state=checked]:text-navy"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    "cursor-pointer px-2 py-2 text-left text-[11px] font-semibold tracking-wider uppercase select-none hover:bg-navy-foreground/10",
                    col.className,
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sort.key === col.key &&
                      (sort.dir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </span>
                </th>
              ))}
              <th className="w-[104px] px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => (
              <tr
                key={item.id}
                onClick={() => setCursor(i)}
                className={cn(
                  "border-b border-border/70 transition-colors last:border-0 hover:bg-accent/45",
                  i === cursor && "bg-accent/60",
                  selectedIds.includes(item.id) && "bg-info/8",
                )}
              >
                <td className="px-2 py-1.5 align-middle">
                  <Checkbox
                    checked={selectedIds.includes(item.id)}
                    onCheckedChange={() => toggleSelected(item.id)}
                  />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  {editingId === item.id ? (
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitExhibit(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitExhibit(item.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-6 px-1 font-mono text-[11px]"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(item.id);
                        setEditValue(item.exhibitId);
                      }}
                      className="rounded px-1 py-0.5 font-mono text-[11px] font-semibold text-foreground hover:bg-secondary"
                      title="Click to edit exhibit ID"
                    >
                      {item.exhibitId}
                    </button>
                  )}
                </td>
                <td className="max-w-0 px-2 py-1.5">
                  <button onClick={() => openInspector(item.id)} className="block w-full min-w-0 text-left">
                    <span className="block truncate font-medium text-foreground">{item.title}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {item.fileName} · {item.fileType} · edited {formatDateTime(item.updatedAt)} by{" "}
                      {item.lastEditedBy}
                    </span>
                  </button>
                  {item.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.tags.slice(0, 3).map((t) => (
                        <TagChip key={t} tag={t} />
                      ))}
                    </div>
                  )}
                </td>
                <td className="max-w-0 px-2 py-1.5 align-middle">
                  <span className="block truncate text-foreground">{item.category}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {item.sourceType}
                  </span>
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <StatusSelect
                    value={item.status}
                    onChange={(status) =>
                      updateItem(item.id, { status }, `${item.exhibitId} → ${status}`)
                    }
                  />
                </td>
                <td className="px-2 py-1.5 text-right align-middle font-mono">{item.pageCount}</td>
                <td className="px-2 py-1.5 text-right align-middle font-mono text-muted-foreground">
                  {formatBytes(item.fileSizeBytes)}
                </td>
                <td className="px-2 py-1.5 align-middle font-mono text-muted-foreground">
                  {formatDate(item.dateOfDocument)}
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Inspect"
                      onClick={() => openInspector(item.id)}
                    >
                      <PanelRightOpen className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Edit"
                      onClick={() => onEdit(item)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      aria-label="Delete"
                      onClick={() => deleteItem(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="px-3 py-12 text-center text-muted-foreground"
                >
                  {emptyState}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-mono">
          {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–
          {Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of {filtered.length}
        </span>
        <span className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className="font-mono">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </span>
      </div>
    </div>
  );
}
