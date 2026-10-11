import type { VerificationReport } from "./verification";

export const CASE_SETTINGS = {
  caseName: "Imran & Aciah — Potential I-601",
  separationStartDate: "2026-08-18",
  primaryQualifyingRelative: "Aciah",
  /** Full names as they appear on the filing packet's title page. */
  applicantFullName: "Imran Ahmin",
  qualifyingRelativeFullName: "Aciah Bibi Atayee",
  child: "Jibril",
  baseCurrency: "GBP",
  secondaryCurrency: "USD",
} as const;

/** Users are merged for now: one shared identity, no sign-in or switching. */
export const PROFILES = ["Imran & Aciah"] as const;

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

export const FILE_TYPES = [
  "PDF",
  "DOCX",
  "JPG",
  "PNG",
  "Spreadsheet",
  "Slides",
  "Text",
  "Email",
  "Video",
  "Audio",
  "Zip",
  "Other",
] as const;
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
  /** Independent second-reader check of what the primary reader extracted. */
  verification?: VerificationReport | undefined;
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
  /** Enriched clone PDF generated from this original. */
  cloneFileId?: string | undefined;
  cloneUrl?: string | undefined;
  cloneFileName?: string | undefined;
  cloneGeneratedAt?: string | undefined;
  /** Fields a human has confirmed — AI must never silently overwrite these. */
  confirmedFields?: string[] | undefined;
  /** Later AI runs that disagree with a human-confirmed field, awaiting a decision. */
  aiConflicts?: { field: string; existing: string; aiValue: string; ranAt: string }[] | undefined;

  notes: string;
  /** Provenance when this record came from the hardship diary import. */
  diarySource?: DiarySource | undefined;
  /** Appendix/exhibit references from the diary that this document satisfies. */
  appendixRefs?: string[] | undefined;
  /** True for the retained master hardship diary PDF itself. */
  isMasterDiary?: boolean | undefined;
  /** For evidence about Jibril or others: how this affects Aciah (user-approved). */
  affectsAciah?: string | undefined;
  /** Id of the exhibit this may duplicate (never deleted automatically). */
  duplicateOfId?: string | undefined;
  /** Stable packet exhibit number, assigned when a packet version is generated. */
  packetExhibitNo?: string | undefined;
  /** Kept in the vault but left out of the generated packet. */
  excludeFromPacket?: boolean | undefined;
  createdBy: string;
  lastEditedBy: string;
  createdAt: string;
  updatedAt: string;
  auditTrail: AuditEntry[];
}

/** Immutable record of one generated case packet. */
export interface PacketVersion {
  id: string;
  version: number;
  generatedAt: string;
  generatedBy: string;
  sourceLastEditedAt: string | null;
  exhibitCount: number;
  pageCount: number;
  sections: string[];
  totals: {
    documented: number;
    sentToAciah: number;
    jibril: number;
    medical: number;
    housing: number;
    immigration: number;
  };
  timelineEventCount: number;
  unresolvedIssues: number;
  driveFolder: string;
  /** Direct link to the Drive folder holding this generated packet version. */
  driveFolderWebViewLink?: string | undefined;
  files: { name: string; driveFileId?: string | undefined; webViewLink?: string | undefined }[];
  exhibitMap: { evidenceId: string; number: string; pages: string }[];
  /** The finished filing PDFs (index first, then the numbered parts). */
  filingFiles?: { name: string; webViewLink: string }[] | undefined;
  filingBuiltAt?: string | undefined;
  filingPageCount?: number | undefined;
  /** The cover letter drafted for this version, so any device can build its filing packet. */
  coverLetter?: string[] | undefined;
  /** Filing parts already built, so a build stopped on one device carries on from another. */
  filingParts?: FilingPartRecord[] | undefined;
  /** Which exhibits went into which part; saved parts are reused only while it still matches. */
  filingPlanKey?: string | undefined;
}

export interface FilingPartRecord {
  name: string;
  fileId: string;
  webViewLink: string;
  firstPage: number;
  lastPage: number;
  exhibits: { number: string; firstPage: number; lastPage: number; included: boolean; note?: string | undefined }[];
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
  /** Advice, medication or referral recorded by a professional. */
  professionalOutcome?: string | undefined;
  diarySource?: DiarySource | undefined;
  appendixRefs?: string[] | undefined;
  /** Fields a human has confirmed — AI/diary imports must never overwrite these. */
  confirmedFields?: string[] | undefined;
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

/** Which reporting group a payment belongs to ("Other" when it has no expense category). */
export function financeGroupOf(entry: { expenseCategory?: string | undefined }): string {
  const cat = entry.expenseCategory;
  if (cat) {
    for (const [group, cats] of Object.entries(EXPENSE_GROUPS)) {
      if ((cats as readonly string[]).includes(cat)) return group;
    }
  }
  return "Other";
}

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
  diarySource?: DiarySource | undefined;
  appendixRefs?: string[] | undefined;
  /** True when the diary describes a cost but gives no amount. */
  amountMissing?: boolean | undefined;
  confirmedFields?: string[] | undefined;
  /** Monthly repeats are only generated up to a date the user confirms. */
  recurringUntil?: string | undefined;
  createdBy: string;
  lastEditedBy: string;
  createdAt: string;
  updatedAt: string;
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

export const TASK_STATUSES = ["To do", "Waiting", "Complete"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["High", "Normal", "Low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** One-tap task templates for the things this case keeps needing. */
export const TASK_TEMPLATES = [
  "Request GP letter",
  "Request medical records",
  "Download bank statement",
  "Find receipt",
  "Upload transfer evidence",
  "Request employer letter",
  "Follow up police/government correspondence",
  "Add explanation",
  "Review AI uncertainty",
  "Obtain translation",
  "Other",
] as const;

export interface CaseTask {
  id: string;
  title: string;
  category: Category | "";
  dueDate: string;
  done: boolean;
  assignedTo: string;
  /** To do / Waiting / Complete. Older tasks fall back to done ? Complete : To do. */
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  /** Local device reminder time. */
  reminderAt?: string | undefined;
  /** Set after the system notification has been shown; cleared when rescheduled. */
  reminderNotifiedAt?: string | undefined;
  notes?: string | undefined;
  evidenceIds?: string[] | undefined;
  eventId?: string | undefined;
  financeId?: string | undefined;
  createdBy: string;
  lastEditedBy: string;
  createdAt: string;
  updatedAt: string;
}

export function taskStatus(task: CaseTask): TaskStatus {
  if (task.status) return task.status;
  return task.done ? "Complete" : "To do";
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

/* ------------------------------------------------------------------ *
 * Hardship Diary master import (Prompt 6)
 * ------------------------------------------------------------------ */

/** Where a fact came from inside the hardship diary. Kept for traceability. */
export interface DiarySource {
  master: "Hardship Diary";
  importId: string;
  fileName: string;
  /** Diary page number(s) the fact was read from. */
  pages: number[];
  /** Short quoted passage from the diary. */
  passage: string;
  appendixRefs: string[];
  importedAt: string;
  /** Raw output of both verification scans for this record. */
  passes?: Record<string, unknown>[] | undefined;
  /** True when the diary is the narrative source rather than independent evidence. */
  narrativeOnly: boolean;
}

export interface DiaryAppendixLink {
  ref: string;
  description: string;
  pages: number[];
  /** Vault document that satisfies this appendix reference, when found. */
  evidenceId?: string | undefined;
  /** Timeline / finance records that cite it. */
  eventIds?: string[] | undefined;
  financeIds?: string[] | undefined;
}

export interface DiaryImport {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  importedAt: string;
  importedBy: string;
  pagesAnalysed: number;
  /** Fingerprints of processed text chunks, so a later version imports only what changed. */
  chunkHashes: string[];
  /** Fingerprints of records already created, so re-import never duplicates them. */
  recordKeys: string[];
  masterEvidenceId?: string | undefined;
  appendix: DiaryAppendixLink[];
  summary: {
    eventsCreated: number;
    eventsEnriched: number;
    financesCreated: number;
    financesEnriched: number;
    matchedExisting: number;
    possibleDuplicates: number;
    needsConfirmation: number;
    appendixRefs: number;
    appendixMissing: number;
  };
}
