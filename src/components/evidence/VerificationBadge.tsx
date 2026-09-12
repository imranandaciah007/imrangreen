import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import {
  verificationLabel,
  verificationTone,
  type VerificationReport,
} from "@/lib/evidence/verification";

/**
 * Shows how much independent checking an item has actually had, plus the audit line
 * (which reader analysed it, which one checked it, and when).
 */
export function VerificationBadge({
  report,
  showAudit = false,
}: {
  report?: VerificationReport | undefined;
  showAudit?: boolean;
}) {
  const state = report?.state;
  const Icon =
    state === "verified" ? ShieldCheck : state === "disagreement" ? ShieldAlert : ShieldQuestion;

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${verificationTone(state)}`}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{verificationLabel(state)}</span>
      </span>
      {showAudit && report && (
        <p className="font-mono text-[10px] break-words text-muted-foreground">
          {report.analysisProvider}/{report.analysisModel} read {report.analysedAt.slice(0, 16).replace("T", " ")}
          {report.verifiedAt
            ? ` · checked by ${report.verifierProvider}/${report.verifierModel} ${report.verifiedAt.slice(0, 16).replace("T", " ")}`
            : " · not independently checked"}
        </p>
      )}
      {report?.error && <p className="text-[11px] text-warning-foreground">{report.error}</p>}
      {report && report.fields.some((f) => f.verdict === "disagrees") && (
        <ul className="space-y-1">
          {report.fields
            .filter((f) => f.verdict === "disagrees")
            .map((f) => (
              <li key={f.field} className="text-[11px] text-destructive">
                {f.field}: the document appears to show “{f.documentShows || "something different"}”
                {f.note ? ` — ${f.note}` : ""}
              </li>
            ))}
        </ul>
      )}
      {report?.notes.length ? (
        <ul className="space-y-0.5">
          {report.notes.map((n) => (
            <li key={n} className="text-[11px] text-muted-foreground">
              • {n}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
