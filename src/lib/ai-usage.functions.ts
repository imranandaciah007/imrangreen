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
  /** Claude writes the final packet when the Anthropic key is set. */
  claudeConfigured: boolean;
  /** Packet sections Claude wrote in the last 30 days. */
  claudeMonth: number;
  /** Latest Claude failure that has not been followed by a success. */
  claudeLastError: string | null;
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
      claudeConfigured: Boolean(process.env["ANTHROPIC_API_KEY"]),
      claudeMonth: 0,
      claudeLastError: null,
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
      let lastOkAt: number | null = null;
      let claudeMonth = 0;
      let claudeLastError: string | null = null;
      let claudeSeenOk = false;
      for (const row of data as {
        created_at: string;
        provider: string;
        ok: boolean;
        tokens: number | null;
        error: string | null;
        status_code: number | null;
      }[]) {
        const at = new Date(row.created_at).getTime();
        if (row.provider === "gemini" || row.provider === "gemini-2") {
          if (row.ok) {
            if (lastOkAt === null || at > lastOkAt) lastOkAt = at;
            geminiMonth += 1;
            tokens += row.tokens ?? 0;
            if (at >= dayAgo) geminiToday += 1;
          } else if (!lastError) {
            lastError = row.error;
            lastErrorAt = row.created_at;
          }
        } else if (row.provider === "claude") {
          // Rows are newest first: an error only counts if no later success.
          if (row.ok) {
            claudeMonth += 1;
            claudeSeenOk = true;
          } else if (!claudeSeenOk && !claudeLastError) {
            claudeLastError = row.error;
          }
        } else if ((row.provider === "openai" || row.provider === "lovable") && row.ok) {
          fallbackMonth += 1;
        }
      }
      // A successful read after a failure means the limit is no longer hit —
      // never keep showing a stale quota warning.
      if (lastOkAt !== null && lastErrorAt && new Date(lastErrorAt).getTime() < lastOkAt) {
        lastError = null;
        lastErrorAt = null;
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
        claudeMonth,
        claudeLastError,
      };
    } catch {
      return empty;
    }
  },
);
