import { createServerFn } from "@tanstack/react-start";

/**
 * Full I-601 waiver analysis, written strictly from what the case records show.
 *
 * Gemini stays the reader/writer (ChatGPT only ever steps in when Gemini fails,
 * inside runJsonModel). The prompt below encodes the case-preparation standard
 * the filer asked for: Aciah is the qualifying relative and the centre of every
 * hardship finding, every important statement must be traceable to an exhibit,
 * nothing may be invented or softened, weaknesses and contradictions are flagged
 * rather than smoothed over, and genuine legal uncertainty is marked for an
 * immigration attorney.
 */

export interface WaiverExhibitInput {
  number: string;
  title: string;
  date: string;
  sourceType: string;
  people: string[];
  categories: string[];
  pages: string;
  summary: string;
  /** Recorded effect on Aciah, where the document or the filer noted one. */
  aciahImpact: string;
  /** True when fields are still awaiting human confirmation. */
  needsAttention: boolean;
}

export interface WaiverEventInput {
  date: string;
  title: string;
  categories: string[];
  people: string[];
  description: string;
  effectOnAciah: string;
  exhibits: string[];
}

export interface WaiverArgument {
  fact: string;
  evidence: string;
  effectOnAciah: string;
  legalRelevance: string;
  exhibit: string;
}

export interface WaiverSection {
  heading: string;
  paragraphs: string[];
  arguments: WaiverArgument[];
}

export interface WaiverGround {
  ground: string;
  /** "potential" unless the records show a formal U.S. government determination. */
  status: string;
  basis: string;
  exhibits: string[];
}

export interface WaiverAnalysis {
  caseSummary: string[];
  immigrationBackground: string[];
  grounds: WaiverGround[];
  legalFramework: { provision: string; hardshipStandard: string; notes: string[] };
  qualifyingRelative: { name: string; basis: string; exhibits: string[] };
  sections: WaiverSection[];
  cumulativeHardship: string[];
  discretion: { favorable: string[]; unfavorable: string[]; response: string[] };
  redTeam: { challenge: string; weakness: string; remedy: string }[];
  missingEvidence: { missing: string; whyItMatters: string; couldHelp: string; priority: string }[];
  contradictions: { statement: string; sourceA: string; sourceB: string }[];
  attorneyReview: { issue: string; why: string }[];
  unverified: string[];
  conclusion: string[];
  model: string;
  generatedAt: string;
}

const strArray = { type: "array", items: { type: "string" } };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    caseSummary: strArray,
    immigrationBackground: strArray,
    grounds: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ground: { type: "string" },
          status: { type: "string", enum: ["potential", "confirmed", "not_established"] },
          basis: { type: "string" },
          exhibits: strArray,
        },
        required: ["ground", "status", "basis", "exhibits"],
      },
    },
    legalFramework: {
      type: "object",
      additionalProperties: false,
      properties: {
        provision: { type: "string" },
        hardshipStandard: { type: "string" },
        notes: strArray,
      },
      required: ["provision", "hardshipStandard", "notes"],
    },
    qualifyingRelative: {
      type: "object",
      additionalProperties: false,
      properties: { name: { type: "string" }, basis: { type: "string" }, exhibits: strArray },
      required: ["name", "basis", "exhibits"],
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { type: "string" },
          paragraphs: strArray,
          arguments: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                fact: { type: "string" },
                evidence: { type: "string" },
                effectOnAciah: { type: "string" },
                legalRelevance: { type: "string" },
                exhibit: { type: "string" },
              },
              required: ["fact", "evidence", "effectOnAciah", "legalRelevance", "exhibit"],
            },
          },
        },
        required: ["heading", "paragraphs", "arguments"],
      },
    },
    cumulativeHardship: strArray,
    discretion: {
      type: "object",
      additionalProperties: false,
      properties: { favorable: strArray, unfavorable: strArray, response: strArray },
      required: ["favorable", "unfavorable", "response"],
    },
    redTeam: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          challenge: { type: "string" },
          weakness: { type: "string" },
          remedy: { type: "string" },
        },
        required: ["challenge", "weakness", "remedy"],
      },
    },
    missingEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          missing: { type: "string" },
          whyItMatters: { type: "string" },
          couldHelp: { type: "string" },
          priority: { type: "string", enum: ["critical", "useful"] },
        },
        required: ["missing", "whyItMatters", "couldHelp", "priority"],
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          statement: { type: "string" },
          sourceA: { type: "string" },
          sourceB: { type: "string" },
        },
        required: ["statement", "sourceA", "sourceB"],
      },
    },
    attorneyReview: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { issue: { type: "string" }, why: { type: "string" } },
        required: ["issue", "why"],
      },
    },
    unverified: strArray,
    conclusion: strArray,
  },
  required: [
    "caseSummary",
    "immigrationBackground",
    "grounds",
    "legalFramework",
    "qualifyingRelative",
    "sections",
    "cumulativeHardship",
    "discretion",
    "redTeam",
    "missingEvidence",
    "contradictions",
    "attorneyReview",
    "unverified",
    "conclusion",
  ],
};

function str(v: unknown) {
  return String(v ?? "").trim();
}
function list(v: unknown) {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}
function rows<T>(v: unknown, map: (r: Record<string, unknown>) => T, keep: (r: T) => boolean) {
  if (!Array.isArray(v)) return [];
  return v.map((r) => map((r ?? {}) as Record<string, unknown>)).filter(keep);
}

export const buildWaiverAnalysis = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      version: number;
      caseName: string;
      qualifyingRelative: string;
      applicant: string;
      child: string;
      separationStartDate: string;
      exhibits: WaiverExhibitInput[];
      events: WaiverEventInput[];
      finance: {
        documented: number;
        sentToAciah: number;
        jibril: number;
        medical: number;
        housing: number;
        immigration: number;
        currency: string;
      };
      openGaps: string[];
    }) => data,
  )
  .handler(async ({ data }): Promise<WaiverAnalysis> => {
    const { runJsonModel, jsonModelName } = await import("@/lib/ai-json.server");

    const exhibitLines = data.exhibits
      .slice(0, 400)
      .map(
        (e) =>
          `${e.number} | ${e.title} | ${e.date || "date not stated"} | ${e.sourceType || "source not stated"} | people: ${e.people.join(", ") || "not stated"} | categories: ${e.categories.join("; ") || "not stated"} | pages ${e.pages}${e.needsAttention ? " | STILL AWAITING HUMAN CONFIRMATION" : ""} | detail: ${(e.summary || "no summary on record").slice(0, 500)}${e.aciahImpact ? ` | recorded effect on ${data.qualifyingRelative}: ${e.aciahImpact.slice(0, 300)}` : ""}`,
      )
      .join("\n");

    const eventLines = data.events
      .slice(0, 300)
      .map(
        (ev) =>
          `${ev.date} | ${ev.title} | ${ev.categories.join("; ") || "no category"} | people: ${ev.people.join(", ") || "not stated"} | exhibits: ${ev.exhibits.join(", ") || "none linked"} | ${(ev.description || "").slice(0, 300)}${ev.effectOnAciah ? ` | effect on ${data.qualifyingRelative}: ${ev.effectOnAciah.slice(0, 300)}` : ""}`,
      )
      .join("\n");

    const f = data.finance;
    const money = (n: number) => `${f.currency} ${n.toFixed(2)}`;

    const prompt = `You are an advanced U.S. immigration waiver case-preparation assistant with specialist knowledge of Form I-601 waivers, extreme hardship, criminal inadmissibility, misrepresentation, consular processing and discretionary waiver analysis. You are preparing a personal I-601 submission analysis for the filer, working ONLY from the case records listed below.

CASE
Case: ${data.caseName}
Applicant (person who may need the waiver): ${data.applicant}
Qualifying relative: ${data.qualifyingRelative} (U.S. citizen spouse)
Child: ${data.child}
Family separation begins: ${data.separationStartDate}
Packet version: ${data.version}
Timeline events on record: ${data.events.length}
Exhibits on record: ${data.exhibits.length}
Documented separation costs since separation: ${money(f.documented)} (money sent to ${data.qualifyingRelative} ${money(f.sentToAciah)}; ${data.child} costs ${money(f.jibril)}; medical and pregnancy ${money(f.medical)}; housing and relocation ${money(f.housing)}; immigration and travel ${money(f.immigration)})
Items the filer has not yet confirmed or supplied: ${data.openGaps.slice(0, 60).join(" | ") || "none recorded"}

EXHIBITS (number | title | date | source | people | categories | pages | detail)
${exhibitLines || "No exhibits on record."}

TIMELINE EVENTS (date | title | categories | people | linked exhibits | description)
${eventLines || "No timeline events on record."}

HOW TO WORK
1. First understand the case. Identify the potential or confirmed inadmissibility ground(s), the waiver provision that may apply, the legally relevant qualifying relative, the extreme-hardship standard that applies, and any criminal or misrepresentation issue requiring analysis. If the records do not show a formal U.S. government determination, set status to "potential" (or "not_established") and never write about it as settled fact.
2. Keep ${data.qualifyingRelative} at the centre. For every piece of evidence — including anything about ${data.child}, other children, pregnancy, ${data.applicant}, finances, childcare, housing, safety, medical issues, mental health or separation — state the genuine, evidence-supported effect on ${data.qualifyingRelative}. Never merely describe another person's hardship.
3. Analyse separation (${data.qualifyingRelative} remains in the United States while ${data.applicant} cannot immigrate) and, where legally relevant, relocation (${data.qualifyingRelative} would have to leave the United States to keep the family together). Use only supported factors.
4. Analyse hardship cumulatively as well as individually: show how pregnancy, childcare, separation, financial pressure, mental-health evidence, loss of spousal support, uncertainty and earlier trauma interact, where the records support it.
5. Verify everything. Every important factual statement must be traceable to a listed exhibit, cited by its exhibit number. Prior AI summaries are not independent evidence. Never invent dates, quotations, medical conclusions, financial figures, government statements, criminal-history facts or legal citations, and never turn an assumption into a fact. Anything you cannot trace goes in "unverified" instead of the narrative.
6. Handle medical evidence carefully: distinguish diagnosis, symptoms, medication, treatment, patient-reported information and clinician observation. Do not assert that an event caused a medical deterioration unless the record says so.
7. Handle criminal and misrepresentation issues carefully. Do not assume inadmissibility. Analyse the actual facts, statute, sentence and government records available. For a possible misrepresentation, address the legally required elements rather than labelling an answer "fraud".
8. Do not hide negative information. Name it and address it in the strongest truthful way the evidence allows. Credibility matters more than appearance.
9. Analyse discretion separately from hardship: genuine favorable factors (rehabilitation, passage of time, stable employment, family responsibilities, community contributions, good conduct, family ties, changed circumstances) and genuine negative factors, honestly addressed.
10. Red-team the case before you finalise it: what would a USCIS or consular officer question, what is vague, unsupported, contradictory, overstated or understated, and is ${data.qualifyingRelative} clearly the focus. Put each finding in redTeam and improve the narrative only where genuine evidence allows.
11. List important missing evidence with what is missing, why it matters, what legitimate document could help, and whether it is critical or merely useful. Do not pad.
12. Where two records conflict, record the conflict in contradictions rather than silently choosing one. Where a serious legal question remains, record it in attorneyReview.

OUTPUT
- caseSummary, immigrationBackground, cumulativeHardship, conclusion: short paragraphs of plain, formal English.
- sections: the substantive body, adapted to this case — typically Qualifying Relative, Family Background, Extreme Hardship Overview, Separation Hardship, Relocation Hardship (if relevant), Medical / Psychological, Pregnancy / Childcare, Financial, Safety / Housing / Family Support, Rehabilitation and Positive Factors (if relevant). Omit any section this evidence cannot support. Each section carries paragraphs plus argument entries with fact, evidence, effectOnAciah, legalRelevance and exhibit (the exhibit number(s) exactly as listed above).
- Write factually and persuasively without drama. Avoid repeating "extreme", "devastating" or "catastrophic"; show hardship through facts and exhibit references.
- Every important sentence must be defensible from the listed records. If the evidence is weak, say what is missing instead of overstating it.`;

    const value = await runJsonModel({
      prompt,
      schema: SCHEMA,
      name: "i601_waiver_analysis",
      tier: "standard",
      requiredFields: ["caseSummary", "sections", "conclusion"],
    });

    const framework = (value["legalFramework"] ?? {}) as Record<string, unknown>;
    const qr = (value["qualifyingRelative"] ?? {}) as Record<string, unknown>;
    const disc = (value["discretion"] ?? {}) as Record<string, unknown>;

    return {
      caseSummary: list(value["caseSummary"]),
      immigrationBackground: list(value["immigrationBackground"]),
      grounds: rows(
        value["grounds"],
        (r) => ({
          ground: str(r["ground"]),
          status: str(r["status"]) || "potential",
          basis: str(r["basis"]),
          exhibits: list(r["exhibits"]),
        }),
        (r) => Boolean(r.ground),
      ),
      legalFramework: {
        provision: str(framework["provision"]),
        hardshipStandard: str(framework["hardshipStandard"]),
        notes: list(framework["notes"]),
      },
      qualifyingRelative: {
        name: str(qr["name"]) || data.qualifyingRelative,
        basis: str(qr["basis"]),
        exhibits: list(qr["exhibits"]),
      },
      sections: rows(
        value["sections"],
        (r) => ({
          heading: str(r["heading"]),
          paragraphs: list(r["paragraphs"]),
          arguments: rows(
            r["arguments"],
            (a) => ({
              fact: str(a["fact"]),
              evidence: str(a["evidence"]),
              effectOnAciah: str(a["effectOnAciah"]),
              legalRelevance: str(a["legalRelevance"]),
              exhibit: str(a["exhibit"]),
            }),
            (a) => Boolean(a.fact),
          ),
        }),
        (s) => Boolean(s.heading) && (s.paragraphs.length > 0 || s.arguments.length > 0),
      ),
      cumulativeHardship: list(value["cumulativeHardship"]),
      discretion: {
        favorable: list(disc["favorable"]),
        unfavorable: list(disc["unfavorable"]),
        response: list(disc["response"]),
      },
      redTeam: rows(
        value["redTeam"],
        (r) => ({
          challenge: str(r["challenge"]),
          weakness: str(r["weakness"]),
          remedy: str(r["remedy"]),
        }),
        (r) => Boolean(r.challenge),
      ),
      missingEvidence: rows(
        value["missingEvidence"],
        (r) => ({
          missing: str(r["missing"]),
          whyItMatters: str(r["whyItMatters"]),
          couldHelp: str(r["couldHelp"]),
          priority: str(r["priority"]) === "critical" ? "critical" : "useful",
        }),
        (r) => Boolean(r.missing),
      ),
      contradictions: rows(
        value["contradictions"],
        (r) => ({
          statement: str(r["statement"]),
          sourceA: str(r["sourceA"]),
          sourceB: str(r["sourceB"]),
        }),
        (r) => Boolean(r.statement),
      ),
      attorneyReview: rows(
        value["attorneyReview"],
        (r) => ({ issue: str(r["issue"]), why: str(r["why"]) }),
        (r) => Boolean(r.issue),
      ),
      unverified: list(value["unverified"]),
      conclusion: list(value["conclusion"]),
      model: jsonModelName("standard"),
      generatedAt: new Date().toISOString(),
    };
  });
