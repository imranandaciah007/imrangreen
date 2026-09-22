/**
 * One place that talks to a model and returns strict JSON.
 *
 * Reading is done with the case owner's own Gemini key (GEMINI_API_KEY). If Gemini is
 * unavailable or fails, the case owner's own OpenAI key (OPENAI_API_KEY) is used as the
 * backup. No other AI service is ever used for reading or writing case material.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = process.env["OPENAI_READ_MODEL"] || "gpt-4.1-mini";
/** Everyday reading (interactive uploads, diary, questions). */
const GEMINI_MODEL = "gemini-3.6-flash";
/** Bulk background reading of hundreds of Drive files — cheapest capable model. */
const GEMINI_BULK_MODEL = "gemini-3.1-flash-lite";
/** Second attempt for anything the cheap read left blank — stronger, still free. */
const GEMINI_GAPFILL_MODEL = "gemini-3.8-flash";

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

/** Which reader answered — useful for audit trails. */
export function jsonModelName(tier: "bulk" | "standard" = "standard") {
  if (!geminiKeys().length) return `openai/${OPENAI_MODEL}`;
  return `google/${tier === "bulk" ? GEMINI_BULK_MODEL : GEMINI_MODEL}`;
}

export function geminiConfigured() {
  return geminiKeys().length > 0;
}



/** Rate limits and brief upstream blips are retried; wrong requests are not. */
function retryable(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /\[(429|500|502|503|504)\]/.test(msg) || /fetch failed|network/i.test(msg);
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


export async function runJsonModel(req: JsonModelRequest): Promise<Record<string, unknown>> {
  const keys = geminiKeys();
  const openAiKey = process.env["OPENAI_API_KEY"];
  const allowFallback = req.allowFallback !== false;
  const geminiModel = req.tier === "bulk" ? GEMINI_BULK_MODEL : GEMINI_MODEL;
  let lastErr: unknown = null;

  for (const { label, key } of keys) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const out = await runGemini(req, key);
        await logAiUsage({
          provider: label,
          model: out.model,
          purpose: req.name,
          ok: true,
          tokens: out.tokens,
        });
        return await topUp(req, out.value, key, label);
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
        if (!retryable(err) || attempt === 2) break;
        await sleep(1200 * (attempt + 1) + Math.floor(Math.random() * 400));
      }
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
    return out.value;
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


