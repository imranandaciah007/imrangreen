/**
 * The finished filing packet: one continuously page-numbered set of PDFs built
 * from the untouched Drive originals.
 *
 * A packet of hundreds of documents is too large to assemble in one server
 * request, so it is built in parts (a few exhibits each) with page numbers that
 * carry on from part to part, then a front matter file (title page, cover
 * letter, table of contents with the real page numbers) is built last. Every
 * page carries the filing exhibit number and its packet page number, and each
 * file has bookmarks. Only filing numbers (Exhibit A-1) appear; the app's
 * working codes never do. Original files are never changed.
 */

import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";

const LETTER: [number, number] = [612, 792];
const PACKETS_ROOT = "I601 Evidence/Generated Case Packets";

export interface FilingExhibitInput {
  /** "Exhibit A-1" */
  number: string;
  tabLetter: string;
  tabTitle: string;
  title: string;
  date: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
}

export interface FilingPartResult {
  name: string;
  fileId: string;
  webViewLink: string;
  firstPage: number;
  lastPage: number;
  exhibits: {
    number: string;
    firstPage: number;
    lastPage: number;
    included: boolean;
    note?: string;
  }[];
}

/** The standard PDF fonts only cover Western European characters. */
function safe(text: string) {
  return text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, "?");
}

function wrapToWidth(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(text).split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function folderFor(version: number) {
  return `${PACKETS_ROOT}/Filing packet v${version}`;
}

async function fonts(doc: PDFDocument) {
  const { StandardFonts } = await import("pdf-lib");
  return {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    sans: await doc.embedFont(StandardFonts.Helvetica),
  };
}

/** Footer on every page: the exhibit (if any) and the packet page number. */
async function stamp(page: PDFPage, font: PDFFont, text: string) {
  const { rgb } = await import("pdf-lib");
  const { width } = page.getSize();
  const size = 8;
  const label = safe(text);
  const w = font.widthOfTextAtSize(label, size);
  const x = Math.max(8, width - w - 24);
  page.drawRectangle({
    x: x - 4,
    y: 10,
    width: w + 8,
    height: size + 6,
    color: rgb(1, 1, 1),
    opacity: 0.85,
  });
  page.drawText(label, { x, y: 13, size, font, color: rgb(0.1, 0.1, 0.15) });
}

/** Flat bookmark list shown in the PDF reader's side panel. */
async function addOutline(doc: PDFDocument, entries: { title: string; pageIndex: number }[]) {
  if (!entries.length) return;
  const { PDFName, PDFHexString } = await import("pdf-lib");
  const ctx = doc.context;
  const outlinesRef = ctx.nextRef();
  const refs = entries.map(() => ctx.nextRef());
  entries.forEach((entry, i) => {
    const page = doc.getPage(entry.pageIndex);
    const fields: Record<string, unknown> = {
      Title: PDFHexString.fromText(entry.title),
      Parent: outlinesRef,
      Dest: [page.ref, PDFName.of("XYZ"), null, null, null],
    };
    if (i > 0) fields["Prev"] = refs[i - 1];
    if (i < entries.length - 1) fields["Next"] = refs[i + 1];
    ctx.assign(refs[i]!, ctx.obj(fields as never));
  });
  ctx.assign(
    outlinesRef,
    ctx.obj({
      Type: "Outlines",
      First: refs[0]!,
      Last: refs[refs.length - 1]!,
      Count: entries.length,
    }),
  );
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

type Saver = (
  doc: PDFDocument,
  version: number,
  name: string,
) => Promise<{ fileId: string; webViewLink: string }>;

async function upload(doc: PDFDocument, version: number, name: string) {
  const drive = await import("./drive-core.server");
  const folderId = await drive.ensureFolder(folderFor(version));
  const file = await drive.uploadMultipart({
    name,
    mimeType: "application/pdf",
    parents: [folderId],
    base64: await doc.saveAsBase64(),
    description: `I-601 filing packet v${version}`,
  });
  return { fileId: file.id, webViewLink: file.webViewLink ?? "" };
}

/** One part of the packet: tab dividers, exhibit slip pages and the originals. */
export async function buildFilingPart(
  input: {
    version: number;
    name: string;
    startPage: number;
    exhibits: FilingExhibitInput[];
    /** Tabs whose divider page belongs at the start of their first exhibit in this part. */
    tabsStartingHere: string[];
  },
  save: Saver = upload,
): Promise<FilingPartResult> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const drive = await import("./drive-core.server");
  const doc = await PDFDocument.create();
  doc.setTitle(safe(input.name));
  doc.setProducer("GC Case Portal");
  const f = await fonts(doc);
  const outline: { title: string; pageIndex: number }[] = [];
  const results: FilingPartResult["exhibits"] = [];
  const pageLabels: string[] = [];

  const centred = (page: PDFPage, text: string, y: number, size: number, font: PDFFont) => {
    const label = safe(text);
    const w = font.widthOfTextAtSize(label, size);
    page.drawText(label, { x: (LETTER[0] - w) / 2, y, size, font, color: rgb(0.07, 0.09, 0.16) });
  };

  for (const exhibit of input.exhibits) {
    if (
      input.tabsStartingHere.includes(exhibit.tabLetter) &&
      !outline.some((o) => o.title.startsWith(`Tab ${exhibit.tabLetter} `))
    ) {
      const divider = doc.addPage(LETTER);
      centred(divider, `TAB ${exhibit.tabLetter}`, 470, 44, f.bold);
      for (const [i, line] of wrapToWidth(exhibit.tabTitle, f.regular, 20, 440).entries()) {
        centred(divider, line, 420 - i * 26, 20, f.regular);
      }
      outline.push({
        title: `Tab ${exhibit.tabLetter} - ${safe(exhibit.tabTitle)}`,
        pageIndex: doc.getPageCount() - 1,
      });
      pageLabels.push("");
    }

    // Slip page introducing the exhibit.
    const slip = doc.addPage(LETTER);
    const slipIndex = doc.getPageCount() - 1;
    outline.push({ title: `${exhibit.number} - ${safe(exhibit.title)}`, pageIndex: slipIndex });
    pageLabels.push(exhibit.number);
    centred(slip, exhibit.number.toUpperCase(), 500, 36, f.bold);
    let y = 450;
    for (const line of wrapToWidth(exhibit.title, f.regular, 16, 460)) {
      centred(slip, line, y, 16, f.regular);
      y -= 22;
    }
    if (exhibit.date) centred(slip, `Dated ${exhibit.date}`, y - 6, 12, f.regular);

    // The original, unchanged.
    let added = 0;
    let note: string | undefined;
    try {
      const source = exhibit.driveFileId
        ? await drive.fetchOriginalForEmbedding({
            fileId: exhibit.driveFileId,
            fileName: exhibit.fileName,
            mimeType: exhibit.mimeType,
          })
        : null;
      if (!source) {
        note = exhibit.driveFileId
          ? "This file type cannot be added automatically."
          : "No file is attached to this exhibit.";
      } else if (source.kind === "pdf") {
        const src = await PDFDocument.load(source.bytes, { ignoreEncryption: true });
        const copied = await doc.copyPages(src, src.getPageIndices());
        for (const p of copied) {
          doc.addPage(p);
          pageLabels.push(exhibit.number);
        }
        added = copied.length;
      } else {
        const image =
          source.kind === "png"
            ? await doc.embedPng(source.bytes)
            : await doc.embedJpg(source.bytes);
        const page = doc.addPage(LETTER);
        const scale = Math.min((LETTER[0] - 72) / image.width, (LETTER[1] - 90) / image.height, 1);
        page.drawImage(image, {
          x: (LETTER[0] - image.width * scale) / 2,
          y: (LETTER[1] - image.height * scale) / 2 + 9,
          width: image.width * scale,
          height: image.height * scale,
        });
        pageLabels.push(exhibit.number);
        added = 1;
      }
    } catch (error) {
      note = `The original could not be added automatically (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}).`;
    }
    if (!added) {
      const lines = wrapToWidth(
        `${note ?? ""} Print the original "${exhibit.fileName}" from Google Drive and insert it after this page.`,
        f.sans,
        11,
        440,
      );
      lines.forEach((line, i) => centred(slip, line, 300 - i * 16, 11, f.sans));
    }
    const first = input.startPage + slipIndex;
    results.push({
      number: exhibit.number,
      firstPage: first,
      lastPage: input.startPage + doc.getPageCount() - 1,
      included: added > 0,
      ...(note && !added ? { note } : {}),
    });
  }

  // Page numbers continue from the previous part.
  const pages = doc.getPages();
  for (const [i, page] of pages.entries()) {
    const label = pageLabels[i];
    await stamp(page, f.sans, `${label ? `${label} - ` : ""}Page ${input.startPage + i}`);
  }
  await addOutline(doc, outline);

  const saved = await save(doc, input.version, `${input.name}.pdf`);
  return {
    name: `${input.name}.pdf`,
    ...saved,
    firstPage: input.startPage,
    lastPage: input.startPage + pages.length - 1,
    exhibits: results,
  };
}

/** Title page, cover letter and table of contents, built once page numbers are known. */
export async function buildFilingFrontMatter(
  input: {
    version: number;
    name: string;
    caseName: string;
    applicant: string;
    qualifyingRelative: string;
    preparedOn: string;
    coverLetter: string[];
    tabs: {
      letter: string;
      title: string;
      exhibits: {
        number: string;
        title: string;
        date: string;
        firstPage: number;
        lastPage: number;
      }[];
    }[];
    parts: { name: string; firstPage: number; lastPage: number }[];
  },
  save: Saver = upload,
) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(safe(input.name));
  doc.setProducer("GC Case Portal");
  const f = await fonts(doc);
  const ink = rgb(0.07, 0.09, 0.16);
  const outline: { title: string; pageIndex: number }[] = [];
  const left = 72;
  const width = LETTER[0] - 144;

  // Title page.
  const title = doc.addPage(LETTER);
  outline.push({ title: "Title page", pageIndex: 0 });
  const centre = (page: PDFPage, text: string, y: number, size: number, font: PDFFont) => {
    const label = safe(text);
    page.drawText(label, {
      x: (LETTER[0] - font.widthOfTextAtSize(label, size)) / 2,
      y,
      size,
      font,
      color: ink,
    });
  };
  centre(title, "FORM I-601", 560, 30, f.bold);
  centre(title, "Application for Waiver of Grounds of Inadmissibility", 525, 15, f.regular);
  centre(title, "Supporting Evidence", 500, 15, f.regular);
  centre(title, `Applicant: ${input.applicant}`, 420, 13, f.regular);
  centre(title, `Qualifying relative: ${input.qualifyingRelative}`, 400, 13, f.regular);
  centre(title, `Prepared ${input.preparedOn}`, 360, 11, f.regular);

  // Running text pages with automatic page breaks.
  let page = title;
  let y = 0;
  const newPage = (heading: string) => {
    page = doc.addPage(LETTER);
    outline.push({ title: heading, pageIndex: doc.getPageCount() - 1 });
    page.drawText(safe(heading), {
      x: left,
      y: LETTER[1] - 80,
      size: 16,
      font: f.bold,
      color: ink,
    });
    y = LETTER[1] - 112;
  };
  const ensure = (needed: number) => {
    if (y - needed < 72) {
      page = doc.addPage(LETTER);
      y = LETTER[1] - 80;
    }
  };
  const write = (text: string, size: number, font: PDFFont, indent = 0, gapAfter = 6) => {
    for (const line of wrapToWidth(text, font, size, width - indent)) {
      ensure(size + 4);
      page.drawText(line, { x: left + indent, y, size, font, color: ink });
      y -= size + 4;
    }
    y -= gapAfter;
  };

  if (input.coverLetter.length) {
    newPage("Cover Letter");
    for (const paragraph of input.coverLetter) write(paragraph, 11.5, f.regular, 0, 8);
  }

  newPage("Table of Contents");
  if (input.parts.length > 1) {
    write(
      `This packet is in ${input.parts.length} files after this one. Page numbers run continuously through them:`,
      10,
      f.regular,
    );
    for (const part of input.parts) {
      write(`${part.name} - pages ${part.firstPage} to ${part.lastPage}`, 10, f.regular, 12, 0);
    }
    y -= 10;
  }
  for (const tab of input.tabs) {
    ensure(40);
    write(`Tab ${tab.letter}. ${tab.title}`, 12.5, f.bold, 0, 4);
    for (const ex of tab.exhibits) {
      const pages =
        ex.firstPage === ex.lastPage ? `${ex.firstPage}` : `${ex.firstPage}-${ex.lastPage}`;
      const pageLabel = `p. ${pages}`;
      const labelW = f.regular.widthOfTextAtSize(pageLabel, 10);
      const head = `${ex.number}  `;
      const lines = wrapToWidth(
        `${head}${ex.title}${ex.date ? ` (${ex.date})` : ""}`,
        f.regular,
        10,
        width - 70,
      );
      ensure(lines.length * 14);
      lines.forEach((line, i) => {
        page.drawText(line, { x: left + 12, y, size: 10, font: f.regular, color: ink });
        if (i === 0)
          page.drawText(pageLabel, {
            x: left + width - labelW,
            y,
            size: 10,
            font: f.regular,
            color: ink,
          });
        y -= 14;
      });
      y -= 2;
    }
    y -= 8;
  }

  const total = doc.getPageCount();
  for (const [i, p] of doc.getPages().entries()) {
    await stamp(p, f.sans, `Index page ${i + 1} of ${total}`);
  }
  await addOutline(doc, outline);
  const saved = await save(doc, input.version, `${input.name}.pdf`);
  return { name: `${input.name}.pdf`, ...saved, pageCount: total };
}
