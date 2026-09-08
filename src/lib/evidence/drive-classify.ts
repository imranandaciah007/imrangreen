import type { DriveFileSummary } from "@/lib/drive.functions";
import type { EvidenceStatus, FileType, SourceType } from "./types";

export interface DriveClassification {
  people: string[];
  categories: string[];
  tags: string[];
  sourceType: SourceType;
  status: EvidenceStatus;
  /** 0–1. Low confidence or conflicting signals → ask the user to confirm. */
  confidence: number;
  reason: string;
}

const PERSON_KEYWORDS: [RegExp, string][] = [
  [/\bimran\b/i, "Imran"],
  [/\baciah\b/i, "Aciah"],
  [/\bjibril\b/i, "Jibril"],
];

const JOINT_HINTS = /joint|marriage|married|wedding|tenanc|mortgage|both|family/i;

const CATEGORY_RULES: [RegExp, string][] = [
  [/pregnan|matern|scan\b|antenat|midwif|ultrasound|nhs.*(preg|matern)/i, "Pregnancy"],
  [
    /gp\b|doctor|hospital|medical|prescri|therap|psych|mental|counsel|diagnos|nhs/i,
    "Medical & Psychological",
  ],
  [
    /bank|statement|payslip|salary|tax\b|hmrc|invoice|receipt|debt|loan|saving|utility|bill/i,
    "Financial Hardship",
  ],
  [/school|nurser|child|jibril|immunis|vaccin|paediatr/i, "Jibril / Child & Family"],
  [/flight|travel|ticket|boarding|separat|visa.*visit|hotel/i, "Family Separation"],
  [
    /police|crime|caution|court|solicitor|legal|statement.*police|cps/i,
    "Police / Government / Independent Evidence",
  ],
  [
    /passport|visa|home\s*office|immigra|uscis|biometr|brp|entry\s*clearance|decision\s*letter/i,
    "Immigration / Legal Records",
  ],
  [/tenanc|rent\b|mortgage|landlord|housing|council\s*tax/i, "Housing"],
  [/employ|job\b|contract.*employ|reference.*employer|p45|p60|work\b/i, "Employment / Career"],
  [/photo|picture|img_|screenshot|chat|whatsapp|message|call\s*log/i, "Relationship Evidence"],
  [/marriage|wedding|relationship|annivers/i, "Relationship Evidence"],
  [/relocat|moving|removal|shipping/i, "Relocation to UK"],
];

const SOURCE_RULES: [RegExp, SourceType][] = [
  [/bank|statement|payslip|tax\b|hmrc|invoice|receipt/i, "Financial / Bank"],
  [/gp\b|doctor|hospital|medical|nhs|prescri|psych/i, "Medical"],
  [/police|court|cps|caution/i, "Police / Court"],
  [/employ|p45|p60|hr\b/i, "Employer"],
  [/passport|visa|home\s*office|uscis|council|gov/i, "Government / Official"],
  [/screenshot|whatsapp|chat|message/i, "Message / Screenshot"],
  [/photo|img_|\.jpe?g|\.png/i, "Photo"],
];

function fileTypeFor(name: string, mime: string): FileType | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "PDF";
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) return "DOCX";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || mime === "image/jpeg") return "JPG";
  if (lower.endsWith(".png") || mime === "image/png") return "PNG";
  return null;
}

function titleFromName(name: string) {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Two-pass heuristic sort of a Drive file into people / hardship categories.
 * Pass 1: person keywords. Pass 2: category + source keywords (folder names included).
 * Agreement / strong keyword matches → high confidence; otherwise "Needs confirmation".
 */
export function classifyDriveFile(file: DriveFileSummary): DriveClassification | null {
  const fileType = fileTypeFor(file.name, file.mimeType);
  if (!fileType) return null; // skip unsupported file kinds

  const haystack = `${file.name} ${file.parentFolders.join(" ")}`;

  const people = new Set<string>();
  for (const [re, person] of PERSON_KEYWORDS) {
    if (re.test(haystack)) people.add(person);
  }
  if (JOINT_HINTS.test(haystack)) {
    people.add("Imran");
    people.add("Aciah");
  }

  const categories = new Set<string>();
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(haystack)) categories.add(cat);
  }

  let sourceType: SourceType = "Other";
  for (const [re, st] of SOURCE_RULES) {
    if (re.test(haystack)) {
      sourceType = st;
      break;
    }
  }

  const signals = (people.size > 0 ? 1 : 0) + (categories.size > 0 ? 1 : 0);
  const confidence = signals === 2 ? 0.85 : signals === 1 ? 0.55 : 0.25;

  if (people.size === 0) people.add("Third party");
  if (categories.size === 0) categories.add("Other");

  const tags: string[] = [];
  if (people.has("Aciah")) tags.push("#Aciah");
  if (people.has("Jibril")) tags.push("#Jibril");

  const status: EvidenceStatus = confidence >= 0.8 ? "New" : "Needs confirmation";

  const reason =
    confidence >= 0.8
      ? "Sorted automatically from the file and folder names."
      : "Only partly recognised — please confirm the person and category.";

  return {
    people: Array.from(people),
    categories: Array.from(categories),
    tags,
    sourceType,
    status,
    confidence,
    reason,
  };
}

export { fileTypeFor, titleFromName };
