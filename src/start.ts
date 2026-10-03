import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { signedOutWatcher } from "@/lib/signed-out";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Nothing in the case can be read or changed without signing in. Pages load
// as an empty shell; every server action and API route checks the login cookie.
const signInMiddleware = createMiddleware().server(async ({ request, pathname, handlerType, next }) => {
  const isApi = handlerType === "serverFn" || pathname.startsWith("/api/");
  if (!isApi) return next();
  const { isPublicPath, isSignedIn } = await import("./lib/auth.server");
  if (isPublicPath(pathname) || (await isSignedIn(request))) return next();
  return Response.json(
    { error: "Please sign in again." },
    { status: 401, headers: { "cache-control": "no-store", "x-gc-signed-out": "1" } },
  );
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, signedOutWatcher],
  requestMiddleware: [errorMiddleware, csrfMiddleware, signInMiddleware],
}));
