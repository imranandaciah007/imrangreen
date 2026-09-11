/**
 * One place that talks to a model and returns strict JSON.
 *
 * When a Google AI Studio key (GEMINI_API_KEY) is configured it is used first, because the
 * case owner supplied it. If it is missing, or the call fails, we fall back to the built-in
 * Lovable AI gateway so nothing in the app stops working.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const GATEWAY_MODEL = "openai/gpt-6-astra";
/** Everyday reading (interactive uploads, diary, questions). */
const GEMINI_MODEL = "gemini-3.6-flash";
/** Bulk background reading of hundreds of Drive files — cheapest capable model. */
const GEMINI_BULK_MODEL = "gemini-3.1-flash-lite";
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
async function logUsage(entry: {
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

async function runGateway(req: JsonModelRequest, key: string) {
  const content: Record<string, unknown>[] = [{ type: "input_text", text: req.prompt }];
  if (req.file?.base64) {
    if (req.file.mimeType.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: `data:${req.file.mimeType};base64,${req.file.base64}`,
      });
    } else {
      content.push({
        type: "input_file",
        filename: req.file.fileName,
        file_data: `data:${req.file.mimeType};base64,${req.file.base64}`,
      });
    }
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: GATEWAY_MODEL,
      reasoning: { effort: "low" },
      input: [{ role: "user", content }],
      text: {
        format: { type: "json_schema", name: req.name, strict: true, schema: req.schema },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    output?: { content?: { type?: string; text?: string }[] }[];
    output_text?: string;
  };
  let text = data.output_text ?? "";
  if (!text) {
    for (const part of data.output ?? []) {
      for (const c of part.content ?? []) if (c.type === "output_text" && c.text) text += c.text;
    }
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** Which reader answered — useful for audit trails. */
export function jsonModelName(tier: "bulk" | "standard" = "standard") {
  if (!process.env["GEMINI_API_KEY"]) return GATEWAY_MODEL;
  return `google/${tier === "bulk" ? GEMINI_BULK_MODEL : GEMINI_MODEL}`;
}

export function geminiConfigured() {
  return Boolean(process.env["GEMINI_API_KEY"]);
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
    await logUsage({
      provider: "gemini",
      model: retry.model,
      purpose: `${req.name}:fill-gaps`,
      ok: true,
      tokens: retry.tokens,
    });
    return merged;
  } catch (err) {
    await logUsage({
      provider: "gemini",
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
  const geminiKey = process.env["GEMINI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const allowFallback = req.allowFallback !== false;
  const geminiModel = req.tier === "bulk" ? GEMINI_BULK_MODEL : GEMINI_MODEL;
  if (geminiKey) {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const out = await runGemini(req, geminiKey);
        await logUsage({
          provider: "gemini",
          model: out.model,
          purpose: req.name,
          ok: true,
          tokens: out.tokens,
        });
        return await topUp(req, out.value, lovableKey, allowFallback);
      } catch (err) {
        lastErr = err;
        await logUsage({
          provider: "gemini",
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
    if (!allowFallback || !lovableKey) throw lastErr;
    console.error("Gemini read failed, falling back to built-in AI:", lastErr);
  }
  if (!lovableKey) throw new Error("AI is not configured for this project.");
  try {
    const value = await runGateway(req, lovableKey);
    await logUsage({ provider: "lovable", model: GATEWAY_MODEL, purpose: req.name, ok: true });
    return value;
  } catch (err) {
    await logUsage({
      provider: "lovable",
      model: GATEWAY_MODEL,
      purpose: req.name,
      ok: false,
      statusCode: statusFrom(err),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
