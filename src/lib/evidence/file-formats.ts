/**
 * One rule, shared by the app and the background copy maker, for which Drive
 * files are evidence. Everything you upload counts, whatever its format; only
 * folders, shortcuts, Google forms/sites and system leftovers are left out.
 * Formats that can't be printed (videos, voice notes, zip files) still get an
 * exhibit copy: a cover sheet that describes the file and links to the original.
 */

export type FormatKind =
  | "pdf"
  | "word"
  | "spreadsheet"
  | "slides"
  | "text"
  | "image"
  | "email"
  | "video"
  | "audio"
  | "archive"
  | "other";

const NOT_EVIDENCE_MIME =
  /^application\/vnd\.google-apps\.(folder|shortcut|form|site|map|fusiontable|script|jam|drive-sdk)/;

/** Files the computer or phone makes on its own, never something you meant to upload. */
const SYSTEM_JUNK =
  /^(\.ds_store|desktop\.ini|thumbs\.db|ehthumbs\.db|icon\r?)$|^~\$|^\._|\.(tmp|temp|crdownload|part|partial|download|lnk|url|webloc)$/i;

export function isEvidenceFile(name: string, mimeType: string): boolean {
  if (NOT_EVIDENCE_MIME.test(mimeType || "")) return false;
  return !SYSTEM_JUNK.test((name || "").trim());
}

function extOf(name: string) {
  const match = /\.([a-z0-9]{1,6})$/i.exec(name.trim());
  return match ? match[1]!.toLowerCase() : "";
}

export function formatKind(name: string, mimeType: string): FormatKind {
  const mime = (mimeType || "").toLowerCase();
  const ext = extOf(name);
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime === "message/rfc822" ||
    mime === "application/vnd.ms-outlook" ||
    ["eml", "msg", "emlx", "mbox"].includes(ext)
  )
    return "email";
  if (
    mime === "application/vnd.google-apps.document" ||
    /wordprocessingml|msword|ms-word|opendocument\.text|rtf/.test(mime) ||
    ["doc", "docx", "docm", "dot", "dotx", "odt", "rtf", "pages", "wpd"].includes(ext)
  )
    return "word";
  if (
    mime === "application/vnd.google-apps.spreadsheet" ||
    /spreadsheetml|ms-excel|opendocument\.spreadsheet|text\/csv|tab-separated/.test(mime) ||
    ["xls", "xlsx", "xlsm", "ods", "csv", "tsv", "numbers"].includes(ext)
  )
    return "spreadsheet";
  if (
    mime === "application/vnd.google-apps.presentation" ||
    /presentationml|ms-powerpoint|opendocument\.presentation/.test(mime) ||
    ["ppt", "pptx", "pps", "ppsx", "odp", "key"].includes(ext)
  )
    return "slides";
  if (
    mime.startsWith("image/") ||
    mime === "application/vnd.google-apps.drawing" ||
    mime === "application/vnd.google-apps.photo" ||
    ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "bmp", "tif", "tiff", "jfif", "avif", "dng"].includes(ext)
  )
    return "image";
  if (
    mime.startsWith("video/") ||
    mime === "application/vnd.google-apps.video" ||
    ["mp4", "mov", "m4v", "avi", "mkv", "webm", "3gp", "wmv"].includes(ext)
  )
    return "video";
  if (
    mime.startsWith("audio/") ||
    mime === "application/vnd.google-apps.audio" ||
    ["mp3", "m4a", "wav", "aac", "ogg", "opus", "amr", "flac", "wma"].includes(ext)
  )
    return "audio";
  if (/zip|rar|7z|tar|gzip/.test(mime) || ["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return "archive";
  if (mime.startsWith("text/") || ["txt", "md", "html", "htm", "json", "xml", "log"].includes(ext))
    return "text";
  return "other";
}

/** The Google format Drive can turn this file into, so it can be printed as a PDF. */
export function googleConversionTarget(name: string, mimeType: string): string | null {
  const ext = extOf(name);
  // Apple Pages/Numbers/Keynote and WordPerfect cannot be opened by Google Drive.
  if (["pages", "numbers", "key", "wpd"].includes(ext)) return null;
  switch (formatKind(name, mimeType)) {
    case "word":
    case "text":
      return "application/vnd.google-apps.document";
    case "spreadsheet":
      return "application/vnd.google-apps.spreadsheet";
    case "slides":
      return "application/vnd.google-apps.presentation";
    default:
      return null;
  }
}

/** The real file type for an upload, from its extension, when Drive only knows "some bytes". */
export function sourceMimeFor(name: string, mimeType: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const byExt: Record<string, string> = {
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docm: "application/vnd.ms-word.document.macroEnabled.12",
    dot: "application/msword",
    dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    txt: "text/plain",
    md: "text/plain",
    html: "text/html",
    htm: "text/html",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pps: "application/vnd.ms-powerpoint",
    ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
    odp: "application/vnd.oasis.opendocument.presentation",
  };
  return byExt[extOf(name)] ?? mimeType ?? "application/octet-stream";
}

/** A plain description used on cover sheets for files that cannot be printed. */
export function unprintableNote(name: string, mimeType: string): string {
  switch (formatKind(name, mimeType)) {
    case "video":
      return "This is a video recording, which cannot be shown on paper. The untouched original stays in Drive and is linked on this cover sheet.";
    case "audio":
      return "This is an audio recording, which cannot be shown on paper. The untouched original stays in Drive and is linked on this cover sheet.";
    case "archive":
      return "This is a compressed folder (zip). Its contents are not copied here; the untouched original stays in Drive and is linked on this cover sheet.";
    case "email":
      return "This email file could not be printed. The untouched original stays in Drive and is linked on this cover sheet.";
    default:
      return "This file type cannot be printed by Google Drive. The untouched original stays in Drive and is linked on this cover sheet.";
  }
}
