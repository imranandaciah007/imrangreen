/**
 * Client-side reader for the hardship diary PDF.
 *
 * The original file is only read — never modified or re-written. Text is extracted
 * page by page in the browser so the whole diary (hundreds of pages) can be analysed
 * in small chunks instead of being uploaded as one huge document.
 */

export interface DiaryPage {
  page: number;
  text: string;
}

export interface DiaryChunk {
  pageStart: number;
  pageEnd: number;
  text: string;
  hash: string;
}

/** Small stable fingerprint used to spot text that has already been imported. */
export function hashText(text: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619;
    h2 = (h2 + c * (i + 1)) >>> 0;
  }
  return `${(h1 >>> 0).toString(36)}${h2.toString(36)}`;
}

export async function readDiaryPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<DiaryPage[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: DiaryPage[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: n, text });
    onProgress?.(n, doc.numPages);
  }
  await doc.cleanup();
  return pages;
}

/** Group pages into chunks small enough for a careful two-pass read. */
export function chunkPages(pages: DiaryPage[], charBudget = 9000): DiaryChunk[] {
  const chunks: DiaryChunk[] = [];
  let buffer: DiaryPage[] = [];
  let size = 0;

  const flush = () => {
    const withText = buffer.filter((p) => p.text);
    if (withText.length) {
      const text = withText.map((p) => `[[page ${p.page}]] ${p.text}`).join("\n");
      chunks.push({
        pageStart: buffer[0]!.page,
        pageEnd: buffer[buffer.length - 1]!.page,
        text,
        hash: hashText(text),
      });
    }
    buffer = [];
    size = 0;
  };

  for (const page of pages) {
    buffer.push(page);
    size += page.text.length;
    if (size >= charBudget) flush();
  }
  flush();
  return chunks;
}
