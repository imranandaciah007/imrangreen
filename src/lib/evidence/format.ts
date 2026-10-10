export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

/**
 * Reads a stored date. A plain day such as "2026-08-18" is that calendar day
 * wherever the phone is; letting the browser read it as UK midnight would show
 * the day before on a phone in the United States.
 */
export function parseDay(iso: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  return new Date(iso);
}

/** Today's date on this phone, as YYYY-MM-DD (not the UK date). */
export function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = parseDay(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
