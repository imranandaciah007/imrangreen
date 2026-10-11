import { useEffect, useState } from "react";
import {
  BookOpen,
  ClipboardCheck,
  Loader2,
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
import { checkCopiesAgainstOriginals } from "@/lib/jobs/background.functions";
import type { CopyCheck, CheckedFile } from "@/lib/jobs/copy-check.server";
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

function FileList({ title, files }: { title: string; files: (CheckedFile & { note?: string })[] }) {
  if (!files.length) return null;
  return (
    <details className="rounded-md border border-border p-2">
      <summary className="cursor-pointer select-none text-xs font-semibold text-foreground">
        {title} ({files.length})
      </summary>
      <ul className="mt-2 space-y-1.5">
        {files.map((f, i) => (
          <li key={`${f.link}-${i}`} className="text-[11px]">
            <a href={f.link} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
              {f.name}
            </a>
            <span className="block truncate text-muted-foreground">{f.path || "My Drive"}</span>
            {f.note ? <span className="block text-muted-foreground">{f.note}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Compares every original with the exhibit copies, so each document has exactly one. */
function CopyCheckSection() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CopyCheck | null>(null);
  const [error, setError] = useState("");
  const run = async () => {
    setRunning(true);
    setError("");
    try {
      setResult(await checkCopiesAgainstOriginals());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check could not finish. Please try again.");
    } finally {
      setRunning(false);
    }
  };
  const all = result
    ? result.missing.length === 0 && result.extra.length === 0 && result.orphans.length === 0
    : false;
  return (
    <Section title="Originals and exhibit copies">
      <p className="text-xs text-muted-foreground">
        Checks that every document in your Drive has exactly one exhibit copy, and that every copy
        belongs to a real original. Nothing is changed.
      </p>
      <Button variant="outline" className="h-11 w-full justify-start" disabled={running} onClick={() => void run()}>
        {running ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
        {running ? "Checking your Drive…" : "Check copies against originals"}
      </Button>
      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
      {result && (
        <div className="space-y-2 text-xs">
          <p className={all ? "font-semibold text-success" : "font-semibold text-foreground"}>
            {all
              ? `All matched: ${result.documents} documents, each with exactly one copy.`
              : `${result.matched} of ${result.documents} documents have exactly one copy.`}
          </p>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>
              {result.originals} original files
              {result.identicalOriginals
                ? ` (${result.identicalOriginals} are identical to another file and share its copy)`
                : ""}
            </li>
            <li>{result.copies} exhibit copies in the clones folder</li>
            {!result.complete && <li>Drive did not list everything this time, so try again for exact numbers.</li>}
          </ul>
          <FileList title="Documents with no copy yet" files={result.missing.map((m) => ({ ...m, note: `${m.status}${m.note ? ` — ${m.note}` : ""}` }))} />
          <FileList
            title="Documents with more than one copy"
            files={result.extra.flatMap((e) => e.copies.map((c) => ({ ...c, note: `copy of ${e.original.name}` })))}
          />
          <FileList title="Copies whose original is gone" files={result.orphans} />
        </div>
      )}
    </Section>
  );
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

          <CopyCheckSection />

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
