import { FileStack, Languages, Layers, ShieldCheck, TriangleAlert } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useEvidence } from "@/lib/evidence/store";

function Kpi({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-panel">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl leading-none font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

export function KpiBar() {
  const { stats } = useEvidence();
  const indexedPercent = Math.min(100, Math.round((stats.total / stats.targetTotal) * 100));

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total evidence"
          value={`${stats.total} / ${stats.targetTotal}`}
          hint={`${indexedPercent}% of target packet indexed`}
          icon={<FileStack className="size-3.5" />}
        />
        <Kpi
          label="Master page count"
          value={stats.totalPages.toLocaleString()}
          hint={`≈ ${(stats.totalPages / 250).toFixed(1)} in of binder thickness`}
          icon={<Layers className="size-3.5" />}
        />
        <Kpi
          label="Reviewed & ready"
          value={`${stats.ready}`}
          hint={`${stats.inReview} in review · ${stats.missing} missing`}
          icon={<ShieldCheck className="size-3.5" />}
        />
        <Kpi
          label="Translation queue"
          value={`${stats.missingTranslation}`}
          hint="Awaiting certified translation"
          icon={<Languages className="size-3.5" />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/35 bg-success/14 px-2.5 py-1 font-semibold text-success">
          <ShieldCheck className="size-3" /> Ready {stats.ready}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-info/35 bg-info/14 px-2.5 py-1 font-semibold text-info">
          In review {stats.inReview}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/18 px-2.5 py-1 font-semibold text-[oklch(0.42_0.11_72)]">
          <Languages className="size-3" /> Missing translation {stats.missingTranslation}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/12 px-2.5 py-1 font-semibold text-destructive">
          <TriangleAlert className="size-3" /> Missing {stats.missing}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-lg border border-border bg-card p-3 shadow-panel md:grid-cols-2 xl:grid-cols-3">
        {stats.byCategory.map((row) => (
          <div key={row.category}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate font-medium text-foreground">{row.category}</span>
              <span className="font-mono text-muted-foreground">
                {row.percent}% · {row.ready}/{row.total}
              </span>
            </div>
            <Progress value={row.percent} className="mt-1 h-1.5" />
          </div>
        ))}
      </div>
    </section>
  );
}
