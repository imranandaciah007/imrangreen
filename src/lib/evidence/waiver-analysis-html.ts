import type { WaiverAnalysis } from "@/lib/waiver-analysis.functions";
import type { PacketExhibit } from "./packet";

/**
 * Printable I-601 waiver analysis: case summary, legal framework, hardship
 * sections in FACT / EVIDENCE / EFFECT ON ACIAH / LEGAL RELEVANCE / EXHIBIT
 * form, discretion, and a filer-only review section (red team, contradictions,
 * attorney review, missing evidence) that is clearly separated from the
 * submission text.
 */

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

const STYLE = `
  @page { margin: 22mm 18mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #12151c; font-size: 11.5pt; line-height: 1.55; }
  h1 { font-size: 21pt; margin: 0 0 4pt; color: #0B2341; }
  h2 { font-size: 13pt; margin: 20pt 0 6pt; color: #0B2341; border-bottom: 1px solid #c9cfda; padding-bottom: 4pt; }
  h3 { font-size: 11pt; margin: 14pt 0 4pt; color: #0B2341; }
  .rule { height: 3px; background: #0B2341; margin-bottom: 14pt; }
  .accent { height: 2px; background: #8B0000; width: 90pt; margin: 6pt 0 14pt; }
  .muted { color: #5b6474; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 8pt; font-size: 9pt; font-family: Helvetica, Arial, sans-serif; }
  th, td { border: 1px solid #c9cfda; padding: 5pt 6pt; text-align: left; vertical-align: top; }
  th { background: #eef1f6; color: #0B2341; width: 26%; }
  .arg { border-left: 3px solid #0B2341; padding: 2pt 0 2pt 10pt; margin: 10pt 0; }
  .arg dl { margin: 0; font-size: 10.5pt; }
  .arg dt { font-family: Helvetica, Arial, sans-serif; font-size: 8pt; letter-spacing: .06em; text-transform: uppercase; color: #5b6474; margin-top: 5pt; }
  .arg dd { margin: 1pt 0 0; }
  .note { background: #f4f6fa; border: 1px solid #d7dde8; padding: 8pt; font-size: 9.5pt; font-family: Helvetica, Arial, sans-serif; }
  .flag { background: #fdf3f3; border: 1px solid #e3c4c4; padding: 8pt; font-size: 9.5pt; font-family: Helvetica, Arial, sans-serif; }
  .flag h2 { color: #8B0000; border-color: #e3c4c4; }
  ul { margin: 4pt 0 0 16pt; padding: 0; }
  li { margin-bottom: 3pt; }
  .page { page-break-before: always; }
  a { color: #0B2341; }
`;

const paras = (lines: string[], fallback = "Not established by the records on file.") =>
  lines.length
    ? lines.map((p) => `<p>${esc(p)}</p>`).join("")
    : `<p class="muted">${esc(fallback)}</p>`;

const bullets = (lines: string[], fallback = "None recorded.") =>
  lines.length
    ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
    : `<p class="muted">${esc(fallback)}</p>`;

export function waiverAnalysisHtml(
  analysis: WaiverAnalysis,
  meta: {
    caseName: string;
    version: number;
    applicant: string;
    qualifyingRelative: string;
    exhibits: PacketExhibit[];
  },
) {
  const generated = new Date(analysis.generatedAt).toLocaleString("en-GB");

  const groundRows = analysis.grounds.length
    ? analysis.grounds
        .map(
          (g) => `<tr><th>${esc(g.ground)}</th><td><strong>${esc(
            g.status === "confirmed" ? "Confirmed by government record" : g.status === "not_established" ? "Not established" : "Potential issue — not determined by the U.S. government",
          )}</strong><br>${esc(g.basis)}${
            g.exhibits.length ? `<br><span class="muted">Exhibits: ${esc(g.exhibits.join(", "))}</span>` : ""
          }</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" class="muted">No inadmissibility ground is established by the records on file.</td></tr>`;

  const body = analysis.sections
    .map((s, i) => {
      const args = s.arguments
        .map(
          (a) => `<div class="arg"><dl>
            <dt>Fact</dt><dd>${esc(a.fact)}</dd>
            <dt>Evidence</dt><dd>${esc(a.evidence || "Not stated in the records.")}</dd>
            <dt>Effect on ${esc(meta.qualifyingRelative)}</dt><dd>${esc(a.effectOnAciah || "Not established by the records.")}</dd>
            <dt>Legal relevance</dt><dd>${esc(a.legalRelevance || "—")}</dd>
            <dt>Exhibit</dt><dd>${esc(a.exhibit || "No exhibit cited — verify before filing.")}</dd>
          </dl></div>`,
        )
        .join("");
      return `<h2>${i + 4}. ${esc(s.heading)}</h2>${paras(s.paragraphs, "")}${args}`;
    })
    .join("");

  const exhibitRows = meta.exhibits
    .map(
      (e) => `<tr>
        <td>${esc(e.number)}</td>
        <td>${esc(e.item.title || e.item.fileName)}</td>
        <td>${esc(e.item.dateOfDocument ?? "—")}</td>
        <td>${esc(e.item.sourceType ?? "—")}</td>
        <td>${esc((e.item.people ?? []).join(", ") || "—")}</td>
        <td>${e.firstPage}–${e.lastPage}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(
    `I-601 Waiver Analysis v${meta.version} — ${meta.caseName}`,
  )}</title><style>${STYLE}</style></head><body>
    <div class="rule"></div>
    <h1>Form I-601 — Application for Waiver of Grounds of Inadmissibility</h1>
    <div class="accent"></div>
    <p class="muted">Case analysis and supporting submission · version ${meta.version} · prepared ${esc(generated)}</p>
    <table><tbody>
      <tr><th>Applicant</th><td>${esc(meta.applicant)}</td></tr>
      <tr><th>Qualifying relative</th><td>${esc(analysis.qualifyingRelative.name)} — ${esc(analysis.qualifyingRelative.basis || "relationship shown by the exhibits listed")}${
        analysis.qualifyingRelative.exhibits.length
          ? `<br><span class="muted">Exhibits: ${esc(analysis.qualifyingRelative.exhibits.join(", "))}</span>`
          : ""
      }</td></tr>
      <tr><th>Exhibits filed</th><td>${meta.exhibits.length}</td></tr>
    </tbody></table>
    <p class="note">Every factual statement below is drawn from the exhibits listed in this packet and cites the exhibit where the adjudicator can verify it. Nothing in this analysis is asserted beyond what those records show. Sections marked “For the filer only” are internal review notes and are not part of the submission.</p>

    <h2>1. Case Summary</h2>
    ${paras(analysis.caseSummary)}

    <h2>2. Relevant Immigration Background</h2>
    ${paras(analysis.immigrationBackground)}
    <h3>Inadmissibility ground(s) under analysis</h3>
    <table><tbody>${groundRows}</tbody></table>

    <h2>3. Applicable Waiver and Legal Framework</h2>
    <table><tbody>
      <tr><th>Waiver provision</th><td>${esc(analysis.legalFramework.provision || "Not established by the records on file.")}</td></tr>
      <tr><th>Hardship standard</th><td>${esc(analysis.legalFramework.hardshipStandard || "Not established by the records on file.")}</td></tr>
    </tbody></table>
    ${bullets(analysis.legalFramework.notes, "")}

    ${body}

    <h2>Cumulative Hardship</h2>
    ${paras(analysis.cumulativeHardship)}

    <h2>Discretion</h2>
    <h3>Favorable factors on the record</h3>
    ${bullets(analysis.discretion.favorable)}
    <h3>Unfavorable factors on the record</h3>
    ${bullets(analysis.discretion.unfavorable, "None identified in the records on file.")}
    ${paras(analysis.discretion.response, "")}

    <h2>Conclusion</h2>
    ${paras(analysis.conclusion)}

    <div class="page"></div>
    <h2>Exhibit Index</h2>
    <table><thead><tr><th>Exhibit</th><th>Title</th><th>Date</th><th>Source</th><th>People</th><th>Pages</th></tr></thead>
    <tbody>${exhibitRows || `<tr><td colspan="6" class="muted">No exhibits selected.</td></tr>`}</tbody></table>

    <div class="page"></div>
    <div class="flag">
      <h2>For the filer only — review before submission</h2>
      <p class="muted">These notes test the case rather than argue it. Remove this page before filing.</p>
      <h3>Immigration attorney review required</h3>
      ${bullets(
        analysis.attorneyReview.map((a) => `${a.issue} — ${a.why}`),
        "No legal question was flagged for attorney review.",
      )}
      <h3>Conflicts between sources</h3>
      ${bullets(
        analysis.contradictions.map(
          (c) => `${c.statement} — source A: ${c.sourceA}; source B: ${c.sourceB}`,
        ),
        "No conflicting records identified.",
      )}
      <h3>Statements that could not be verified</h3>
      ${bullets(analysis.unverified, "Every statement above traces to a listed exhibit.")}
      <h3>Questions an officer could ask</h3>
      ${bullets(
        analysis.redTeam.map((r) => `${r.challenge} — weakness: ${r.weakness}; remedy: ${r.remedy}`),
        "No further challenge identified.",
      )}
      <h3>Missing evidence</h3>
      ${bullets(
        analysis.missingEvidence.map(
          (m) =>
            `[${m.priority === "critical" ? "Critical" : "Useful"}] ${m.missing} — why it matters: ${m.whyItMatters}; what could help: ${m.couldHelp}`,
        ),
        "No further evidence identified as needed.",
      )}
      <p class="muted">Prepared from the case records by ${esc(analysis.model)} on ${esc(generated)}. Read and confirm every statement before filing.</p>
    </div>
  </body></html>`;
}
