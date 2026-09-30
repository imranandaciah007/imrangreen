import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Reads a batch of the case's financial documents and reports the payments each
 * one actually shows. Nothing is written to the case here — the caller decides
 * what to keep, so a bad read can never damage the ledger.
 *
 * Every figure comes with the words on the page that prove it. A payment with no
 * quotable line is not reported at all.
 */

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    payments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          label: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string" },
          merchant: { type: "string" },
          purpose: { type: "string" },
          quote: { type: "string" },
          isCost: { type: "boolean" },
        },
        required: ["date", "label", "amount", "currency", "merchant", "purpose", "quote", "isCost"],
      },
    },
  },
  required: ["payments"],
};

const PROMPT = `You are reading one supporting document from an I-601 waiver case file for Imran and Aciah.

List every individual money amount the document itself states as paid, charged, invoiced or billed.

Strict rules:
- Take the date and the amount only from the document. Never estimate, convert, total or infer.
- "date" must be ISO yyyy-mm-dd. If the document does not state a date for that payment, return an empty string.
- "currency" must be exactly GBP or USD, based on the symbol or code printed on the page.
- "quote" must be the exact words from the page that show this amount. If you cannot quote it, do not list it.
- "isCost" is true for money paid out or owed, false for money received.
- Return an empty list if the document states no amounts.`;

export const Route = createFileRoute("/api/public/gc-finance-rebuild")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const presented = (request.headers.get("authorization") ?? "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        let jobTokenOk = false;
        if (presented) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("gc_job_secret")
            .select("token")
            .eq("id", true)
            .maybeSingle();
          jobTokenOk = Boolean(data?.token) && data!.token === presented;
        }
        if (!jobTokenOk) {
          const unauthorized = await authenticateCronRequest(request);
          if (unauthorized) return unauthorized;
        }

        type Ask = { fileId: string; mimeType?: string; fileName?: string };
        let files: Ask[] = [];
        try {
          const body = (await request.json()) as { files?: Ask[]; fileIds?: string[] };
          files = body?.files?.length
            ? body.files.slice(0, 8)
            : (body?.fileIds ?? []).slice(0, 8).map((fileId) => ({ fileId }));
        } catch {
          /* handled below */
        }
        if (!files.length) return Response.json({ ok: false, error: "No documents given." }, { status: 400 });

        const { fetchDriveBytes, fetchOriginalForEmbedding } = await import("@/lib/drive-core.server");
        const { runJsonModel } = await import("@/lib/ai-json.server");

        const results: Record<string, unknown>[] = [];
        for (const ask of files) {
          const { fileId } = ask;
          try {
            const mime = ask.mimeType ?? "application/pdf";
            let bytes: Uint8Array;
            let sendMime = mime;
            if (mime === "application/pdf") {
              bytes = await fetchDriveBytes(fileId);
            } else {
              // Word docs, spreadsheets, photos and Google files are fetched in a
              // form the reader accepts.
              const converted = await fetchOriginalForEmbedding({
                fileId,
                mimeType: mime,
                fileName: ask.fileName ?? fileId,
              });
              if (!converted) throw new Error("This document type cannot be read.");
              bytes = converted.bytes;
              sendMime =
                converted.kind === "pdf"
                  ? "application/pdf"
                  : converted.kind === "png"
                    ? "image/png"
                    : "image/jpeg";
            }
            let binary = "";
            for (const byte of bytes) binary += String.fromCharCode(byte);
            const base64 = btoa(binary);
            const out = await runJsonModel({
              prompt: PROMPT,
              schema: SCHEMA,
              name: "finance_rebuild",
              tier: "bulk",
              allowFallback: false,
              file: { fileName: ask.fileName ?? fileId, mimeType: sendMime, base64 },
            });
            results.push({ fileId, ok: true, payments: out["payments"] ?? [] });
          } catch (error) {
            results.push({
              fileId,
              ok: false,
              error: error instanceof Error ? error.message.slice(0, 200) : String(error),
            });
          }
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});
