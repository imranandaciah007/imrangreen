import { useMemo, useState } from "react";
import { Coins, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EvidencePicker, LinkedEvidenceChips } from "@/components/evidence/EvidencePicker";
import { formatDate, formatDateTime } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { cn } from "@/lib/utils";

const USD_TO_GBP = 0.79;
const gbpOf = (amount: number, currency: string) =>
  currency === "USD" ? amount * USD_TO_GBP : amount;
const gbp = (n: number) => `£${Math.round(n).toLocaleString()}`;

export function FinancesView({ onAddExpense }: { onAddExpense: () => void }) {
  const { finances, updateFinance, deleteFinance, caseSettings } = useEvidence();
  const separation = caseSettings.separationStartDate;
  const [range, setRange] = useState<"since" | "all">("since");
  const [linkFor, setLinkFor] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      [...finances]
        .filter((f) => (range === "since" ? f.date >= separation : true))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [finances, range, separation],
  );

  const total = rows.reduce((s, f) => s + gbpOf(f.amount, f.currency), 0);
  const monthly = rows
    .filter((f) => f.recurring)
    .reduce((s, f) => s + gbpOf(f.amount, f.currency), 0);
  const missingEvidence = rows.filter((f) => (f.evidenceIds ?? []).length === 0).length;

  const byKind = new Map<string, number>();
  for (const f of rows) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + gbpOf(f.amount, f.currency));

  const byMonth = new Map<string, { total: number; count: number; missing: number }>();
  for (const f of rows) {
    const key = f.date.slice(0, 7);
    const row = byMonth.get(key) ?? { total: 0, count: 0, missing: 0 };
    row.total += gbpOf(f.amount, f.currency);
    row.count += 1;
    if ((f.evidenceIds ?? []).length === 0) row.missing += 1;
    byMonth.set(key, row);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const linkTarget = finances.find((f) => f.id === linkFor) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["since", `Since ${formatDate(separation)}`],
            ["all", "All records"],
          ] as ["since" | "all", string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setRange(id)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-[11px]",
              range === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Documented burden", value: gbp(total) },
          { label: "Recurring monthly", value: gbp(monthly) },
          { label: "Entries", value: String(rows.length) },
          { label: "Missing receipts", value: String(missingEvidence) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {m.label}
            </p>
            <p className="mt-1.5 font-mono text-2xl font-semibold">{m.value}</p>
          </div>
        ))}
      </div>

      {months.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Month by month
          </h2>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {months.map(([month, row]) => (
              <li
                key={month}
                className="flex items-baseline justify-between gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-xs"
              >
                <span className="font-medium text-foreground">
                  {new Date(`${month}-01`).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {row.count} entries
                  {row.missing > 0 ? ` · ${row.missing} missing receipt` : ""}
                </span>
                <span className="font-mono text-sm font-semibold">{gbp(row.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {byKind.size > 0 && (
        <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            By type
          </h2>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {[...byKind.entries()].map(([kind, sum]) => (
              <li key={kind} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{kind}</span>
                <span className="font-mono text-muted-foreground">{gbp(sum)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card shadow-panel">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Financial entries
          </h2>
          <Button size="sm" className="h-9" onClick={onAddExpense}>
            <Coins className="size-4" /> Add expense
          </Button>
        </header>
        {rows.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">
            No costs recorded in this view yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {rows.map((f) => (
              <li key={f.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{f.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatDate(f.date)} · {f.kind}
                    {f.recurring ? " · monthly" : ""} · edited {formatDateTime(f.updatedAt)} by{" "}
                    {f.lastEditedBy}
                  </p>
                  <LinkedEvidenceChips ids={f.evidenceIds ?? []} onEdit={() => setLinkFor(f.id)} />
                </div>
                <div className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold">
                    {f.currency === "GBP" ? "£" : "$"}
                    {f.amount.toLocaleString()}
                  </span>
                  {f.currency === "USD" && (
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      ≈ {gbp(gbpOf(f.amount, f.currency))}
                    </span>
                  )}
                </div>
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

      <EvidencePicker
        open={linkFor !== null}
        onOpenChange={(v) => setLinkFor(v ? linkFor : null)}
        selected={linkTarget?.evidenceIds ?? []}
        onChange={(ids) => linkTarget && updateFinance(linkTarget.id, { evidenceIds: ids })}
      />
    </div>
  );
}
