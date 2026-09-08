export const DEFAULT_CATEGORIES: string[] = [
  "Identity/Civil",
  "Financial/Tax",
  "Employment/Letters of Support",
  "Proof of Relationship",
  "Legal/Court Records",
  "Medical/Vaccination",
];

/** Kept for convenience; the live list comes from the store (users can add their own). */
export const CATEGORIES = DEFAULT_CATEGORIES;

export type Category = string;


export const STATUSES = [
  "Missing",
  "Draft",
  "Needs Translation",
  "Certified Translation Added",
  "Reviewed & Ready",
  "Included in Final Packet",
] as const;

export type EvidenceStatus = (typeof STATUSES)[number];

/** Kanban filing stages, derived from status. */
export const STAGES = [
  "Draft",
  "Needs Translation",
  "Legal Review",
  "Ready for Master Binder",
] as const;

export type Stage = (typeof STAGES)[number];

export const FILE_TYPES = ["PDF", "DOCX", "JPG", "PNG"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const TAGS = [
  "#Critical",
  "#JointAsset",
  "#PrimaryEvidence",
  "#SecondaryEvidence",
  "#TranslationPending",
  "#RFERisk",
] as const;

export type Tag = (typeof TAGS)[number];

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
  category: Category;
  subCategory: string;
  fileType: FileType;
  fileSizeBytes: number;
  pageCount: number;
  status: EvidenceStatus;
  dateOfDocument: string;
  tags: Tag[];
  cloudDriveUrl: string;
  translationFileUrl?: string | undefined;
  notes: string;
  auditTrail: AuditEntry[];
}

export function stageForStatus(status: EvidenceStatus): Stage {
  switch (status) {
    case "Missing":
    case "Draft":
      return "Draft";
    case "Needs Translation":
      return "Needs Translation";
    case "Certified Translation Added":
      return "Legal Review";
    default:
      return "Ready for Master Binder";
  }
}

export function statusForStage(stage: Stage): EvidenceStatus {
  switch (stage) {
    case "Draft":
      return "Draft";
    case "Needs Translation":
      return "Needs Translation";
    case "Legal Review":
      return "Certified Translation Added";
    default:
      return "Reviewed & Ready";
  }
}

export const READY_STATUSES: EvidenceStatus[] = ["Reviewed & Ready", "Included in Final Packet"];
