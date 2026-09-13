/**
 * Independent second opinion on Gemini's reading of an evidence document.
 *
 * Gemini stays the primary reader. This module asks OpenAI to *check* what Gemini
 * already extracted. It is deliberately not allowed to supply missing facts: the
 * schema only lets it agree, disagree (quoting what the document actually shows),
 * or say it cannot tell from the material.
 *
 * Server-only. OPENAI_API_KEY is read inside the function and never returned.
 */

import { logAiUsage } from "./ai-json.server";
import {
  VERIFICATION_SCHEMA,
  type FieldVerdict,
  type VerificationReport,
  type VerificationState,
  type VerifiedField,
} from "./evidence/verification";

export type { FieldVerdict, VerificationReport, VerificationState, VerifiedField };

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

const SCHEMA = VERIFICATION_SCHEMA;


export function openAiConfigured() {
  return Boolean(process.env["OPENAI_API_KEY"]);
}

function stateFrom(fields: VerifiedField[], overall: string): VerificationState {
  if (fields.some((f) => f.verdict === "disagrees")) return "disagreement";
  if (overall === "insufficient_material") return "needs_human_review";
  if (fields.some((f) => f.verdict === "cannot_verify")) return "needs_human_review";
  return "verified";
}

export interface VerifyInput {
  /** What the primary model concluded, field -> value as a readable string. */
  claims: { field: string; value: string }[];
  summary: string;
  fileName: string;
  mimeType: string;
  /** Base64 of the document, when readable. */
  base64: string | null;
  analysisProvider: string;
  analysisModel: string;
  analysedAt: string;
  purpose?: string;
}

/**
 * Never throws: a verification outage must not fail the primary reading, and it must
 * never be reported as a successful double-check.
 */
export async function verifyWithOpenAi(input: VerifyInput): Promise<VerificationReport> {
  const base: VerificationReport = {
    state: "primary_only",
    fields: [],
    notes: [],
    analysisProvider: input.analysisProvider,
    analysisModel: input.analysisModel,
    analysedAt: input.analysedAt,
    verifierProvider: null,
    verifierModel: null,
    verifiedAt: null,
    error: null,
  };

  const key = process.env["OPENAI_API_KEY"];
  if (!key) {
    return {
      ...base,
      state: "unavailable",
      error: "Independent verification is not configured yet.",
    };
  }
  if (!input.claims.length) return base;

  const model = process.env["OPENAI_VERIFY_MODEL"] || DEFAULT_MODEL;
  const prompt = [
    "You are an independent checker for evidence indexed in a US I-601 extreme-hardship waiver case.",
    "Another model already read the material and produced the values below. Your ONLY job is to check them against the material.",
    "Rules you must follow exactly:",
    "- Never supply a missing fact, name, date or figure. If the material does not establish a value, answer cannot_verify.",
    "- Only answer disagrees when the material clearly states something different, and quote what it states in documentShows.",
    "- No legal argument, no case-outcome opinion, no speculation.",
    `File name: ${input.fileName}`,
    input.base64
      ? "The material is attached."
      : "The material itself is NOT available, so almost everything should be cannot_verify.",
    "Values to check:",
    ...input.claims.map((c) => `- ${c.field}: ${c.value || "(empty)"}`),
    input.summary ? `Primary model's summary: ${input.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const content: Record<string, unknown>[] = [{ type: "text", text: prompt }];
  if (input.base64) {
    if (input.mimeType.startsWith("image/")) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${input.mimeType};base64,${input.base64}` },
      });
    } else {
      content.push({
        type: "file",
        file: {
          filename: input.fileName,
          file_data: `data:${input.mimeType};base64,${input.base64}`,
        },
      });
    }
  }

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "evidence_verification", strict: true, schema: SCHEMA },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI verification failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("OpenAI verification returned an empty response.");
    const parsed = JSON.parse(text) as {
      fields?: unknown;
      notes?: unknown;
      overall?: unknown;
    };

    const allowed = new Set(input.claims.map((c) => c.field));
    const fields: VerifiedField[] = (Array.isArray(parsed.fields) ? parsed.fields : [])
      .map((raw) => {
        const f = (raw ?? {}) as Record<string, unknown>;
        const verdict = String(f["verdict"] ?? "cannot_verify");
        return {
          field: String(f["field"] ?? "").trim(),
          verdict: (["agrees", "disagrees", "cannot_verify"].includes(verdict)
            ? verdict
            : "cannot_verify") as FieldVerdict,
          documentShows: String(f["documentShows"] ?? "").trim(),
          note: String(f["note"] ?? "").trim(),
        };
      })
      .filter((f) => allowed.has(f.field));

    const notes = (Array.isArray(parsed.notes) ? parsed.notes : [])
      .map((n) => String(n).trim())
      .filter(Boolean)
      .slice(0, 8);

    await logAiUsage({
      provider: "openai",
      model,
      purpose: `${input.purpose ?? "evidence"}:verify`,
      ok: true,
      tokens: data.usage?.total_tokens ?? null,
    });

    return {
      ...base,
      state: stateFrom(fields, String(parsed.overall ?? "")),
      fields,
      notes,
      verifierProvider: "openai",
      verifierModel: model,
      verifiedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAiUsage({
      provider: "openai",
      model,
      purpose: `${input.purpose ?? "evidence"}:verify`,
      ok: false,
      error: message,
    });
    console.error("Independent verification unavailable:", message);
    return {
      ...base,
      state: "unavailable",
      verifierProvider: "openai",
      verifierModel: model,
      // Never leak key material or long upstream bodies to the client.
      error: "Independent verification was unavailable for this document.",
    };
  }
}
