import { createServerFn } from "@tanstack/react-start";

export interface AiUsageSummary {
  geminiConfigured: boolean;
  /** Successful Gemini reads in the last 24 hours / 30 days. */
  geminiToday: number;
  geminiMonth: number;
  geminiTokensMonth: number;
  /** Reads that had to use the paid built-in reader instead. */
  fallbackMonth: number;
  /** Latest Gemini failure, if any (quota, rate limit, key problem). */
  lastError: string | null;
  lastErrorAt: string | null;
  /** True when the newest Gemini failure looks like an exhausted quota/credit. */
  outOfCredit: boolean;
  lastCallAt: string | null;
}

export const getAiUsage = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiUsageSummary> => {
    const empty: AiUsageSummary = {
      geminiConfigured: Boolean(process.env["GEMINI_API_KEY"]),
      geminiToday: 0,
      geminiMonth: 0,
      geminiTokensMonth: 0,
      fallbackMonth: 0,
      lastError: null,
      lastErrorAt: null,
      outOfCredit: false,
      lastCallAt: null,
    };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from("gc_ai_usage")
        .select("created_at, provider, ok, tokens, error, status_code")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error || !data) return empty;

      const dayAgo = Date.now() - 24 * 3600 * 1000;
      let geminiToday = 0;
      let geminiMonth = 0;
      let tokens = 0;
      let fallbackMonth = 0;
      let lastError: string | null = null;
      let lastErrorAt: string | null = null;
      for (const row of data as {
        created_at: string;
        provider: string;
        ok: boolean;
        tokens: number | null;
        error: string | null;
        status_code: number | null;
      }[]) {
        const at = new Date(row.created_at).getTime();
        if (row.provider === "gemini") {
          if (row.ok) {
            geminiMonth += 1;
            tokens += row.tokens ?? 0;
            if (at >= dayAgo) geminiToday += 1;
          } else if (!lastError) {
            lastError = row.error;
            lastErrorAt = row.created_at;
          }
        } else if ((row.provider === "openai" || row.provider === "lovable") && row.ok) {
          fallbackMonth += 1;
        }
      }
      const outOfCredit = Boolean(
        lastError && /quota|exceeded|billing|credit|RESOURCE_EXHAUSTED|\[429\]/i.test(lastError),
      );
      return {
        ...empty,
        geminiToday,
        geminiMonth,
        geminiTokensMonth: tokens,
        fallbackMonth,
        lastError,
        lastErrorAt,
        outOfCredit,
        lastCallAt: (data[0] as { created_at?: string } | undefined)?.created_at ?? null,
      };
    } catch {
      return empty;
    }
  },
);
