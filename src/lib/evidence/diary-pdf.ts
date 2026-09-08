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

export class PdfReaderInitializationError extends Error {
  constructor(message = "The PDF reader could not start after three attempts.") {
    super(message);
    this.name = "PdfReaderInitializationError";
  }
}

const READER_ATTEMPTS = 3;

/**
 * Older iPhone/iPad browsers are missing a few newer JavaScript helpers the PDF
 * reader expects. Adding them before the reader loads keeps the diary readable
 * on phones as well as desktops.
 */
function installPdfCompatibility() {
  const P = Promise as unknown as {
    withResolvers?: () => { promise: Promise<unknown>; resolve: unknown; reject: unknown };
  };
  if (typeof P.withResolvers !== "function") {
    P.withResolvers = function withResolvers() {
      let resolve!: (value?: unknown) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise((res, rej) => {
        resolve = res as typeof resolve;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
  const O = Object as unknown as { groupBy?: unknown };
  if (typeof O.groupBy !== "function") {
    O.groupBy = function groupBy<T>(items: Iterable<T>, keyOf: (item: T, index: number) => string) {
      const out: Record<string, T[]> = Object.create(null);
      let i = 0;
      for (const item of items) {
        const key = String(keyOf(item, i));
        (out[key] ??= []).push(item);
        i += 1;
      }
      return out;
    };
  }

  const globalWithClone = globalThis as typeof globalThis & {
    structuredClone?: <T>(value: T, options?: { transfer?: Transferable[] }) => T;
  };
  if (typeof globalWithClone.structuredClone !== "function") {
    globalWithClone.structuredClone = function structuredCloneFallback<T>(value: T): T {
      const seen = new Map<object, unknown>();
      const clone = (input: unknown): unknown => {
        if (input === null || typeof input !== "object") return input;
        if (seen.has(input)) return seen.get(input);
        if (input instanceof ArrayBuffer) return input.slice(0);
        if (ArrayBuffer.isView(input)) {
          const view = input as ArrayBufferView;
          const bytes = new Uint8Array(view.byteLength);
          bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
          const copied = bytes.buffer;
          if (input instanceof DataView) return new DataView(copied);
          const Constructor = input.constructor as new (buffer: ArrayBuffer) => unknown;
          return new Constructor(copied);
        }
        if (input instanceof Date) return new Date(input.getTime());
        if (input instanceof Map) {
          const output = new Map();
          seen.set(input, output);
          input.forEach((v, k) => output.set(clone(k), clone(v)));
          return output;
        }
        if (input instanceof Set) {
          const output = new Set();
          seen.set(input, output);
          input.forEach((v) => output.add(clone(v)));
          return output;
        }
        const output: unknown[] | Record<string, unknown> = Array.isArray(input) ? [] : {};
        seen.set(input, output);
        for (const key of Object.keys(input)) {
          (output as Record<string, unknown>)[key] = clone((input as Record<string, unknown>)[key]);
        }
        return output;
      };
      return clone(value) as T;
    };
  }

  const signal = AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal;
  };
  if (typeof signal.any !== "function") {
    signal.any = (signals) => {
      const controller = new AbortController();
      const abort = (event: Event) =>
        controller.abort((event.target as AbortSignal | null)?.reason);
      for (const source of signals) {
        if (source.aborted) {
          controller.abort(source.reason);
          break;
        }
        source.addEventListener("abort", abort, { once: true });
      }
      return controller.signal;
    };
  }
}

async function initialisePdfReader(onRetry?: (attempt: number, total: number) => void) {
  let lastError: unknown;
  installPdfCompatibility();

  for (let attempt = 1; attempt <= READER_ATTEMPTS; attempt += 1) {
    try {
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist/legacy/build/pdf.mjs"),
        import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
      ]);
      const workerSrc = (worker as { default?: string }).default;
      if (typeof pdfjs.getDocument !== "function" || !workerSrc) {
        throw new Error("The PDF reader did not load correctly.");
      }
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    } catch (error) {
      lastError = error;
      if (attempt < READER_ATTEMPTS) {
        onRetry?.(attempt + 1, READER_ATTEMPTS);
        await new Promise((resolve) => window.setTimeout(resolve, attempt * 600));
      }
    }
  }

  console.error("PDF reader initialization failed", lastError);
  throw new PdfReaderInitializationError();
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
  onReaderRetry?: (attempt: number, total: number) => void,
): Promise<DiaryPage[]> {
  const buffer = await file.arrayBuffer();
  let lastError: unknown;

  for (let attempt = 1; attempt <= READER_ATTEMPTS; attempt += 1) {
    let doc: Awaited<ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]>["promise"]> | null = null;
    try {
      const pdfjs = await initialisePdfReader(onReaderRetry);
      // pdf.js may transfer/detach its input, so every retry needs a fresh copy.
      doc = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
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
        page.cleanup();
      }

      // Some Safari/pdf.js worker combinations never settle this cleanup promise.
      // Cleanup remains best-effort and must not prevent the completed import advancing.
      void Promise.resolve(doc.cleanup()).catch(() => undefined);
      return pages;
    } catch (error) {
      lastError = error;
      if (attempt < READER_ATTEMPTS) {
        onReaderRetry?.(attempt + 1, READER_ATTEMPTS);
        await new Promise((resolve) => window.setTimeout(resolve, attempt * 600));
      }
    }
  }

  console.error("PDF document reading failed", lastError);
  const detail = lastError instanceof Error ? lastError.message : "Unknown PDF reader error";
  throw new PdfReaderInitializationError(
    `The PDF could not be read after three attempts. ${detail}`,
  );
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
