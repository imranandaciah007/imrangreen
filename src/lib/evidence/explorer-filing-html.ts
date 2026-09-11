import type { ExplorerFiling } from "@/lib/filing-explorer.functions";

/**
 * Printable cover letter + exhibit index for the folders and files selected in
 * the Explorer. Formatted for a government filing: restrained federal styling,
 * factual metadata, no claims or predictions.
 */

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

const STYLE = `
  @page { margin: 22mm 18mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #12151c; font-size: 11.5pt; line-height: 1.5; }
  h1 { font-size: 22pt; margin: 0 0 4pt; color: #0B2341; }
  h2 { font-size: 13pt; margin: 20pt 0 6pt; color: #0B2341; border-bottom: 1px solid #c9cfda; padding-bottom: 4pt; }
  .rule { height: 3px; background: #0B2341; margin-bottom: 14pt; }
  .accent { height: 2px; background: #8B0000; width: 90pt; margin: 6pt 0 14pt; }
  .muted { color: #5b6474; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 8pt; font-size: 8.6pt; font-family: Helvetica, Arial, sans-serif; }
  th, td { border: 1px solid #c9cfda; padding: 4pt 5pt; text-align: left; vertical-align: top; }
  th { background: #eef1f6; color: #0B2341; }
  .note { background: #f4f6fa; border: 1px solid #d7dde8; padding: 8pt; font-size: 9pt; font-family: Helvetica, Arial, sans-serif; }
  .page { page-break-before: always; }
  a { color: #0B2341; }
`;

export function explorerFilingHtml(filing: ExplorerFiling) {
  const generated = new Date(filing.generatedAt).toLocaleString("en-GB");
  const rows = filing.exhibits
    .map(
      (e) => `<tr>
        <td>${esc(e.number)}</td>
        <td><a href="${esc(e.cloneLink || e.originalLink)}">${esc(e.title)}</a></td>
        <td>${esc(e.date || "—")}</td>
        <td>${esc(e.sourceType || "—")}</td>
        <td>${esc(e.people.join(", ") || "—")}</td>
        <td>${esc(e.categories.join("; ") || "—")}</td>
        <td>${esc(e.folderPath || "root")}</td>
        <td>${e.pageCount ?? "—"}</td>
        <td>${esc(e.description || "—")}</td>
      </tr>`,
    )
    .join("");

  const letter = filing.coverLetter.length
    ? filing.coverLetter.map((p) => `<p>${esc(p)}</p>`).join("")
    : `<p class="muted">No cover letter was drafted for this selection.</p>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(
    `I601 Cover Letter and Exhibit Index — ${filing.folderLabel}`,
  )}</title><style>${STYLE}</style></head><body>
    <div class="rule"></div>
    <h1>Form I-601 Supporting Evidence</h1>
    <div class="accent"></div>
    <p class="muted">Cover letter and exhibit index · ${esc(filing.folderLabel)}</p>
    <table><tbody>
      <tr><th>Selection</th><td>${esc(filing.folderLabel)}</td></tr>
      <tr><th>Exhibits included</th><td>${filing.exhibits.length}</td></tr>
      <tr><th>Pages on record</th><td>${filing.totalPages}</td></tr>
      <tr><th>Prepared</th><td>${esc(generated)}</td></tr>
    </tbody></table>
    <p class="note">This index lists collected records and states factual details only. It makes no legal argument and no prediction about the outcome of the application. Original files are filed unchanged.</p>

    <h2>Cover Letter</h2>
    ${letter}

    <div class="page"></div>
    <h2>Exhibit Index</h2>
    <table><thead><tr><th>Exhibit</th><th>Title</th><th>Date</th><th>Source</th><th>People</th><th>Categories</th><th>Folder</th><th>Pages</th><th>Description</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="9">No exhibits selected.</td></tr>`}</tbody></table>
    <p class="muted">Descriptions drafted from each exhibit's own recorded details (${esc(filing.model)}, ${esc(generated)}) for review by the filer before submission.</p>
  </body></html>`;
}
