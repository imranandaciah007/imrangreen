/**
 * Turns a saved email (.eml) into a printable PDF: the From, To, Date and
 * Subject lines, the message text, and the names of any attachments.
 * Google Drive cannot print emails itself, so without this they would have no pages.
 */

interface ParsedPart {
  headers: Map<string, string>;
  body: string;
}

export interface ParsedEmail {
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  text: string;
  attachments: string[];
}

function latin1(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
}

/** Bytes held in a "binary string" (one char per byte) decoded with the stated character set. */
function decodeCharset(raw: string, charset: string) {
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0) & 0xff);
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function decodeQuotedPrintable(text: string) {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBase64(text: string) {
  try {
    return atob(text.replace(/[^A-Za-z0-9+/=]/g, ""));
  } catch {
    return "";
  }
}

/** Header words like =?UTF-8?B?...?= used for names and subjects in other languages. */
function decodeWords(value: string) {
  return value.replace(
    /=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi,
    (_, charset: string, kind: string, data: string) => {
      const raw =
        kind.toUpperCase() === "B"
          ? decodeBase64(data)
          : decodeQuotedPrintable(data.replace(/_/g, " "));
      return decodeCharset(raw, charset);
    },
  );
}

function splitPart(raw: string): ParsedPart {
  const cut = raw.search(/\r?\n\r?\n/);
  const head = cut >= 0 ? raw.slice(0, cut) : raw;
  const body = cut >= 0 ? raw.slice(cut).replace(/^\r?\n\r?\n/, "") : "";
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return { headers, body };
}

function param(header: string, name: string) {
  const match = new RegExp(`${name}\\*?=(?:"([^"]*)"|([^;\\s]*))`, "i").exec(header);
  return match ? (match[1] ?? match[2] ?? "") : "";
}

function stripHtml(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walk(part: ParsedPart, found: { plain: string[]; html: string[]; attachments: string[] }, depth = 0) {
  const type = part.headers.get("content-type") ?? "text/plain";
  const disposition = part.headers.get("content-disposition") ?? "";
  const encoding = (part.headers.get("content-transfer-encoding") ?? "").toLowerCase();
  const filename = decodeWords(param(disposition, "filename") || param(type, "name"));

  if (/^multipart\//i.test(type) && depth < 8) {
    const boundary = param(type, "boundary");
    if (!boundary) return;
    const pieces = part.body.split(`--${boundary}`);
    for (const piece of pieces.slice(1)) {
      if (piece.startsWith("--")) break;
      walk(splitPart(piece.replace(/^\r?\n/, "")), found, depth + 1);
    }
    return;
  }
  if (/^message\/rfc822/i.test(type) && depth < 8) {
    walk(splitPart(part.body), found, depth + 1);
    return;
  }
  if (filename || /attachment/i.test(disposition)) {
    found.attachments.push(filename || "unnamed attachment");
    return;
  }
  const raw =
    encoding === "base64"
      ? decodeBase64(part.body)
      : encoding === "quoted-printable"
        ? decodeQuotedPrintable(part.body)
        : part.body;
  const text = decodeCharset(raw, param(type, "charset"));
  if (/^text\/html/i.test(type)) found.html.push(stripHtml(text));
  else if (/^text\//i.test(type)) found.plain.push(text.trim());
}

export function parseEmail(bytes: Uint8Array): ParsedEmail {
  const top = splitPart(latin1(bytes));
  const found = { plain: [] as string[], html: [] as string[], attachments: [] as string[] };
  walk(top, found);
  // Raw header bytes are usually UTF-8; encoded words (=?...?=) are plain ASCII on top of that.
  const header = (name: string) => decodeWords(decodeCharset(top.headers.get(name) ?? "", "utf-8"));
  return {
    from: header("from"),
    to: header("to"),
    cc: header("cc"),
    date: header("date"),
    subject: header("subject"),
    text: (found.plain.join("\n\n") || found.html.join("\n\n")).trim(),
    attachments: found.attachments,
  };
}

/** The built-in PDF fonts only cover Western European letters. */
function printable(text: string) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\t/g, "    ")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

/** A plain A4 PDF of the email, ready to be embedded into its exhibit copy. */
export async function emailToPdf(bytes: Uint8Array, fileName: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const email = parseEmail(bytes);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 10;
  const lineH = 13.5;
  const left = 56;
  const maxW = 595.28 - left * 2;
  let page = doc.addPage([595.28, 841.89]);
  let y = 841.89 - 60;

  const wrap = (text: string, f: typeof font) => {
    const lines: string[] = [];
    for (const para of printable(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) <= maxW) {
          line = next;
          continue;
        }
        if (line) lines.push(line);
        // A single very long word (a link) is broken across lines.
        let rest = word;
        while (f.widthOfTextAtSize(rest, size) > maxW && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && f.widthOfTextAtSize(rest.slice(0, cut), size) > maxW) cut -= 1;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  };
  const write = (text: string, f = font) => {
    for (const line of wrap(text, f)) {
      if (y < 60) {
        page = doc.addPage([595.28, 841.89]);
        y = 841.89 - 60;
      }
      page.drawText(line, { x: left, y, size, font: f, color: rgb(0.1, 0.1, 0.12) });
      y -= lineH;
    }
  };

  write(`Email: ${email.subject || fileName}`, bold);
  y -= 4;
  if (email.from) write(`From: ${email.from}`);
  if (email.to) write(`To: ${email.to}`);
  if (email.cc) write(`Cc: ${email.cc}`);
  if (email.date) write(`Date: ${email.date}`);
  if (email.attachments.length) write(`Attachments: ${email.attachments.join(", ")}`);
  y -= 8;
  write(email.text || "(This email has no readable text.)");
  return await doc.save();
}
