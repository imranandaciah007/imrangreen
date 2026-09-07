import { ClipboardCopy, Download, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useEvidence } from "@/lib/evidence/store";
import { READY_STATUSES } from "@/lib/evidence/types";
import { StatusBadge } from "./status-ui";

export function ExhibitIndexView() {
  const { filtered, stats } = useEvidence();
  const rows = [...filtered].sort((a, b) =>
    a.exhibitId.localeCompare(b.exhibitId, undefined, { numeric: true }),
  );

  function asMarkdown() {
    const header =
      "| Exhibit | Description | Category | Pages | Ready |\n| --- | --- | --- | --- | --- |";
    const body = rows
      .map(
        (r) =>
          `| ${r.exhibitId} | ${r.title} | ${r.category} | ${r.pageCount} | ${
            READY_STATUSES.includes(r.status) ? "Yes" : "No"
          } |`,
      )
      .join("\n");
    return `# Table of Exhibits\n\n${header}\n${body}\n\n_Total exhibits: ${rows.length} · Total pages: ${rows.reduce(
      (s, r) => s + r.pageCount,
      0,
    )}_\n`;
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(asMarkdown());
      toast.success("Exhibit index copied as Markdown");
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  }

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      ["Exhibit Number", "Description", "Category", "Page Count", "Ready Status"].map(esc).join(","),
      ...rows.map((r) =>
        [r.exhibitId, r.title, r.category, r.pageCount, READY_STATUSES.includes(r.status) ? "Ready" : r.status]
          .map(esc)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "table-of-exhibits.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported table-of-exhibits.csv");
  }

  const pages = rows.reduce((s, r) => s + r.pageCount, 0);

  return (
    <div className="rounded-lg border border-border bg-card shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Table of Exhibits (USCIS format)</h2>
          <p className="font-mono text-[11px] text-muted-foreground">
            {rows.length} exhibits · {pages} pages · {stats.ready} ready for the master binder
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={copyMarkdown}>
            <ClipboardCopy className="size-3.5" /> Copy index as Markdown
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportCsv}>
            <Download className="size-3.5" /> Export to CSV
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print
          </Button>
        </div>
      </div>

      <div className="max-h-[62vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-secondary text-secondary-foreground">
            <tr>
              <th className="w-[140px] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">
                Exhibit no.
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Description</th>
              <th className="w-[200px] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">
                Category
              </th>
              <th className="w-[80px] px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">
                Pages
              </th>
              <th className="w-[200px] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">
                Ready status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/70 last:border-0">
                <td className="px-3 py-2 font-mono font-semibold">{r.exhibitId}</td>
                <td className="px-3 py-2">
                  <span className="block text-foreground">{r.title}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">{r.fileName}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.category}</td>
                <td className="px-3 py-2 text-right font-mono">{r.pageCount}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-navy text-navy-foreground">
              <td className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" colSpan={3}>
                Total
              </td>
              <td className="px-3 py-2 text-right font-mono font-semibold">{pages}</td>
              <td className="px-3 py-2 font-mono text-[11px]">{rows.length} exhibits</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
