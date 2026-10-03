// Server-only sign-in for the case portal.
//
// One shared login protects every server action. The username and password are
// checked here on the server and never shipped to the browser. A correct login
// sets a signed, httpOnly cookie; every later request is checked against it.

const COOKIE_NAME = "gc_session";
const SESSION_DAYS = 90;

// Defaults requested by the case owners. Set APP_LOGIN_USERNAME and
// APP_LOGIN_PASSWORD in the project secrets to change them without a code edit.
const DEFAULT_LOGIN = "IMRANI601";

function expectedUsername() {
  return (process.env["APP_LOGIN_USERNAME"] || DEFAULT_LOGIN).trim().toUpperCase();
}

function expectedPassword() {
  return process.env["APP_LOGIN_PASSWORD"] || DEFAULT_LOGIN;
}

function signingSecret(): string {
  const secret = process.env["APP_SESSION_SECRET"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!secret) throw new Error("The sign-in system is not configured on the server.");
  return `gc-session-v1:${secret}`;
}

const encoder = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings without leaking where they first differ. */
function sameText(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export function credentialsMatch(username: string, password: string): boolean {
  // Username ignores case and stray spaces; the password must match exactly.
  const userOk = sameText(username.trim().toUpperCase(), expectedUsername());
  const passOk = sameText(password, expectedPassword());
  return userOk && passOk;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function isSignedIn(request: Request): Promise<boolean> {
  const value = readCookie(request, COOKIE_NAME);
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature) return false;
  if (!(Number(expires) > Date.now())) return false;
  try {
    return sameText(signature, await hmac(`session:${expires}`));
  } catch {
    return false;
  }
}

function cookieAttributes(request: Request, maxAgeSeconds: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export async function sessionCookie(request: Request): Promise<string> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const expires = Date.now() + maxAge * 1000;
  const signature = await hmac(`session:${expires}`);
  return `${COOKIE_NAME}=${expires}.${signature}; ${cookieAttributes(request, maxAge)}`;
}

export function clearedSessionCookie(request: Request): string {
  return `${COOKIE_NAME}=; ${cookieAttributes(request, 0)}`;
}

/** Paths that must work without a login: the sign-in endpoint and the scheduled jobs, which carry their own secret. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/public/");
}
