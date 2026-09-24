import { createServerFn } from "@tanstack/react-start";

type Row = { id: string; data: unknown; deleted: boolean; updated_at: string };

/** Shared case data, so every device sees the same evidence and edits. */
export const pullCase = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const items: Row[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("gc_case_items" as never)
      .select("id,data,deleted,updated_at")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    items.push(...rows);
    if (rows.length < 1000) break;
  }
  const { data: store, error } = await supabaseAdmin
    .from("gc_case_store" as never)
    .select("key,data,updated_at");
  if (error) throw new Error(error.message);
  // Sent as one JSON string: records are free-form case data.
  return {
    json: JSON.stringify({
      items: items.map((r) => ({ id: r.id, deleted: r.deleted, data: r.data })),
      store: (store ?? []) as unknown as { key: string; data: unknown }[],
    }),
  };
});

export const pushItems = createServerFn({ method: "POST" })
  .inputValidator((d: { items: { id: string; data: Record<string, unknown> }[]; deletedIds?: string[] }) => {
    if (!Array.isArray(d?.items)) throw new Error("Invalid items");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const rows = [
      ...data.items.map((i) => ({ id: i.id, data: i.data, deleted: false, updated_at: now })),
      ...(data.deletedIds ?? []).map((id) => ({ id, data: {}, deleted: true, updated_at: now })),
    ];
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabaseAdmin
        .from("gc_case_items" as never)
        .upsert(rows.slice(i, i + 100) as never, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const pushStore = createServerFn({ method: "POST" })
  .inputValidator((d: { key: string; data: unknown }) => {
    if (!d?.key) throw new Error("Invalid key");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("gc_case_store" as never)
      .upsert({ key: data.key, data: data.data, updated_at: new Date().toISOString() } as never, {
        onConflict: "key",
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
