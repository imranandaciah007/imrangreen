import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUSES, type EvidenceStatus } from "@/lib/evidence/types";

const statusStyles: Record<EvidenceStatus, string> = {
  New: "bg-neutral-chip text-neutral-chip-foreground border-border",
  "AI processing": "bg-info/10 text-info border-info/30",
  "Needs confirmation": "bg-warning/18 text-[oklch(0.42_0.11_72)] border-warning/40",
  Reviewed: "bg-info/14 text-info border-info/35",
  Ready: "bg-success/14 text-success border-success/35",
  "Missing supporting evidence": "bg-destructive/12 text-destructive border-destructive/30",
  "Duplicate suspected": "bg-warning/12 text-[oklch(0.42_0.11_72)] border-warning/35",
  "Translation needed": "bg-warning/18 text-[oklch(0.42_0.11_72)] border-warning/40",
  Archived: "bg-secondary text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: EvidenceStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-tight whitespace-nowrap",
        statusStyles[status] ?? statusStyles.New,
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
      <SelectTrigger
        className={cn("h-8 w-full min-w-[172px] border-border/70 bg-card text-xs", className)}
      >
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
