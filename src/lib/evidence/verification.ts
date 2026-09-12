/**
 * Shape of the independent verification result, shared by the server checker and the UI.
 * Client-safe: no keys, no server imports.
 */

export type FieldVerdict = "agrees" | "disagrees" | "cannot_verify";

export interface VerifiedField {
  field: string;
  verdict: FieldVerdict;
  /** Only set when the checker disagrees: what the document itself shows. */
  documentShows: string;
  note: string;
}

export type VerificationState =
  | "primary_only"
  | "verified"
  | "disagreement"
  | "needs_human_review"
  | "unavailable";

export interface VerificationReport {
  state: VerificationState;
  fields: VerifiedField[];
  notes: string[];
  analysisProvider: string;
  analysisModel: string;
  analysedAt: string;
  verifierProvider: string | null;
  verifierModel: string | null;
  verifiedAt: string | null;
  error: string | null;
}

/** Plain-language label for a verification state. */
export function verificationLabel(state: VerificationState | undefined) {
  switch (state) {
    case "verified":
      return "Checked by both readers";
    case "disagreement":
      return "The two readers disagree";
    case "needs_human_review":
      return "Needs your review";
    case "unavailable":
      return "Second reader unavailable — first reading only";
    default:
      return "First reading only";
  }
}

/** Tailwind classes for the badge, using the app's own tokens. */
export function verificationTone(state: VerificationState | undefined) {
  switch (state) {
    case "verified":
      return "border-success/50 bg-success/10 text-success";
    case "disagreement":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "needs_human_review":
      return "border-warning/50 bg-warning/10 text-warning-foreground";
    default:
      return "border-border bg-secondary/60 text-muted-foreground";
  }
}
