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

/** Result of an AI text-extraction run on a document. */
export interface AiExtraction {
  ranAt: string;
  /** True when the AI read the actual file content (not just the file name). */
  contentRead: boolean;
  summary: string;
  language: string;
  /** Fields the two verification passes agreed on and that were applied. */
  applied: string[];
  /** Fields the passes disagreed on — the user must confirm these. */
  uncertain: { field: string; options: string[] }[];
  /** Raw output of both scans, kept for auditability. */
  passes?: Record<string, unknown>[] | undefined;
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
  aiExtraction?: AiExtraction | undefined;

  notes: string;
  /** For evidence about Jibril or others: how this affects Aciah (user-approved). */
  affectsAciah?: string | undefined;
  /** Id of the exhibit this may duplicate (never deleted automatically). */
  duplicateOfId?: string | undefined;
  createdBy: string;
  lastEditedBy: string;
  createdAt: string;
  updatedAt: string;
  auditTrail: AuditEntry[];
}

export const EVENT_STATUSES = ["Recorded", "Needs evidence", "Confirmed", "Resolved"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface HardshipEvent {
  id: string;
  date: string;
  title: string;
  category: Category;
  /** An event can sit in several hardship categories. */
  categories?: Category[] | undefined;
  people: string[];
  description: string;
  /** Primary effect on Aciah, the qualifying relative. */
  effectOnAciah?: string | undefined;
  /** Secondary effect on Jibril or the wider family. */
  effectOnFamily?: string | undefined;
  followUp?: string | undefined;
  status?: EventStatus | undefined;
  financialImpact?: number | undefined;
  financialCurrency?: "GBP" | "USD" | undefined;
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

/** Separation-related expense categories (Prompt 3). Ordinary spending is not tracked. */
export const EXPENSE_CATEGORIES = [
  "Money sent by Imran to Aciah",
  "Jibril — formula/milk",
  "Jibril — nappies/wipes",
  "Jibril — baby food",
  "Jibril — clothing",
  "Jibril — medicines/medical",
  "Jibril — equipment/baby supplies",
  "Jibril — childcare",
  "Jibril — transport",
  "Aciah — medical",
  "Aciah — medication",
  "Aciah — pregnancy related",
  "Aciah — appointment transport",
  "Housing / household contribution",
  "Relocation / re-establishment in U.S.",
  "Immigration fees",
  "Separation-related travel",
  "Communication / postage / document costs",
  "Other genuine separation-related expense",
  "UK fixed obligations",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_GROUPS: Record<string, ExpenseCategory[]> = {
  "Money sent to Aciah": ["Money sent by Imran to Aciah"],
  "Jibril costs": [
    "Jibril — formula/milk",
    "Jibril — nappies/wipes",
    "Jibril — baby food",
    "Jibril — clothing",
    "Jibril — medicines/medical",
    "Jibril — equipment/baby supplies",
    "Jibril — childcare",
    "Jibril — transport",
  ],
  "Aciah medical & pregnancy": [
    "Aciah — medical",
    "Aciah — medication",
    "Aciah — pregnancy related",
    "Aciah — appointment transport",
  ],
  "Housing & relocation": [
    "Housing / household contribution",
    "Relocation / re-establishment in U.S.",
  ],
  "Immigration & travel": ["Immigration fees", "Separation-related travel"],
  "UK fixed obligations": ["UK fixed obligations"],
  Other: [
    "Communication / postage / document costs",
    "Other genuine separation-related expense",
    "Other",
  ],
};

export const PAYERS = ["Imran", "Aciah"] as const;
export const BENEFICIARIES = ["Aciah", "Jibril", "Family", "Immigration", "Other"] as const;
export const FINANCE_STATUSES = ["Verified", "Needs confirmation", "Missing receipt"] as const;
export type FinanceStatus = (typeof FINANCE_STATUSES)[number];

/** One relevant line item taken from a mixed receipt. */
export interface FinanceLineItem {
  label: string;
  amount: number;
  category: ExpenseCategory;
  /** False = personal/ordinary spending, excluded from hardship totals. */
  included: boolean;
}

export interface FinancialEntry {
  id: string;
  date: string;
  label: string;
  kind: FinanceKind;
  /** Original amount as paid — never overwritten by a converted value. */
  amount: number;
  currency: "GBP" | "USD";
  recurring: boolean;
  notes: string;
  evidenceIds: string[];
  /** Prompt 3 fields (all optional so older entries keep working). */
  expenseCategory?: ExpenseCategory | undefined;
  payer?: (typeof PAYERS)[number] | undefined;
  beneficiary?: (typeof BENEFICIARIES)[number] | undefined;
  merchant?: string | undefined;
  purpose?: string | undefined;
  gbpEquivalent?: number | undefined;
  usdEquivalent?: number | undefined;
  exchangeRate?: number | undefined;
  exchangeRateDate?: string | undefined;
  exchangeRateSource?: string | undefined;
  hardshipCategories?: Category[] | undefined;
  affectsAciah?: string | undefined;
  status?: FinanceStatus | undefined;
  eventId?: string | undefined;
  lineItems?: FinanceLineItem[] | undefined;
  /** Fingerprint of a real-world transfer, so two evidence documents never double-count it. */
  transferKey?: string | undefined;
  /** True when the user has decided this is ordinary spending, not hardship-tracked. */
  excluded?: boolean | undefined;
  /** Monthly repeats are only generated up to a date the user confirms. */
  recurringUntil?: string | undefined;
}

/** UK income and fixed commitments — a factual summary, not a legal conclusion. */
export interface IncomeSettings {
  netMonthlyIncome: number;
  mortgage: number;
  councilTax: number;
  utilities: number;
  debtCommitments: number;
  transportWork: number;
  otherObligations: number;
  currency: "GBP";
  /** Manual USD→GBP rate used for dashboard equivalents. */
  usdToGbp: number;
  rateDate: string;
  rateSource: string;
  updatedAt: string;
  updatedBy: string;
}

export const DEFAULT_INCOME: IncomeSettings = {
  netMonthlyIncome: 0,
  mortgage: 0,
  councilTax: 0,
  utilities: 0,
  debtCommitments: 0,
  transportWork: 0,
  otherObligations: 0,
  currency: "GBP",
  usdToGbp: 0.79,
  rateDate: "",
  rateSource: "Manually entered",
  updatedAt: "",
  updatedBy: "",
};


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
