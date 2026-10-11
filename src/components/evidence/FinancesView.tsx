import { useMemo, useState } from "react";
import { Coins, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EvidencePicker } from "@/components/evidence/EvidencePicker";
import { formatDate, formatDateTime, parseDay, todayLocal } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { countsTowardTotals, financeGroupOf, type ExpenseCategory, type FinancialEntry } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

const money = (n: number, sym = "£") => `${sym}${Math.round(n).toLocaleString()}`;

const groupOf = financeGroupOf;

const GROUP_ORDER = [
  "Money sent to Aciah",
  "Jibril costs",
  "Aciah medical & pregnancy",
  "Housing & relocation",
  "Immigration & travel",
  "Other",
] as const;

export function FinancesView({ onAddExpense }: { onAddExpense: () => void }) {
  const {
    finances,
    updateFinance,
    deleteFinance,
    caseSettings,
    income,
    updateIncome,
    convert,
    items,
    openInspector,
  } = useEvidence();
  const separation = caseSettings.separationStartDate;
  const [linkFor, setLinkFor] = useState<string | null>(null);

  const gbpOf = (f: FinancialEntry) => f.gbpEquivalent ?? convert(f.amount, f.currency).gbp;
  const usdOf = (f: FinancialEntry) => f.usdEquivalent ?? convert(f.amount, f.currency).usd;

  const since = useMemo(
    () =>
      [...finances]
        .filter((f) => !f.excluded && f.date >= separation)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [finances, separation],
  );
  const waiting = since.filter((f) => !countsTowardTotals(f));
  const counted = since.filter((f) => countsTowardTotals(f) && groupOf(f) !== "UK fixed obligations");

  const summary = useMemo(() => {
    const byGroup = new Map<string, number>();
    const byMonth = new Map<string, number>();
    let total = 0;
    let usd = 0;
    for (const f of counted) {
      const v = gbpOf(f);
      total += v;
      usd += usdOf(f);
      byGroup.set(groupOf(f), (byGroup.get(groupOf(f)) ?? 0) + v);
      byMonth.set(f.date.slice(0, 7), (byMonth.get(f.date.slice(0, 7)) ?? 0) + v);
    }
    return { total, usd, byGroup, byMonth: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counted, convert]);
  const waitingTotal = waiting.reduce((sum, f) => sum + gbpOf(f), 0);
  const biggest = Math.max(1, ...summary.byGroup.values());

  const ukObligations =
    income.mortgage +
    income.councilTax +
    income.utilities +
    income.debtCommitments +
    income.transportWork +
    income.otherObligations;
  const support = summary.byGroup.get("Money sent to Aciah") ?? 0;
  const monthlySupport = support / Math.max(1, summary.byMonth.length);
  const remaining = income.netMonthlyIncome - ukObligations - monthlySupport;

  const financialDocs = items.filter(
    (i) => !i.duplicateOfId && (i.categories?.length ? i.categories : [i.category]).includes("Financial Hardship"),
  );
  const linkTarget = finances.find((f) => f.id === linkFor) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="space-y-1 rounded-xl border border-border bg-card p-4 shadow-panel">
        <p className="text-xs font-semibold text-muted-foreground">
          Confirmed costs since {formatDate(separation)}
        </p>
        <p className="font-display text-3xl font-black text-foreground">{money(summary.total)}</p>
        <p className="text-xs text-muted-foreground">
          About {money(summary.usd, "$")} · {counted.length} payment{counted.length === 1 ? "" : "s"}
        </p>
        {waiting.length > 0 && (
          <p className="pt-1 text-xs font-semibold text-warning-foreground">
            {waiting.length} more found in your documents ({money(waitingTotal)}) waiting for you to
            confirm below.
          </p>
        )}
        {since.length === 0 && (
          <p className="pt-1 text-xs text-muted-foreground">
            Nothing yet. Amounts are found automatically in receipts, transfers and bank statements
            when you press Update from Drive, or add one with the button below.
          </p>
        )}
      </section>

      {summary.byGroup.size > 0 && (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Where the money went</h2>
          {GROUP_ORDER.filter((g) => summary.byGroup.get(g)).map((group) => {
            const value = summary.byGroup.get(group) ?? 0;
            return (
              <div key={group} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-foreground">{group}</span>
                  <span className="font-mono font-semibold">{money(value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(value / biggest) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </section>
      )}

      {summary.byMonth.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-foreground">
            Month by month
          </summary>
          <ul className="mt-2 divide-y divide-border/70 text-xs">
            {summary.byMonth.map(([month, total]) => (
              <li key={month} className="flex justify-between py-1.5">
                <span>
                  {parseDay(`${month}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </span>
                <span className="font-mono font-semibold">{money(total)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Payments</h2>
          <Button size="sm" variant="outline" className="h-9" onClick={onAddExpense}>
            <Coins className="size-4" /> Add expense
          </Button>
        </header>
        {since.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {since.map((f) => {
              const pending = !countsTowardTotals(f);
              return (
                <li key={f.id} className={cn("px-3 py-2.5", pending && "bg-warning/8")}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{f.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(f.date)} · {f.expenseCategory ?? f.kind}
                      </p>
                      {pending && <p className="text-[11px] font-semibold text-warning-foreground">Found automatically — check it</p>}
                      {!pending && (f.evidenceIds ?? []).length === 0 && (
                        <p className="text-[11px] font-semibold text-warning-foreground">No receipt or bank proof yet</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold">
                      {f.currency === "GBP" ? "£" : "$"}
                      {f.amount.toLocaleString(undefined, {
                        minimumFractionDigits: Number.isInteger(f.amount) ? 0 : 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {pending && (
                      <>
                        <Button size="sm" className="h-8 text-[11px]" onClick={() => updateFinance(f.id, { status: "Verified" })}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => updateFinance(f.id, { excluded: true })}>
                          Not hardship
                        </Button>
                      </>
                    )}
                    {(f.evidenceIds ?? [])[0] ? (
                      <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => openInspector(f.evidenceIds[0]!)}>
                        See document
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => setLinkFor(f.id)}>
                        Link proof
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-8 text-muted-foreground"
                      aria-label="Delete expense"
                      onClick={() => deleteFinance(f.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer select-none text-sm font-semibold text-foreground">
          Income and monthly bills (optional)
        </summary>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Shows what is left each month after UK bills and the money sent to Aciah.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["Net monthly income", "netMonthlyIncome"],
              ["Mortgage", "mortgage"],
              ["Council tax", "councilTax"],
              ["Utilities", "utilities"],
              ["Debt / fixed commitments", "debtCommitments"],
              ["Transport / work costs", "transportWork"],
              ["Other obligations", "otherObligations"],
              ["USD→GBP rate", "usdToGbp"],
            ] as [string, keyof typeof income][]
          ).map(([label, key]) => (
            <div key={key} className="space-y-1">
              <Label className="text-[11px]">{label}</Label>
              <Input
                type="number"
                inputMode="decimal"
                className="h-10 font-mono text-xs"
                value={String(income[key] ?? 0)}
                onChange={(e) =>
                  updateIncome({
                    [key]: Number(e.target.value) || 0,
                    ...(key === "usdToGbp" ? { rateDate: todayLocal() } : {}),
                  })
                }
              />
            </div>
          ))}
        </div>
        <p className="mt-3 flex justify-between text-xs font-semibold">
          <span>Left each month after bills and support</span>
          <span className="font-mono">{money(remaining)}</span>
        </p>
        {income.updatedAt && (
          <p className="mt-1 text-[10px] text-muted-foreground">Last edited {formatDateTime(income.updatedAt)}</p>
        )}
      </details>

      {financialDocs.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-foreground">
            Financial documents ({financialDocs.length})
          </summary>
          <ul className="mt-2 divide-y divide-border/70">
            {financialDocs.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => openInspector(doc.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-xs hover:bg-accent/40"
                >
                  <span className="min-w-0 truncate text-foreground">{doc.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {doc.dateOfDocument ? formatDate(doc.dateOfDocument) : "No date"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <EvidencePicker
        open={linkFor !== null}
        onOpenChange={(v) => setLinkFor(v ? linkFor : null)}
        selected={linkTarget?.evidenceIds ?? []}
        onChange={(ids) =>
          linkTarget &&
          updateFinance(linkTarget.id, {
            evidenceIds: ids,
            status: ids.length ? "Verified" : "Missing receipt",
          })
        }
      />
    </div>
  );
}

export type { ExpenseCategory };
