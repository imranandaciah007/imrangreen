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
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function runGemini(req: JsonModelRequest, key: string) {
  const parts: Record<string, unknown>[] = [{ text: req.prompt }];
  if (req.file?.base64) {
    parts.push({ inlineData: { mimeType: req.file.mimeType, data: req.file.base64 } });
  }
  const res = await fetch(GEMINI_URL, {
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
  };
  let text = "";
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    if (part.text) text += part.text;
  }
  if (!text.trim()) throw new Error("Gemini returned an empty response.");
  return JSON.parse(text) as Record<string, unknown>;
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
export function jsonModelName() {
  return process.env["GEMINI_API_KEY"] ? `google/${GEMINI_MODEL}` : GATEWAY_MODEL;
}

export async function runJsonModel(req: JsonModelRequest): Promise<Record<string, unknown>> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (geminiKey) {
    try {
      return await runGemini(req, geminiKey);
    } catch (err) {
      if (!lovableKey) throw err;
      console.error("Gemini read failed, falling back to built-in AI:", err);
    }
  }
  if (!lovableKey) throw new Error("AI is not configured for this project.");
  return runGateway(req, lovableKey);
}
