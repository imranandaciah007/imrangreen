import { createFileRoute } from "@tanstack/react-router";

/** Temporary internal check: stream one generated clone PDF for visual QA. */
export const Route = createFileRoute("/api/public/gc-clone-peek")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const presented = (request.headers.get("authorization") ?? "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: secret } = await supabaseAdmin
          .from("gc_job_secret")
          .select("token")
          .eq("id", true)
          .maybeSingle();
        if (!presented || presented !== secret?.token) return new Response("Unauthorized", { status: 401 });

        const fileId = new URL(request.url).searchParams.get("id");
        if (!fileId) return new Response("Missing id", { status: 400 });
        const { fetchDriveBytes } = await import("@/lib/drive-core.server");
        const bytes = await fetchDriveBytes(fileId);
        return new Response(bytes.slice().buffer as ArrayBuffer, {
          headers: { "content-type": "application/pdf" },
        });
      },
    },
  },
});
