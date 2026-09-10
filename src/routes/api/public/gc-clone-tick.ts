import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled background run: mirror Drive, then build a bounded batch of
 * annotated clone PDFs. Called by the scheduler, so it works with the app closed.
 */
export const Route = createFileRoute("/api/public/gc-clone-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        let jobTokenOk = false;
        if (presented) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("gc_job_secret").select("token").eq("id", true).maybeSingle();
          jobTokenOk = Boolean(data?.token) && data!.token === presented;
        }
        if (!jobTokenOk) {
          const unauthorized = await authenticateCronRequest(request);
          if (unauthorized) return unauthorized;
        }

        let batch = 12;
        try {
          const body = (await request.json()) as { batch?: number };
          if (typeof body?.batch === "number") batch = Math.min(Math.max(body.batch, 1), 24);

        } catch {
          // no body — use the default batch size
        }

        try {
          const { runCloneTick } = await import("@/lib/jobs/clone-worker.server");
          const result = await runCloneTick(batch);
          return Response.json(result);
        } catch (error) {
          console.error(error);
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
