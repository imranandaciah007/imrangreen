export const CASE_SETTINGS = {
  caseName: "Imran & Aciah — Potential I-601",
  separationStartDate: "2026-08-18",
  primaryQualifyingRelative: "Aciah",
  child: "Jibril",
  baseCurrency: "GBP",
  secondaryCurrency: "USD",
} as const;

export const PROFILES = ["Imran", "Aciah"] as const;
export type Profile = (typeof PROFILES)[number];

export const PEOPLE = ["Aciah", "Imran", "Jibril", "Other family", "Third party"] as const;

export const DEFAULT_CATEGORIES: string[] = [
  "Aciah / Qualifying Relative",
  "Medical & Psychological",
  "Pregnancy",
  "Jibril / Child & Family",
  "Financial Hardship",
  "Family Separation",
  "Safety / UK Conditions",
  "Relocation to UK",
  "Employment / Career",
  "U.S. Family & Support Network",
  "Housing",
  "Police / Government / Independent Evidence",
  "Relationship Evidence",
  "Immigration / Legal Records",
  "Other",
];

/** Kept for convenience; the live list comes from the store (users can add their own). */
export const CATEGORIES = DEFAULT_CATEGORIES;

export type Category = string;

export const SOURCE_TYPES = [
  "Government / Official",
  "Medical",
  "Financial / Bank",
  "Employer",
  "Police / Court",
  "Independent Third Party",
  "Personal Statement",
  "Message / Screenshot",
  "Receipt / Purchase",
  "Photo",
  "Other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const STATUSES = [
  "New",
  "AI processing",
  "Needs confirmation",
  "Reviewed",
  "Ready",
  "Missing supporting evidence",
  "Duplicate suspected",
  "Translation needed",
  "Archived",
] as const;

export type EvidenceStatus = (typeof STATUSES)[number];

/** Filing stages, derived from status. */
export const STAGES = ["New", "Needs confirmation", "Reviewed", "Ready"] as const;

export type Stage = (typeof STAGES)[number];

export const FILE_TYPES = ["PDF", "DOCX", "JPG", "PNG"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const TAGS = [
  "#Critical",
  "#PrimaryEvidence",
  "#SecondaryEvidence",
  "#TranslationPending",
  "#FollowUp",
  "#Aciah",
  "#Jibril",
] as const;

export type Tag = string;

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
}

export interface EvidenceItem {
  id: string;
  exhibitId: string;
  fileName: string;
  title: string;
  /** Primary hardship category (first of `categories`). */
  category: Category;
  categories: Category[];
  subCategory: string;
  sourceType: SourceType;
  people: string[];
  fileType: FileType;
  fileSizeBytes: number;
  mimeType?: string | undefined;
  pageCount: number;
  status: EvidenceStatus;
  dateOfDocument: string;
  tags: Tag[];
  cloudDriveUrl: string;
  driveFileId?: string | undefined;
  driveFolder?: string | undefined;
  translationFileUrl?: string | undefined;
  needsTranslation?: boolean | undefined;
  duplicateSuspected?: boolean | undefined;
  aiConfidence?: number | undefined;
  notes: string;
  createdBy: string;
  lastEditedBy: string;
  createdAt: string;
  updatedAt: string;
  auditTrail: AuditEntry[];
}

export interface HardshipEvent {
  id: string;
  date: string;
  title: string;
  category: Category;
  people: string[];
  description: string;
  evidenceIds: string[];
  createdBy: string;
  lastEditedBy: string;
  createdAt: string;
  updatedAt: string;
}

export const FINANCE_KINDS = [
  "Travel / Flights",
  "Legal fees",
  "Medical costs",
  "Housing / Rent",
  "Childcare",
  "Lost income",
  "Communication",
  "Other",
] as const;
export type FinanceKind = (typeof FINANCE_KINDS)[number];

export interface FinancialEntry {
  id: string;
  date: string;
  label: string;
  kind: FinanceKind;
  amount: number;
  currency: "GBP" | "USD";
  recurring: boolean;
  notes: string;
  evidenceIds: string[];
  createdBy: string;
  lastEditedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseTask {
  id: string;
  title: string;
  category: Category | "";
  dueDate: string;
  done: boolean;
  assignedTo: string;
  createdBy: string;
  lastEditedBy: string;
  createdAt: string;
  updatedAt: string;
}

export function stageForStatus(status: EvidenceStatus): Stage {
  switch (status) {
    case "Ready":
      return "Ready";
    case "Reviewed":
      return "Reviewed";
    case "Needs confirmation":
    case "Missing supporting evidence":
    case "Duplicate suspected":
    case "Translation needed":
      return "Needs confirmation";
    default:
      return "New";
  }
}

export function statusForStage(stage: Stage): EvidenceStatus {
  switch (stage) {
    case "Ready":
      return "Ready";
    case "Reviewed":
      return "Reviewed";
    case "Needs confirmation":
      return "Needs confirmation";
    default:
      return "New";
  }
}

export const READY_STATUSES: EvidenceStatus[] = ["Ready", "Reviewed"];

export const DRIVE_FOLDERS = [
  "/I601 Evidence/Original Evidence/",
  "/I601 Evidence/Generated Case Packets/",
  "/I601 Evidence/Financial Evidence/",
  "/I601 Evidence/Medical/",
  "/I601 Evidence/Police-Government/",
  "/I601 Evidence/Relationship/",
  "/I601 Evidence/Other/",
] as const;
