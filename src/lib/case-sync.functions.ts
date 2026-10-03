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

/**
 * Save a shared value. When the device says which copy it started from (`base`),
 * only its own changes are merged into the latest shared copy, so edits made on
 * another device in the meantime are kept. Returns the merged value as JSON.
 */
export const pushStore = createServerFn({ method: "POST" })
  .inputValidator((d: { key: string; data: unknown; base?: unknown; merge?: boolean }) => {
    if (!d?.key || typeof d.key !== "string") throw new Error("Invalid key");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let value = data.data;
    if (data.merge) {
      const { mergeShared } = await import("@/lib/evidence/shared-merge");
      const { data: current, error: readError } = await supabaseAdmin
        .from("gc_case_store" as never)
        .select("data")
        .eq("key", data.key)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      value = mergeShared(data.base, data.data, (current as { data?: unknown } | null)?.data);
    }
    const { error } = await supabaseAdmin
      .from("gc_case_store" as never)
      .upsert({ key: data.key, data: value, updated_at: new Date().toISOString() } as never, {
        onConflict: "key",
      });
    if (error) throw new Error(error.message);
    return { json: JSON.stringify(value ?? null) };
  });
