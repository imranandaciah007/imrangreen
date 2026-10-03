import { createMiddleware } from "@tanstack/react-start";

/** Fired in the browser when the server says this device is no longer signed in. */
export const SIGNED_OUT_EVENT = "gc:signed-out";

/**
 * Watches every server action from the browser. If one fails because the login
 * has expired, the app returns to the sign-in screen instead of showing errors.
 */
export const signedOutWatcher = createMiddleware({ type: "function" }).client(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    const signedIn = await fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ signedIn?: boolean }>)
      .then((b) => b.signedIn === true)
      .catch(() => true);
    if (!signedIn) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    throw error;
  }
});
