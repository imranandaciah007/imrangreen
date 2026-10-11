import { useEffect, useState } from "react";
import {
  BookOpen,
  CheckCheck,
  ListRestart,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAiUsage, type AiUsageSummary } from "@/lib/ai-usage.functions";
import { useEvidence } from "@/lib/evidence/store";
import { useSignOut } from "@/components/evidence/SignInGate";

function formatWhen(iso: string | null) {
  if (!iso) return "not used yet";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-3">
      <h3 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Occasional tools and account settings, kept out of the everyday screens. */
export function SettingsDialog({
  open,
  onOpenChange,
  onSyncDrive,
  onAskEvidence,
  onImportDiary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncDrive: () => void;
  onAskEvidence: () => void;
  onImportDiary: () => void;
}) {
  const { connection, driveSyncing, scanProgress, markAllReady, resetFilingNumbers } = useEvidence();
  const signOut = useSignOut();
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getAiUsage()
      .then((u) => alive && setUsage(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  const busy = driveSyncing || scanProgress.running;
  const then = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94svh] flex-col gap-3 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Settings and tools</DialogTitle>
          <DialogDescription className="text-xs">
            Things you only need now and then.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          <Section title="Google Drive">
            <p className="text-xs text-muted-foreground">
              {connection?.lastSyncedAt
                ? `Last updated ${formatWhen(connection.lastSyncedAt)}.`
                : "Not updated from Drive yet."}
            </p>
            <Button className="h-11 w-full" disabled={busy} onClick={then(onSyncDrive)}>
              <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
              {busy ? "Updating…" : "Update from Drive"}
            </Button>
          </Section>

          <Section title="Tools">
            <Button variant="outline" className="h-11 w-full justify-start" onClick={then(onAskEvidence)}>
              <MessageSquareText className="size-4" /> Ask a question about my evidence
            </Button>
            <Button variant="outline" className="h-11 w-full justify-start" onClick={then(onImportDiary)}>
              <BookOpen className="size-4" /> Import a hardship diary
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full justify-start"
              onClick={() => {
                if (!window.confirm("Mark every document as Ready? Only do this once you have checked them.")) return;
                markAllReady();
              }}
            >
              <CheckCheck className="size-4" /> Mark every document as Ready
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full justify-start"
              onClick={() => {
                if (
                  !window.confirm(
                    "Number every tab again from 1, in date order? Only do this before you file — numbers in earlier drafts will no longer match.",
                  )
                )
                  return;
                const n = resetFilingNumbers();
                toast.success(`Numbering cleared on ${n} exhibit(s)`, {
                  description: "The next packet numbers each tab from 1.",
                });
              }}
            >
              <ListRestart className="size-4" /> Start exhibit numbering again
            </Button>
          </Section>

          <Section title="Document reading">
            <ul className="space-y-1.5 text-xs">
              <li className="flex justify-between">
                <span>Reader</span>
                <strong>
                  {!usage
                    ? "Checking…"
                    : !usage.geminiConfigured
                      ? "Built-in reader"
                      : usage.outOfCredit
                        ? "Gemini limit reached"
                        : "Gemini"}
                </strong>
              </li>
              <li className="flex justify-between">
                <span>Documents read today</span>
                <strong className="tabular-nums">{usage?.geminiToday ?? 0}</strong>
              </li>
              <li className="flex justify-between">
                <span>Documents read (30 days)</span>
                <strong className="tabular-nums">{usage?.geminiMonth ?? 0}</strong>
              </li>
              <li className="flex justify-between">
                <span>Backup reads (30 days)</span>
                <strong className="tabular-nums">{usage?.fallbackMonth ?? 0}</strong>
              </li>
              <li className="flex justify-between">
                <span>Last read</span>
                <strong>{formatWhen(usage?.lastCallAt ?? null)}</strong>
              </li>
            </ul>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" />
              {usage?.claudeConfigured
                ? `Claude writes the final packet (${usage.claudeMonth} section(s) in 30 days).`
                : "Claude is not connected yet, so Gemini writes the packet. Add ANTHROPIC_API_KEY to the project secrets to use Claude."}
            </p>
            {usage?.lastError ? (
              <p className="rounded-md bg-destructive/10 p-2 text-[11px] font-semibold text-destructive">
                Last reading problem ({formatWhen(usage.lastErrorAt)}): {usage.lastError}
              </p>
            ) : null}
            {usage?.claudeLastError ? (
              <p className="rounded-md bg-destructive/10 p-2 text-[11px] font-semibold text-destructive">
                Last Claude problem: {usage.claudeLastError}
              </p>
            ) : null}
          </Section>

          <Section title="Account">
            <Button variant="outline" className="h-11 w-full justify-start" onClick={signOut}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
