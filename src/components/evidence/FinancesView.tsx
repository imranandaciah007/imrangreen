import { Coins, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";

const USD_TO_GBP = 0.79;

export function FinancesView({ onAddExpense }: { onAddExpense: () => void }) {
  const { finances, deleteFinance, caseSettings, stats } = useEvidence();
  const rows = [...finances].sort((a, b) => b.date.localeCompare(a.date));
  const gbp = (n: number) => `£${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const monthly = finances
    .filter((f) => f.recurring)
    .reduce((s, f) => s + (f.currency === "USD" ? f.amount * USD_TO_GBP : f.amount), 0);

  const byKind = new Map<string, number>();
  for (const f of finances) {
    const value = f.currency === "USD" ? f.amount * USD_TO_GBP : f.amount;
    byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + value);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Since {formatDate(caseSettings.separationStartDate)}
          </p>
          <p className="mt-1.5 font-mono text-2xl font-semibold">{gbp(stats.financialImpact)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Recurring monthly
          </p>
          <p className="mt-1.5 font-mono text-2xl font-semibold">{gbp(monthly)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Entries
          </p>
          <p className="mt-1.5 font-mono text-2xl font-semibold">{finances.length}</p>
        </div>
      </div>

      {byKind.size > 0 && (
        <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            By type
          </h2>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {[...byKind.entries()].map(([kind, total]) => (
              <li key={kind} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{kind}</span>
                <span className="font-mono text-muted-foreground">{gbp(total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card shadow-panel">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Financial burden
          </h2>
          <Button size="sm" className="h-9" onClick={onAddExpense}>
            <Coins className="size-4" /> Add expense
          </Button>
        </header>
        {rows.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">
            No costs recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {rows.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{f.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatDate(f.date)} · {f.kind}
                    {f.recurring ? " · monthly" : ""} · edited {formatDateTime(f.updatedAt)} by{" "}
                    {f.lastEditedBy}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold">
                  {f.currency === "GBP" ? "£" : "$"}
                  {f.amount.toLocaleString()}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-destructive"
                  aria-label="Delete expense"
                  onClick={() => deleteFinance(f.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
