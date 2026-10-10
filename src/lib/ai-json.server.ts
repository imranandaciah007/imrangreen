/**
 * One place that talks to a model and returns strict JSON.
 *
 * Reading is done with the case owner's own Gemini key (GEMINI_API_KEY). If Gemini is
 * unavailable or fails, the case owner's own OpenAI key (OPENAI_API_KEY) is used as the
 * backup. Final-packet writing (cover letter, exhibit index wording, waiver analysis)
 * asks for `writer: "claude"` and is written by Claude with the case owner's own
 * Anthropic key (ANTHROPIC_API_KEY); without that key, or if Claude fails, it falls
 * back to the readers above.
 */

import Anthropic from "@anthropic-ai/sdk";

/** Final-packet writer. */
const CLAUDE_MODEL = "claude-opus-5-5";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = process.env["OPENAI_READ_MODEL"] || "gpt-4.1-mini";
/** Free first-choice readers: OpenRouter, then Pollinations, before Gemini/ChatGPT. */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env["OPENROUTER_MODEL"] || "google/gemini-2.0-flash-exp:free";
const POLLINATIONS_URL = "https://text.pollinations.ai/openai";
const POLLINATIONS_MODEL = process.env["POLLINATIONS_MODEL"] || "openai";
/** Everyday reading (interactive uploads, diary, questions). */
const GEMINI_MODEL = "gemini-3.6-flash";
/** Bulk background reading of hundreds of Drive files — cheapest capable model. */
const GEMINI_BULK_MODEL = "gemini-3.1-flash-lite";
/** Second attempt for anything the cheap read left blank — stronger, still free. */
const GEMINI_GAPFILL_MODEL = "gemini-3.8-flash";
/** Free-tier workhorse tried when the newer models' daily allowance is used up. */
const GEMINI_FREE_MODEL = "gemini-3.5-flash-lite";


const geminiUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;


export interface JsonModelFile {
  fileName: string;
  mimeType: string;
  /** Base64 of the file bytes, or null when only the file name is known. */
  base64: string | null;
}

export interface JsonModelRequest {
  prompt: string;
  schema: unknown;
  /** Schema name used by the gateway path. */
  name: string;
  file?: JsonModelFile | null;
  /** "bulk" uses the cheapest Gemini model; "standard" is the default reader. */
  tier?: "bulk" | "standard";
  /**
   * Background/bulk work sets this to false so a Gemini outage never quietly
   * spends Lovable AI credits on hundreds of documents.
   */
  allowFallback?: boolean;
  /**
   * Fields that must come back filled. When the free Gemini read leaves any of
   * them empty, the paid built-in reader is asked once for the same document and
   * only the still-missing fields are merged in (Gemini's answers always win).
   */
  requiredFields?: string[];
  /**
   * Allows the gap-filling top-up above even when a full paid fallback is off
   * (background reading of hundreds of files).
   */
  allowGapFill?: boolean;
  /** "claude" asks Claude to write this (final packet wording). */
  writer?: "claude";
}

/** Key under which runJsonModel records which model actually wrote the answer. */
export const WRITTEN_BY = "__writtenBy";

/** The model that wrote a runJsonModel answer, for audit trails. */
export function writtenBy(value: Record<string, unknown>, fallback: string): string {
  const v = value[WRITTEN_BY];
  return typeof v === "string" && v ? v : fallback;
}

export function claudeConfigured() {
  return Boolean(process.env["ANTHROPIC_API_KEY"]);
}

/**
 * Claude's structured output accepts a subset of JSON Schema: every object must
 * say additionalProperties: false, and numeric/length limits are not allowed.
 */
function claudeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(claudeSchema);
  if (!node || typeof node !== "object") return node;
  const drop = new Set(["minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "pattern", "$schema", "strict"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (drop.has(k)) continue;
    out[k] =
      k === "properties" && v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, claudeSchema(pv)]),
          )
        : claudeSchema(v);
  }
  if (out["type"] === "object") out["additionalProperties"] = false;
  return out;
}

async function runClaude(req: JsonModelRequest, apiKey: string) {
  const client = new Anthropic({ apiKey });
  // Streamed because packet wording can be long; finalMessage() collects it.
  const stream = client.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: claudeSchema(req.schema) as Record<string, unknown> },
    },
    // If a safety check declines the request, the API retries on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: req.prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error("Claude declined to write this section.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude's answer was too long and was cut off.");
  }
  let text = "";
  for (const block of message.content) {
    if (block.type === "text") text += block.text;
  }
  if (!text.trim()) throw new Error("Claude returned an empty response.");
  const usage = message.usage;
  return {
    value: JSON.parse(text) as Record<string, unknown>,
    tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    model: message.model,
  };
}

/** Empty string, empty list, or nothing at all. */
function blank(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Records every model call so the app can show honest usage figures. */
export async function logAiUsage(entry: {
  provider: string;
  model: string;
  purpose?: string | undefined;
  ok: boolean;
  statusCode?: number | null;
  tokens?: number | null;
  error?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("gc_ai_usage").insert({
      provider: entry.provider,
      model: entry.model,
      purpose: entry.purpose ?? null,
      ok: entry.ok,
      status_code: entry.statusCode ?? null,
      tokens: entry.tokens ?? null,
      error: entry.error ? entry.error.slice(0, 300) : null,
    });
  } catch {
    /* usage tracking must never break a real read */
  }
}

function statusFrom(err: unknown) {
  const m = /\[(\d{3})\]/.exec(err instanceof Error ? err.message : String(err));
  return m ? Number(m[1]) : null;
}

/** Gemini accepts a subset of JSON Schema — drop the keywords it rejects. */
function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "additionalProperties" || k === "strict" || k === "$schema") continue;
    out[k] = k === "properties" && v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, geminiSchema(pv)]),
        )
      : geminiSchema(v);
  }
  return out;
}

async function runGemini(req: JsonModelRequest, key: string, modelOverride?: string) {
  const parts: Record<string, unknown>[] = [{ text: req.prompt }];
  if (req.file?.base64) {
    parts.push({ inlineData: { mimeType: req.file.mimeType, data: req.file.base64 } });
  }
  const model = modelOverride ?? (req.tier === "bulk" ? GEMINI_BULK_MODEL : GEMINI_MODEL);

  const res = await fetch(geminiUrl(model), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiSchema(req.schema),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed [${res.status}]: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { totalTokenCount?: number };
  };
  let text = "";
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    if (part.text) text += part.text;
  }
  if (!text.trim()) throw new Error("Gemini returned an empty response.");
  return {
    value: JSON.parse(text) as Record<string, unknown>,
    tokens: data.usageMetadata?.totalTokenCount ?? null,
    model,
  };
}

async function runOpenAi(req: JsonModelRequest, key: string) {
  const content: Record<string, unknown>[] = [{ type: "text", text: req.prompt }];
  if (req.file?.base64) {
    if (req.file.mimeType.startsWith("image/")) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${req.file.mimeType};base64,${req.file.base64}` },
      });
    } else {
      content.push({
        type: "file",
        file: {
          filename: req.file.fileName,
          file_data: `data:${req.file.mimeType};base64,${req.file.base64}`,
        },
      });
    }
  }
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content }],
      response_format: {
        type: "json_schema",
        json_schema: { name: req.name, strict: true, schema: req.schema },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI request failed [${res.status}]: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("OpenAI returned an empty response.");
  return {
    value: JSON.parse(text) as Record<string, unknown>,
    tokens: data.usage?.total_tokens ?? null,
  };
}

/** OpenAI-compatible free readers (OpenRouter, Pollinations) share this shape. */
async function runOpenAiCompatible(
  req: JsonModelRequest,
  key: string,
  url: string,
  model: string,
  label: string,
) {
  const content: Record<string, unknown>[] = [{ type: "text", text: req.prompt }];
  if (req.file?.base64 && req.file.mimeType.startsWith("image/")) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${req.file.mimeType};base64,${req.file.base64}` },
    });
  } else if (req.file?.base64) {
    content.push({
      type: "file",
      file: {
        filename: req.file.fileName,
        file_data: `data:${req.file.mimeType};base64,${req.file.base64}`,
      },
    });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} request failed [${res.status}]: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${label} returned an empty response.`);
  return { value: JSON.parse(text) as Record<string, unknown>, tokens: data.usage?.total_tokens ?? null };
}

/**
 * Gemini keys in the order they are tried: the second key first, then the
 * original one. Whichever still has allowance answers.
 */
function geminiKeys(): { label: string; key: string }[] {
  const out: { label: string; key: string }[] = [];
  const second = process.env["GEMINI_API_KEY_2"];
  const first = process.env["GEMINI_API_KEY"];
  if (second) out.push({ label: "gemini-2", key: second });
  if (first) out.push({ label: "gemini", key: first });
  return out;
}

/** Which reader answers first — useful for audit trails. */
export function jsonModelName(tier: "bulk" | "standard" = "standard") {
  if (process.env["OPENROUTER_API_KEY"]) return `openrouter/${OPENROUTER_MODEL}`;
  if (process.env["POLLINATIONS_API_KEY"]) return `pollinations/${POLLINATIONS_MODEL}`;
  if (!geminiKeys().length) return `openai/${OPENAI_MODEL}`;
  return `google/${tier === "bulk" ? GEMINI_BULK_MODEL : GEMINI_MODEL}`;
}

/** True when any reader key exists (OpenRouter, Pollinations, or Gemini). */
export function geminiConfigured() {
  return (
    geminiKeys().length > 0 ||
    Boolean(process.env["OPENROUTER_API_KEY"]) ||
    Boolean(process.env["POLLINATIONS_API_KEY"]) ||
    Boolean(process.env["GROQ_API_KEY"])
  );
}



/** Rate limits and brief upstream blips are retried; wrong requests are not. */
function retryable(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /\[(429|500|502|503|504)\]/.test(msg) || /fetch failed|network/i.test(msg);
}

/** True when the provider said the account is out of allowance, not merely busy. */
function outOfAllowance(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /insufficient_quota|credit_balance_exhausted|no credits remaining|exceeded your current quota|billing/i.test(
    msg,
  );
}

/**
 * Turns raw provider failures into one sentence the case owner can act on, so a
 * read that cannot happen reports the reason instead of blanking the screen.
 */
function readingUnavailableMessage(geminiErr: unknown, openAiErr: unknown) {
  const geminiSpent = outOfAllowance(geminiErr);
  const chatGptSpent = outOfAllowance(openAiErr);
  if (geminiSpent && chatGptSpent) {
    return "Reading is paused: both your Gemini allowance and your ChatGPT credit are used up. Top up either one and try this document again — nothing was changed.";
  }
  if (chatGptSpent) {
    return "Reading is paused: Gemini could not read this document and your ChatGPT credit is used up. Top up ChatGPT or wait for the Gemini allowance to reset, then try again — nothing was changed.";
  }
  const detail = openAiErr instanceof Error ? openAiErr.message : String(openAiErr);
  return `This document could not be read just now. ${detail.slice(0, 200)}`;
}

/**
 * Blanks left by the first Gemini read are retried once with a stronger Gemini
 * model. Nothing is ever sent to the paid built-in reader for gap-filling, so
 * exhibits build on the free key only. Anything still blank stays blank and shows
 * up in "Needs your attention" for a human to fill.
 */
async function topUp(
  req: JsonModelRequest,
  value: Record<string, unknown>,
  geminiKey: string,
  providerLabel: string,
): Promise<Record<string, unknown>> {
  const wanted = req.requiredFields ?? [];
  if (!wanted.length) return value;
  const missing = wanted.filter((field) => blank(value[field]));
  if (!missing.length) return value;
  try {
    const retry = await runGemini(
      {
        ...req,
        prompt: `${req.prompt}\n\nA first reading of this material could not establish: ${missing.join(", ")}. Establish only those, strictly from the material itself. Leave anything the material does not show empty rather than guessing.`,
      },
      geminiKey,
      GEMINI_GAPFILL_MODEL,
    );
    const merged = { ...value };
    for (const field of missing) if (!blank(retry.value[field])) merged[field] = retry.value[field];
    await logAiUsage({
      provider: providerLabel,
      model: retry.model,
      purpose: `${req.name}:fill-gaps`,
      ok: true,
      tokens: retry.tokens,
    });
    return merged;
  } catch (err) {
    await logAiUsage({
      provider: providerLabel,
      model: GEMINI_GAPFILL_MODEL,
      purpose: `${req.name}:fill-gaps`,
      ok: false,
      statusCode: statusFrom(err),
      error: err instanceof Error ? err.message : String(err),
    });
    return value;
  }
}


/**
 * Models tried for one key, in order. If the first model's free daily allowance is
 * used up, the lighter free-tier models are tried next — each one has its own
 * allowance, so reading usually keeps working without any top-up.
 */
function modelLadder(tier: "bulk" | "standard" | undefined) {
  const first = tier === "bulk" ? GEMINI_BULK_MODEL : GEMINI_MODEL;
  const ladder = [first, GEMINI_BULK_MODEL, GEMINI_FREE_MODEL, GEMINI_GAPFILL_MODEL];
  return ladder.filter((m, i) => ladder.indexOf(m) === i);
}

/**
 * Free first-choice readers, tried before Gemini: OpenRouter, then Pollinations.
 * Pollinations is text-only, so it is skipped when a file is attached.
 */
async function runFreeReaders(req: JsonModelRequest): Promise<Record<string, unknown> | null> {
  const candidates: { label: string; key: string | undefined; url: string; model: string; files: boolean }[] = [
    {
      label: "openrouter",
      key: process.env["OPENROUTER_API_KEY"],
      url: OPENROUTER_URL,
      model: OPENROUTER_MODEL,
      files: true,
    },
    {
      label: "pollinations",
      key: process.env["POLLINATIONS_API_KEY"],
      url: POLLINATIONS_URL,
      model: POLLINATIONS_MODEL,
      files: false,
    },
    {
      label: "groq",
      key: process.env["GROQ_API_KEY"],
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env["GROQ_MODEL"] || "openai/gpt-oss-120b",
      files: false,
    },
  ];
  const jsonReq = { ...req, prompt: `${req.prompt}\n\nAnswer with JSON only.` };
  for (const c of candidates) {
    if (!c.key) continue;
    if (!c.files && req.file?.base64) continue;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const out = await runOpenAiCompatible(jsonReq, c.key, c.url, c.model, c.label);
        await logAiUsage({ provider: c.label, model: c.model, purpose: req.name, ok: true, tokens: out.tokens });
        return { ...out.value, [WRITTEN_BY]: `${c.label}/${c.model}` };
      } catch (err) {
        await logAiUsage({
          provider: c.label,
          model: c.model,
          purpose: req.name,
          ok: false,
          statusCode: statusFrom(err),
          error: err instanceof Error ? err.message : String(err),
        });
        if (outOfAllowance(err) || !retryable(err) || attempt === 2) break;
        await sleep(1200 * (attempt + 1) + Math.floor(Math.random() * 400));
      }
    }
  }
  return null;
}

export async function runJsonModel(req: JsonModelRequest): Promise<Record<string, unknown>> {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  if (req.writer === "claude" && anthropicKey) {
    try {
      const out = await runClaude(req, anthropicKey);
      await logAiUsage({
        provider: "claude",
        model: out.model,
        purpose: req.name,
        ok: true,
        tokens: out.tokens,
      });
      return { ...out.value, [WRITTEN_BY]: `anthropic/${out.model}` };
    } catch (err) {
      await logAiUsage({
        provider: "claude",
        model: CLAUDE_MODEL,
        purpose: req.name,
        ok: false,
        statusCode: err instanceof Anthropic.APIError ? (err.status ?? null) : statusFrom(err),
        error: err instanceof Error ? err.message : String(err),
      });
      console.error("Claude could not write this; falling back to the usual readers:", err);
    }
  }
  const keys = geminiKeys();
  const openAiKey = process.env["OPENAI_API_KEY"];
  const allowFallback = req.allowFallback !== false;
  const ladder = modelLadder(req.tier);
  let lastErr: unknown = null;

  const free = await runFreeReaders(req);
  if (free) return free;

  for (const { label, key } of keys) {
    for (const geminiModel of ladder) {
      let exhausted = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const out = await runGemini(req, key, geminiModel);
          await logAiUsage({
            provider: label,
            model: out.model,
            purpose: req.name,
            ok: true,
            tokens: out.tokens,
          });
          return { ...(await topUp(req, out.value, key, label)), [WRITTEN_BY]: `google/${out.model}` };
        } catch (err) {
          lastErr = err;
          await logAiUsage({
            provider: label,
            model: geminiModel,
            purpose: req.name,
            ok: false,
            statusCode: statusFrom(err),
            error: err instanceof Error ? err.message : String(err),
          });
          // Daily allowance gone for this model: move to the next free-tier model
          // straight away instead of burning retries on it.
          if (outOfAllowance(err) || /\[404\]/.test(String(err))) {
            exhausted = true;
            break;
          }
          // Model busy or rate-limited even after retries: another model usually
          // answers straight away, so move down the ladder instead of giving up.
          if (attempt === 2 && /\[(429|503)\]/.test(String(err))) {
            exhausted = true;
            break;
          }
          if (!retryable(err) || attempt === 2) break;
          await sleep(1200 * (attempt + 1) + Math.floor(Math.random() * 400));
        }
      }
      // A plain failure (bad request, unreadable file) is not fixed by another model.
      if (!exhausted) break;
    }
    console.error(`Gemini key ${label} could not read this material:`, lastErr);
  }


  if (keys.length && (!allowFallback || !openAiKey)) throw lastErr;
  if (keys.length) console.error("Both Gemini keys failed, falling back to ChatGPT:", lastErr);

  if (!openAiKey) {
    throw new Error(
      "No AI key is configured. Add your Gemini key (and optionally your ChatGPT key) in project settings.",
    );
  }
  try {
    const out = await runOpenAi(req, openAiKey);
    await logAiUsage({
      provider: "openai",
      model: OPENAI_MODEL,
      purpose: req.name,
      ok: true,
      tokens: out.tokens,
    });
    return { ...out.value, [WRITTEN_BY]: `openai/${OPENAI_MODEL}` };
  } catch (err) {
    await logAiUsage({
      provider: "openai",
      model: OPENAI_MODEL,
      purpose: req.name,
      ok: false,
      statusCode: statusFrom(err),
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(readingUnavailableMessage(lastErr, err));
  }
}


