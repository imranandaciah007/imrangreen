import { formatDate, formatDateTime } from "./format";
import type { CaseGap } from "./review";
import {
  CASE_SETTINGS,
  DEFAULT_CATEGORIES,
  READY_STATUSES,
  taskStatus,
  type CaseTask,
  type EvidenceItem,
  type FinancialEntry,
  type HardshipEvent,
  type PacketVersion,
} from "./types";

/* ---------------------------------- audit ---------------------------------- */

export type AuditLevel = "ready" | "attention" | "optional" | "blocking";

export interface AuditFinding {
  id: string;
  level: AuditLevel;
  label: string;
  detail: string;
  gap?: CaseGap | undefined;
}

const ATTENTION_KINDS = new Set([
  "evidence-awaiting-confirmation",
  "evidence-ai-conflict",
  "finance-duplicate",
  "evidence-duplicate",
  "event-no-evidence",
  "finance-no-receipt",
]);

/** Pre-flight audit. Only a missing/unreachable source file blocks generation. */
export function preflightAudit(
  items: EvidenceItem[],
  events: HardshipEvent[],
  finances: FinancialEntry[],
  tasks: CaseTask[],
  gaps: CaseGap[],
): AuditFinding[] {
  const findings: AuditFinding[] = gaps.map((gap) => ({
    id: gap.id,
    level: ATTENTION_KINDS.has(gap.kind) ? "attention" : "optional",
    label: gap.label,
    detail: gap.detail,
    gap,
  }));

  // Integrity: an included exhibit whose file we cannot reach at all.
  for (const item of items) {
    if (item.excludeFromPacket) continue;
    const reachable = Boolean(item.cloudDriveUrl || item.driveFileId);
    if (!reachable) {
      findings.push({
        id: `broken-${item.id}`,
        level: "blocking",
        label: "Source file cannot be found",
        detail: `${item.exhibitId} — ${item.title || item.fileName} has no file attached. Exclude it or re-attach the file.`,
      });
    }
  }

  const openTasks = tasks.filter((t) => taskStatus(t) !== "Complete").length;
  if (openTasks > 0) {
    findings.push({
      id: "open-tasks",
      level: "optional",
      label: `${openTasks} open task${openTasks === 1 ? "" : "s"}`,
      detail: "You can build the packet now and finish these afterwards.",
    });
  }

  if (!findings.length) {
    findings.push({
      id: "ready",
      level: "ready",
      label: "Everything checks out",
      detail: `${items.length} exhibits, ${events.length} timeline events, ${finances.length} financial entries.`,
    });
  }
  return findings;
}

/* ---------------------------- exhibit numbering ---------------------------- */

export const PACKET_SECTIONS = DEFAULT_CATEGORIES;

function sectionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

export interface PacketExhibit {
  item: EvidenceItem;
  number: string;
  section: string;
  sectionLetter: string;
  firstPage: number;
  lastPage: number;
}

/**
 * Stable numbering: an exhibit keeps any number it was given in an earlier packet
 * version; new exhibits continue the sequence. Sections cross-reference the same
 * exhibit instead of duplicating it.
 */
export function buildExhibits(items: EvidenceItem[], sections: string[]): PacketExhibit[] {
  const included = items.filter((i) => !i.excludeFromPacket);
  const catsOf = (i: EvidenceItem) => (i.categories?.length ? i.categories : [i.category]);
  const ordered: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    for (const item of included) {
      if (seen.has(item.id)) continue;
      if (catsOf(item).includes(section)) {
        seen.add(item.id);
        ordered.push(item);
      }
    }
  }
  for (const item of included) if (!seen.has(item.id)) ordered.push(item);

  const used = new Set(items.map((i) => i.packetExhibitNo).filter(Boolean) as string[]);
  let next = 1;
  const nextFree = () => {
    let candidate = `Exhibit ${String(next).padStart(3, "0")}`;
    while (used.has(candidate)) {
      next += 1;
      candidate = `Exhibit ${String(next).padStart(3, "0")}`;
    }
    used.add(candidate);
    next += 1;
    return candidate;
  };

  let page = 1;
  return ordered.map((item) => {
    const cats = catsOf(item);
    const section = sections.find((s) => cats.includes(s)) ?? "Other";
    const pages = Math.max(1, item.pageCount || 1);
    const exhibit: PacketExhibit = {
      item,
      number: item.packetExhibitNo || nextFree(),
      section,
      sectionLetter: sectionLetter(Math.max(0, sections.indexOf(section))),
      firstPage: page,
      lastPage: page + pages - 1,
    };
    page += pages;
    return exhibit;
  });
}

/* --------------------------------- exports --------------------------------- */

function csvCell(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function financeCsv(
  finances: FinancialEntry[],
  items: EvidenceItem[],
  exhibits: PacketExhibit[],
): string {
  const header = [
    "Date",
    "Payer",
    "Beneficiary",
    "Merchant / payee",
    "Category",
    "Original amount",
    "Original currency",
    "GBP equivalent",
    "USD equivalent",
    "Exchange rate",
    "Rate date",
    "Linked evidence",
    "Notes",
    "Status",
  ];
  const rows = finances
    .filter((f) => !f.excluded)
    .map((f) => {
      const linked = (f.evidenceIds ?? [])
        .map((id) => {
          const ex = exhibits.find((e) => e.item.id === id);
          return ex ? ex.number : items.find((i) => i.id === id)?.exhibitId;
        })
        .filter(Boolean)
        .join(" / ");
      return [
        f.date,
        f.payer ?? "",
        f.beneficiary ?? "",
        f.merchant ?? f.label,
        f.expenseCategory ?? f.kind,
        f.amount,
        f.currency,
        f.gbpEquivalent ?? "",
        f.usdEquivalent ?? "",
        f.exchangeRate ?? "",
        f.exchangeRateDate ?? "",
        linked,
        f.purpose || f.notes || "",
        f.status ?? "",
      ];
    });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/* ------------------------------- HTML packet ------------------------------- */

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

const STYLE = `
  @page { margin: 22mm 18mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #12151c; font-size: 11.5pt; line-height: 1.45; }
  h1 { font-size: 24pt; margin: 0 0 6pt; letter-spacing: .3px; }
  h2 { font-size: 14pt; margin: 22pt 0 6pt; border-bottom: 1px solid #c9cfda; padding-bottom: 4pt; }
  h3 { font-size: 11.5pt; margin: 14pt 0 4pt; }
  .muted { color: #5b6474; font-size: 9.5pt; }
  .cover { padding-top: 40pt; border-top: 3px solid #1d2a44; }
  table { width: 100%; border-collapse: collapse; margin-top: 8pt; font-size: 9pt; font-family: Helvetica, Arial, sans-serif; }
  th, td { border: 1px solid #c9cfda; padding: 4pt 5pt; text-align: left; vertical-align: top; }
  th { background: #eef1f6; }
  .sep { page-break-before: always; }
  .note { background: #f4f6fa; border: 1px solid #d7dde8; padding: 8pt; font-size: 9pt; font-family: Helvetica, Arial, sans-serif; }
  .sepsheet { page-break-before: always; padding-top: 90pt; text-align: center; }
  .sepsheet .no { font-size: 30pt; letter-spacing: 2px; }
`;

function docShell(title: string, body: string, footer: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}<p class="muted" style="margin-top:24pt">${esc(footer)}</p></body></html>`;
}

interface PacketInput {
  version: number;
  generatedAt: string;
  generatedBy: string;
  lastEditedAt: string | null;
  sections: string[];
  exhibits: PacketExhibit[];
  events: HardshipEvent[];
  finances: FinancialEntry[];
  gaps: CaseGap[];
  totals: {
    documented: number;
    sentToAciah: number;
    jibril: number;
    medical: number;
    housing: number;
    immigration: number;
  };
  /** Filing-ready wording drafted from the exhibit details (optional). */
  narrative?: {
    coverLetter: string[];
    exhibitNotes: { number: string; description: string }[];
    model: string;
    generatedAt: string;
  } | undefined;
  income: {
    netMonthlyIncome: number;
    mortgage: number;
    councilTax: number;
    utilities: number;
    otherCommitments: number;
  };
}

const stamps = (p: PacketInput) =>
  `Generated: ${formatDateTime(p.generatedAt)} by ${p.generatedBy} · Source data last edited: ${p.lastEditedAt ? formatDateTime(p.lastEditedAt) : "—"} · Case Packet v${p.version}`;

function exhibitRows(exhibits: PacketExhibit[], notes?: PacketInput["narrative"]) {
  const drafted = new Map((notes?.exhibitNotes ?? []).map((n) => [n.number, n.description]));
  return exhibits
    .map(
      (e) => `<tr><td>${esc(e.number)}</td><td>${esc(e.item.title || e.item.fileName)}</td>
      <td>${esc(formatDate(e.item.dateOfDocument))}</td><td>${esc(e.item.sourceType)}</td>
      <td>${esc((e.item.people ?? []).join(", "))}</td>
      <td>${esc((e.item.categories?.length ? e.item.categories : [e.item.category]).join("; "))}</td>
      <td>${e.firstPage}–${e.lastPage}</td>
      <td>${esc(drafted.get(e.number) || e.item.aiExtraction?.summary || e.item.notes || "")}</td></tr>`,
    )
    .join("");
}

export function exhibitIndexHtml(p: PacketInput) {
  const body = `<h1>Exhibit Index — Case Packet v${p.version}</h1>
    <p class="muted">${esc(CASE_SETTINGS.caseName)}</p>
    <table><thead><tr><th>Exhibit</th><th>Title</th><th>Date</th><th>Source</th><th>People</th><th>Categories</th><th>Pages</th><th>Description</th></tr></thead>
    <tbody>${exhibitRows(p.exhibits, p.narrative)}</tbody></table>
    ${p.narrative ? `<p class="muted">Descriptions drafted from each exhibit's own recorded details (${esc(p.narrative.model)}, ${esc(formatDateTime(p.narrative.generatedAt))}) and reviewed by the filer.</p>` : ""}`;
  return docShell(`I601 Exhibit Index v${p.version}`, body, stamps(p));
}

export function timelineHtml(p: PacketInput) {
  const rows = [...p.events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const linked = (e.evidenceIds ?? [])
        .map((id) => p.exhibits.find((x) => x.item.id === id)?.number)
        .filter(Boolean)
        .join(", ");
      return `<tr><td>${esc(formatDate(e.date))}</td><td>${esc(e.title)}<div class="muted">${esc(e.description)}</div></td>
        <td>${esc((e.people ?? []).join(", "))}</td><td>${esc(e.effectOnAciah ?? "")}</td>
        <td>${esc(e.effectOnFamily ?? "")}</td>
        <td>${esc((e.categories?.length ? e.categories : [e.category]).join("; "))}</td>
        <td>${esc(linked)}</td>
        <td>${e.financialImpact ? esc(`${e.financialCurrency ?? "GBP"} ${e.financialImpact}`) : ""}</td></tr>`;
    })
    .join("");
  const body = `<h1>Case Timeline / Chronology</h1>
    <p class="muted">${esc(CASE_SETTINGS.caseName)} · Family separation begins ${formatDate(CASE_SETTINGS.separationStartDate)}</p>
    <table><thead><tr><th>Date</th><th>Event</th><th>People</th><th>Impact on Aciah</th><th>Impact on Jibril / family</th><th>Categories</th><th>Exhibits</th><th>Financial</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  return docShell(`I601 Timeline v${p.version}`, body, stamps(p));
}

function financeSection(p: PacketInput) {
  const months = new Map<string, number>();
  for (const f of p.finances) {
    if (f.excluded || f.date < CASE_SETTINGS.separationStartDate) continue;
    const key = f.date.slice(0, 7);
    months.set(key, (months.get(key) ?? 0) + (f.gbpEquivalent ?? f.amount));
  }
  const monthRows = [...months.entries()]
    .sort()
    .map(([m, total]) => `<tr><td>${esc(m)}</td><td>£${total.toFixed(2)}</td></tr>`)
    .join("");
  const obligations =
    p.income.mortgage + p.income.councilTax + p.income.utilities + p.income.otherCommitments;
  return `<h2>Financial Hardship Since Separation (from ${formatDate(CASE_SETTINGS.separationStartDate)})</h2>
    <table><tbody>
      <tr><th>Total documented, separation-related expenditure</th><td>£${p.totals.documented.toFixed(2)}</td></tr>
      <tr><th>Money Imran sent to Aciah</th><td>£${p.totals.sentToAciah.toFixed(2)}</td></tr>
      <tr><th>Jibril-related costs</th><td>£${p.totals.jibril.toFixed(2)}</td></tr>
      <tr><th>Aciah medical / pregnancy costs</th><td>£${p.totals.medical.toFixed(2)}</td></tr>
      <tr><th>Housing / relocation</th><td>£${p.totals.housing.toFixed(2)}</td></tr>
      <tr><th>Immigration / travel</th><td>£${p.totals.immigration.toFixed(2)}</td></tr>
      <tr><th>UK net monthly income</th><td>£${p.income.netMonthlyIncome.toFixed(2)}</td></tr>
      <tr><th>UK fixed monthly obligations</th><td>£${obligations.toFixed(2)}</td></tr>
    </tbody></table>
    <h3>Month by month (documented totals, GBP)</h3>
    <table><thead><tr><th>Month</th><th>Documented total</th></tr></thead><tbody>${monthRows}</tbody></table>
    <p class="note">Every figure above is traceable to the linked receipts, statements and screenshots listed in the exhibit index. Each real-world payment is counted once, even where several documents evidence it.</p>`;
}

export function gapReportHtml(p: PacketInput) {
  const rows = p.gaps
    .map(
      (g) =>
        `<tr><td>${esc(g.label)}</td><td>${esc(g.detail)}</td><td>${esc(g.severity)}</td><td>${esc(g.taskTitle)}</td></tr>`,
    )
    .join("");
  const body = `<h1>Outstanding Items Report — v${p.version}</h1>
    <p class="muted">Factual gaps in the collected evidence. This is an organisation checklist only.</p>
    <table><thead><tr><th>Item</th><th>Detail</th><th>Priority</th><th>Suggested next step</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No outstanding items.</td></tr>'}</tbody></table>`;
  return docShell(`I601 Gap Report v${p.version}`, body, stamps(p));
}

export function financeSummaryHtml(p: PacketInput) {
  return docShell(
    `I601 Financial Summary v${p.version}`,
    `<h1>Financial Summary — v${p.version}</h1><p class="muted">${esc(CASE_SETTINGS.caseName)}</p>${financeSection(p)}`,
    stamps(p),
  );
}

export function packetHtml(p: PacketInput) {
  const toc = p.sections
    .map((s, i) => {
      const count = p.exhibits.filter((e) => e.section === s).length;
      return `<tr><td>${sectionLetter(i)}</td><td>${esc(s)}</td><td>${count} exhibit${count === 1 ? "" : "s"}</td></tr>`;
    })
    .join("");

  const sectionBlocks = p.sections
    .map((s, i) => {
      const own = p.exhibits.filter((e) => e.section === s);
      const crossRefs = p.exhibits.filter(
        (e) =>
          e.section !== s &&
          (e.item.categories?.length ? e.item.categories : [e.item.category]).includes(s),
      );
      return `<h2 class="sep">${sectionLetter(i)}. ${esc(s)}</h2>
        ${
          own.length
            ? `<table><thead><tr><th>Exhibit</th><th>Title</th><th>Date</th><th>Source</th><th>Pages</th></tr></thead><tbody>${own
                .map(
                  (e) =>
                    `<tr><td>${esc(e.number)}</td><td>${esc(e.item.title || e.item.fileName)}</td><td>${esc(formatDate(e.item.dateOfDocument))}</td><td>${esc(e.item.sourceType)}</td><td>${e.firstPage}–${e.lastPage}</td></tr>`,
                )
                .join("")}</tbody></table>`
            : `<p class="muted">No evidence filed in this section yet.</p>`
        }
        ${
          crossRefs.length
            ? `<p class="note">Also supporting this section (filed once, cross-referenced here): ${crossRefs
                .map((e) => esc(e.number))
                .join(", ")}</p>`
            : ""
        }`;
    })
    .join("");

  const separators = p.exhibits
    .map(
      (e) =>
        `<div class="sepsheet"><p class="no">${esc(e.number)}</p><p>${esc(e.item.title || e.item.fileName)}</p>
        <p class="muted">${esc(formatDate(e.item.dateOfDocument))} · ${esc(e.item.sourceType)} · packet pages ${e.firstPage}–${e.lastPage}</p>
        <p class="muted">Original file: ${esc(e.item.fileName)} — filed unchanged in Google Drive</p></div>`,
    )
    .join("");

  const body = `<div class="cover">
      <h1>${esc(CASE_SETTINGS.caseName)}</h1>
      <p>Draft supporting-evidence packet — version ${p.version}</p>
      <table><tbody>
        <tr><th>Qualifying relative</th><td>${esc(CASE_SETTINGS.primaryQualifyingRelative)}</td></tr>
        <tr><th>Applicant</th><td>Imran</td></tr>
        <tr><th>Child</th><td>${esc(CASE_SETTINGS.child)}</td></tr>
        <tr><th>Family separation begins</th><td>${esc(formatDate(CASE_SETTINGS.separationStartDate))}</td></tr>
        <tr><th>Generated</th><td>${esc(formatDateTime(p.generatedAt))} by ${esc(p.generatedBy)}</td></tr>
        <tr><th>Source data last edited</th><td>${esc(p.lastEditedAt ? formatDateTime(p.lastEditedAt) : "—")}</td></tr>
        <tr><th>Exhibits</th><td>${p.exhibits.length}</td></tr>
        <tr><th>Packet pages (evidence)</th><td>${p.exhibits.at(-1)?.lastPage ?? 0}</td></tr>
      </tbody></table>
      <p class="note">This packet organises collected evidence and states factual figures only. It makes no legal argument or prediction about the outcome of the application. Original files in Google Drive are never altered.</p>
    </div>

    ${
      p.narrative?.coverLetter.length
        ? `<div class="sep"><h2 style="border:none">Cover Letter</h2>
            ${p.narrative.coverLetter.map((para) => `<p>${esc(para)}</p>`).join("")}
            <p class="muted">Drafted from the recorded exhibit details (${esc(p.narrative.model)}, ${esc(formatDateTime(p.narrative.generatedAt))}). Read and confirm before filing.</p></div>`
        : ""
    }

    <h2 class="sep">Table of Contents</h2>
    <table><thead><tr><th>#</th><th>Section</th><th>Contents</th></tr></thead><tbody>${toc}</tbody></table>

    <h2 class="sep">Case Timeline / Chronology</h2>
    ${[...p.events]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (e) =>
          `<h3>${esc(formatDate(e.date))} — ${esc(e.title)}</h3><p>${esc(e.description)}</p>
           ${e.effectOnAciah ? `<p><strong>Effect on Aciah:</strong> ${esc(e.effectOnAciah)}</p>` : ""}
           ${e.effectOnFamily ? `<p><strong>Effect on Jibril / family:</strong> ${esc(e.effectOnFamily)}</p>` : ""}
           <p class="muted">Exhibits: ${
             (e.evidenceIds ?? [])
               .map((id) => p.exhibits.find((x) => x.item.id === id)?.number)
               .filter(Boolean)
               .join(", ") || "none linked"
           }</p>`,
      )
      .join("")}

    <div class="sep">${financeSection(p)}</div>

    <h2 class="sep">Exhibit Index</h2>
    <table><thead><tr><th>Exhibit</th><th>Title</th><th>Date</th><th>Source</th><th>People</th><th>Categories</th><th>Pages</th><th>Description</th></tr></thead>
    <tbody>${exhibitRows(p.exhibits, p.narrative)}</tbody></table>

    ${sectionBlocks}

    <h2 class="sep">Exhibit Separator Sheets</h2>
    <p class="muted">Place each separator ahead of the original document when assembling the printed bundle. Originals stay exactly as filed.</p>
    ${separators}`;

  return docShell(`I601 Case Packet v${p.version}`, body, stamps(p));
}

export type { PacketInput, PacketVersion };
