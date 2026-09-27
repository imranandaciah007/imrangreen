import { createFileRoute } from "@tanstack/react-router";

// Temporary one-off import; removed right after use.
export const Route = createFileRoute("/api/tmp-fin-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        
        const entries = await request.json();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("gc_case_store")
          .select("data")
          .eq("key", "records")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const data = row.data as Record<string, unknown>;
        const existing = (data.finances as { id: string }[]) ?? [];
        const ids = new Set(existing.map((e) => e.id));
        const finances = [...existing, ...entries.filter((e: { id: string }) => !ids.has(e.id))];
        const { error: e2 } = await supabaseAdmin
          .from("gc_case_store")
          .update({ data: { ...data, finances } as never, updated_at: new Date().toISOString() })
          .eq("key", "records");
        if (e2) return Response.json({ error: e2.message }, { status: 500 });
        return Response.json({ count: finances.length });
      },
    },
  },
});
