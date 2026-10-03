import { createFileRoute } from "@tanstack/react-router";

import {
  clearedSessionCookie,
  credentialsMatch,
  isSignedIn,
  sessionCookie,
} from "@/lib/auth.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      // Is this device signed in?
      GET: async ({ request }) => {
        return Response.json({ signedIn: await isSignedIn(request) }, { headers: noStore });
      },

      // Sign in.
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return Response.json({ error: "Sign-in must come from this app." }, { status: 403 });
        }

        let username = "";
        let password = "";
        try {
          const body = (await request.json()) as { username?: unknown; password?: unknown };
          username = typeof body.username === "string" ? body.username : "";
          password = typeof body.password === "string" ? body.password : "";
        } catch {
          return Response.json({ error: "Please enter your username and password." }, { status: 400 });
        }

        if (!credentialsMatch(username, password)) {
          // Slow down repeated guessing.
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return Response.json(
            { error: "That username or password is not right. Please try again." },
            { status: 401, headers: noStore },
          );
        }

        return Response.json(
          { signedIn: true },
          { headers: { ...noStore, "set-cookie": await sessionCookie(request) } },
        );
      },

      // Sign out.
      DELETE: async ({ request }) => {
        return Response.json(
          { signedIn: false },
          { headers: { ...noStore, "set-cookie": clearedSessionCookie(request) } },
        );
      },
    },
  },
});
