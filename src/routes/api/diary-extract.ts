import { createFileRoute } from "@tanstack/react-router";

import { chunkPages, type DiaryPage } from "@/lib/evidence/diary-pdf";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 500;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/diary-extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const origin = request.headers.get("origin");
        if (origin && origin !== requestUrl.origin) {
          return jsonError("The diary upload was rejected because it did not come from this app.", 403);
        }

        const declaredSize = Number(request.headers.get("content-length") ?? 0);
        if (declaredSize > MAX_PDF_BYTES + 1024 * 1024) {
          return jsonError("The diary PDF is larger than the 20 MB upload limit.", 413);
        }

        try {
          const form = await request.formData();
          const value = form.get("file");
          if (!(value instanceof File)) return jsonError("No PDF was received.", 400);
          if (value.size === 0) return jsonError("The selected PDF is empty.", 400);
          if (value.size > MAX_PDF_BYTES) {
            return jsonError("The diary PDF is larger than the 20 MB upload limit.", 413);
          }

          const bytes = new Uint8Array(await value.arrayBuffer());
          const signature = new TextDecoder("ascii").decode(bytes.subarray(0, 5));
          if (signature !== "%PDF-") return jsonError("The selected file is not a valid PDF.", 415);

          // Imported inside the handler so the parser and PDF bytes remain server-only.
          const { getDocumentProxy } = await import("unpdf");
          const pdf = await getDocumentProxy(bytes);
          if (pdf.numPages > MAX_PAGES) {
            await pdf.cleanup();
            return jsonError(`This PDF has ${pdf.numPages} pages; the import limit is ${MAX_PAGES}.`, 413);
          }

          const pages: DiaryPage[] = [];
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            const text = content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            pages.push({ page: pageNumber, text });
            page.cleanup();
          }
          await pdf.cleanup();

          const chunks = chunkPages(pages);
          if (chunks.length === 0) {
            return jsonError(
              "No readable text was found in this PDF. It may contain only scanned images.",
              422,
            );
          }

          return Response.json(
            { pageCount: pages.length, chunks },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("Hardship diary server extraction failed", error);
          const detail = error instanceof Error ? error.message : "Unknown extraction error";
          return jsonError(`The server could not extract this PDF: ${detail}`, 500);
        }
      },
    },
  },
});