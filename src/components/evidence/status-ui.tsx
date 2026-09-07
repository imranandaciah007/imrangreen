import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUSES, type EvidenceStatus } from "@/lib/evidence/types";

const statusStyles: Record<EvidenceStatus, string> = {
  Missing: "bg-destructive/12 text-destructive border-destructive/30",
  Draft: "bg-neutral-chip text-neutral-chip-foreground border-border",
  "Needs Translation": "bg-warning/18 text-[oklch(0.42_0.11_72)] border-warning/40",
  "Certified Translation Added": "bg-info/14 text-info border-info/35",
  "Reviewed & Ready": "bg-success/14 text-success border-success/35",
  "Included in Final Packet": "bg-navy text-navy-foreground border-navy",
};

export function StatusBadge({ status, className }: { status: EvidenceStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-tight",
        statusStyles[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

export function StatusSelect({
  value,
  onChange,
  className,
}: {
  value: EvidenceStatus;
  onChange: (next: EvidenceStatus) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as EvidenceStatus)}>
      <SelectTrigger size="sm" className={cn("h-7 w-full min-w-[172px] border-border/70 bg-card text-xs", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TagChip({ tag }: { tag: string }) {
  return (
    <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground">
      {tag}
    </span>
  );
}
