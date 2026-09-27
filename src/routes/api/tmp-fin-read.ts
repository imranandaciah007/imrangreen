import { createFileRoute } from "@tanstack/react-router";

// Temporary one-off: read financial PDFs with the user's own Gemini keys. Removed after use.
const CATS = ["Money sent by Imran to Aciah","Jibril — formula/milk","Jibril — nappies/wipes","Jibril — baby food","Jibril — clothing","Jibril — medicines/medical","Jibril — equipment/baby supplies","Jibril — childcare","Jibril — transport","Aciah — medical","Aciah — medication","Aciah — pregnancy related","Aciah — appointment transport","Housing / household contribution","Relocation / re-establishment in U.S.","Immigration fees","Separation-related travel","UK fixed obligations","Communication / postage / document costs","Other genuine separation-related expense","NOT A COST"];
const KINDS = ["Travel / Flights","Legal fees","Medical costs","Housing / Rent","Childcare","Lost income","Communication","Other"];
const S = (extra: object = {}) => ({ type: "STRING", ...extra });
const schema = {
  type: "OBJECT",
  properties: {
    entries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: S(), label: S(), amount: { type: "NUMBER" }, currency: S({ enum: ["GBP", "USD"] }),
          expenseCategory: S({ enum: CATS }), kind: S({ enum: KINDS }),
          payer: S({ enum: ["Imran", "Aciah"] }),
          beneficiary: S({ enum: ["Aciah", "Jibril", "Family", "Immigration", "Other"] }),
          merchant: S(), purpose: S(), quote: S(),
        },
        required: ["date","label","amount","currency","expenseCategory","kind","payer","beneficiary","merchant","purpose","quote"],
      },
    },
  },
  required: ["entries"],
};
const PROMPT = `You read one financial document for an I-601 hardship case (Imran lives in the UK; wife Aciah and baby Jibril live in the US).
List every payment/cost actually shown in the document with its exact date (YYYY-MM-DD), exact amount and currency as printed.
For a bank statement list only transfers to Aciah and costs related to the family, separation, travel, Jibril, medical, immigration or UK fixed bills (mortgage payment, council tax, utilities, broadband).
Use "NOT A COST" for income, refunds, balances, loan totals, quotes and estimates. Never invent or estimate a figure; if unreadable, return no entries.
"quote" = the exact text on the page showing the amount. Only GBP or USD.`;

async function read(base64: string, mimeType: string) {
  const keys = [process.env["GEMINI_API_KEY_2"], process.env["GEMINI_API_KEY"]].filter(Boolean) as string[];
  let last = "";
  for (const model of ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]) {
    for (const key of keys) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: PROMPT }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
          }),
        },
      );
      if (res.ok) {
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"entries":[]}';
        return { model, entries: (JSON.parse(text) as { entries: unknown[] }).entries };
      }
      last = `${model} ${res.status}`;
    }
  }
  throw new Error(last);
}

export const Route = createFileRoute("/api/tmp-fin-read")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { fetchDriveBytes } = await import("@/lib/drive-core.server");
        const docs = (await request.json()) as { id: string; driveFileId: string; mimeType: string }[];
        const results = await Promise.all(
          docs.map(async (d) => {
            try {
              const bytes = await fetchDriveBytes(d.driveFileId);
              if (bytes.length > 18_000_000) return { id: d.id, error: "too large" };
              const base64 = Buffer.from(bytes).toString("base64");
              const mime = d.mimeType?.startsWith("image/") ? d.mimeType : "application/pdf";
              return { id: d.id, ...(await read(base64, mime)) };
            } catch (e) {
              return { id: d.id, error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
            }
          }),
        );
        return Response.json(results);
      },
      PUT: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const entries = (await request.json()) as { id: string }[];
        const { data: row } = await supabaseAdmin.from("gc_case_store").select("data").eq("key", "records").single();
        const rec = (row?.data ?? {}) as { finances?: { id: string; createdBy?: string }[] };
        const kept = (rec.finances ?? []).filter((f) => f.createdBy !== "Gemini");
        const next = { ...rec, finances: [...kept, ...entries] };
        const { error } = await supabaseAdmin.from("gc_case_store").upsert({ key: "records", data: next as never, updated_at: new Date().toISOString() });
        return Response.json({ error: error?.message ?? null, total: next.finances.length });
      },
    },
  },
});

