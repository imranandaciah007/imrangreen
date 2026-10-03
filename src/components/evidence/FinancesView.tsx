import { useMemo, useState } from "react";
import { Coins, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EvidencePicker, LinkedEvidenceChips } from "@/components/evidence/EvidencePicker";
import { formatDate, formatDateTime, parseDay, todayLocal } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";
import { EXPENSE_GROUPS, financeGroupOf, type ExpenseCategory, type FinancialEntry } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

const money = (n: number, sym = "£") => `${sym}${Math.round(n).toLocaleString()}`;

const groupOf = financeGroupOf;

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
  const financialDocs = useMemo(
    () =>
      items
        .filter(
          (i) =>
            !i.duplicateOfId &&
            (i.category === "Financial Hardship" ||
              (i.categories ?? []).includes("Financial Hardship")),
        )
        .sort((a, b) => (b.dateOfDocument ?? "").localeCompare(a.dateOfDocument ?? "")),
    [items],
  );
  const separation = caseSettings.separationStartDate;
  const [range, setRange] = useState<"since" | "all">("since");
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [showIncome, setShowIncome] = useState(false);

  const rows = useMemo(
    () =>
      [...finances]
        .filter((f) => !f.excluded)
        .filter((f) => (range === "since" ? f.date >= separation : true))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [finances, range, separation],
  );

  const gbpOf = (f: FinancialEntry) => f.gbpEquivalent ?? convert(f.amount, f.currency).gbp;
  const usdOf = (f: FinancialEntry) => f.usdEquivalent ?? convert(f.amount, f.currency).usd;

  const totals = useMemo(() => {
    const byGroup = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const byMonth = new Map<
      string,
      {
        total: number;
        transfers: number;
        jibril: number;
        medical: number;
        housing: number;
        immigration: number;
        count: number;
        missing: number;
      }
    >();
    let total = 0;
    let usdTotal = 0;
    let obligations = 0;
    let verified = 0;
    let missing = 0;

    for (const f of rows) {
      const g = groupOf(f);
      const v = gbpOf(f);
      total += g === "UK fixed obligations" ? 0 : v;
      usdTotal += g === "UK fixed obligations" ? 0 : usdOf(f);
      if (g === "UK fixed obligations") obligations += v;
      byGroup.set(g, (byGroup.get(g) ?? 0) + v);
      const cat = f.expenseCategory ?? f.kind;
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + v);
      if (f.status === "Verified") verified += 1;
      if ((f.evidenceIds ?? []).length === 0) missing += 1;

      const key = f.date.slice(0, 7);
      const m = byMonth.get(key) ?? {
        total: 0,
        transfers: 0,
        jibril: 0,
        medical: 0,
        housing: 0,
        immigration: 0,
        count: 0,
        missing: 0,
      };
      m.count += 1;
      if ((f.evidenceIds ?? []).length === 0) m.missing += 1;
      if (g !== "UK fixed obligations") m.total += v;
      if (g === "Money sent to Aciah") m.transfers += v;
      if (g === "Jibril costs") m.jibril += v;
      if (g === "Aciah medical & pregnancy") m.medical += v;
      if (g === "Housing & relocation") m.housing += v;
      if (g === "Immigration & travel") m.immigration += v;
      byMonth.set(key, m);
    }
    return { byGroup, byCategory, byMonth, total, usdTotal, obligations, verified, missing };
  }, [rows, convert]);

  const support = totals.byGroup.get("Money sent to Aciah") ?? 0;
  const monthsSpan = Math.max(1, totals.byMonth.size);
  const ukObligations =
    income.mortgage +
    income.councilTax +
    income.utilities +
    income.debtCommitments +
    income.transportWork +
    income.otherObligations;
  const monthlySupport = support / monthsSpan;
  const remaining = income.netMonthlyIncome - ukObligations - monthlySupport;

  const months = [...totals.byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const linkTarget = finances.find((f) => f.id === linkFor) ?? null;

  const kpis = [
    { label: "Documented burden", value: money(totals.total) },
    { label: "Sent to Aciah", value: money(support) },
    { label: "Jibril costs", value: money(totals.byGroup.get("Jibril costs") ?? 0) },
    {
      label: "Aciah medical / pregnancy",
      value: money(totals.byGroup.get("Aciah medical & pregnancy") ?? 0),
    },
    {
      label: "Housing / relocation",
      value: money(totals.byGroup.get("Housing & relocation") ?? 0),
    },
    {
      label: "Immigration / travel",
      value: money(totals.byGroup.get("Immigration & travel") ?? 0),
    },
    { label: "Other separation costs", value: money(totals.byGroup.get("Other") ?? 0) },
    { label: "UK fixed obligations", value: money(totals.obligations || ukObligations) },
    { label: "Remaining after support", value: money(remaining) },
    { label: "Missing evidence", value: String(totals.missing) },
  ];

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

      <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
        <h2 className="text-sm font-semibold text-foreground">
          Financial strain since {formatDate(separation)}
        </h2>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {money(totals.total)} · {money(totals.usdTotal, "$")} · {totals.verified} verified ·{" "}
          {totals.missing} missing evidence · rate {income.usdToGbp} USD→GBP
          {income.rateDate ? ` (${income.rateDate})` : ""}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {m.label}
            </p>
            <p className="mt-1.5 font-mono text-xl font-semibold">{m.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Income &amp; fixed commitments (factual summary)
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setShowIncome((v) => !v)}
          >
            <Pencil className="size-4" /> {showIncome ? "Done" : "Edit"}
          </Button>
        </header>
        {showIncome ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
                      ...(key === "usdToGbp"
                        ? { rateDate: todayLocal() }
                        : {}),
                    })
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            <li className="flex justify-between">
              <span>Net monthly income</span>
              <span className="font-mono">{money(income.netMonthlyIncome)}</span>
            </li>
            <li className="flex justify-between">
              <span>UK fixed obligations</span>
              <span className="font-mono">−{money(ukObligations)}</span>
            </li>
            <li className="flex justify-between">
              <span>U.S. family support (monthly avg)</span>
              <span className="font-mono">−{money(monthlySupport)}</span>
            </li>
            <li className="flex justify-between font-semibold">
              <span>Remaining</span>
              <span className="font-mono">{money(remaining)}</span>
            </li>
          </ul>
        )}
        {income.updatedAt && (
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
            Last edited: {formatDateTime(income.updatedAt)} by {income.updatedBy}
          </p>
        )}
      </section>

      {months.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Month by month
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {months.map(([month, row]) => (
              <li key={month} className="rounded-lg border border-border/70 px-2.5 py-2 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-foreground">
                    {parseDay(`${month}-01`).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="font-mono text-sm font-semibold">{money(row.total)}</span>
                </div>
                <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-muted-foreground">
                  <li>Sent to Aciah {money(row.transfers)}</li>
                  <li>Jibril {money(row.jibril)}</li>
                  <li>Aciah medical {money(row.medical)}</li>
                  <li>Housing / relocation {money(row.housing)}</li>
                  <li>Immigration / travel {money(row.immigration)}</li>
                  <li>
                    Evidence coverage{" "}
                    {row.count ? Math.round(((row.count - row.missing) / row.count) * 100) : 0}% ·{" "}
                    {row.missing} missing
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {totals.byCategory.size > 0 && (
        <section className="rounded-xl border border-border bg-card p-3.5 shadow-panel">
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            By category
          </h2>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {[...totals.byCategory.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([cat, sum]) => (
                <li key={cat} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-foreground">{cat}</span>
                  <span className="font-mono text-muted-foreground">{money(sum)}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card shadow-panel">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Transactions
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
                    {formatDate(f.date)} · {f.expenseCategory ?? f.kind}
                    {f.payer ? ` · paid by ${f.payer}` : ""}
                    {f.beneficiary ? ` · for ${f.beneficiary}` : ""}
                    {f.recurring ? " · monthly" : ""}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Last edited: {formatDateTime(f.updatedAt)} by {f.lastEditedBy}
                  </p>
                  {(f.evidenceIds ?? []).length === 0 && (
                    <p className="text-[10px] font-semibold text-warning-foreground/90">
                      Missing supporting evidence
                    </p>
                  )}
                  {f.affectsAciah && (
                    <p className="text-[10px] text-muted-foreground">
                      Affects Aciah: {f.affectsAciah}
                    </p>
                  )}
                  <LinkedEvidenceChips ids={f.evidenceIds ?? []} onEdit={() => setLinkFor(f.id)} />
                </div>
                <div className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold">
                    {f.currency === "GBP" ? "£" : "$"}
                    {f.amount.toLocaleString()}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {money(gbpOf(f))} · {money(usdOf(f), "$")}
                  </span>
                  {f.status && (
                    <span className="block text-[10px] text-muted-foreground">{f.status}</span>
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

      <section className="rounded-xl border border-border bg-card shadow-panel">
        <header className="border-b border-border px-3 py-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Financial documents ({financialDocs.length})
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Receipts, letters and statements in your evidence. Tap one to open it.
          </p>
        </header>
        {financialDocs.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">
            No financial documents yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {financialDocs.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => openInspector(doc.id)}
                  className="flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {doc.title}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {doc.exhibitId} · {doc.dateOfDocument ? formatDate(doc.dateOfDocument) : "No date"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
