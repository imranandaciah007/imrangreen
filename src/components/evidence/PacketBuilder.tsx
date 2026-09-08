import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { formatDate, formatDateTime } from "@/lib/evidence/format";
import {
  buildExhibits,
  exhibitIndexHtml,
  financeCsv,
  financeSummaryHtml,
  gapReportHtml,
  packetHtml,
  preflightAudit,
  timelineHtml,
  type AuditFinding,
  type PacketInput,
} from "@/lib/evidence/packet";
import { useEvidence } from "@/lib/evidence/store";
import { CASE_SETTINGS, EXPENSE_GROUPS, DEFAULT_CATEGORIES } from "@/lib/evidence/types";
import { uploadPacketFile } from "@/lib/drive.functions";

const STEPS = ["Audit", "Sections", "Exhibit index", "Generate", "Saved"] as const;

function download(name: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function PacketBuilder({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    items,
    events,
    finances,
    tasks,
    gaps,
    stats,
    income,
    packets,
    profile,
    addTask,
    openInspector,
    togglePacketExclusion,
    savePacketVersion,
    connection,
  } = useEvidence();

  const [step, setStep] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [sections, setSections] = useState<string[]>(DEFAULT_CATEGORIES);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ name: string; link: string; drive: boolean }[]>([]);

  const findings = useMemo<AuditFinding[]>(
    () => preflightAudit(items, events, finances, tasks, gaps),
    [items, events, finances, tasks, gaps],
  );
  const blocking = findings.filter((f) => f.level === "blocking");
  const attention = findings.filter((f) => f.level === "attention");
  const optional = findings.filter((f) => f.level === "optional");

  const exhibits = useMemo(() => buildExhibits(items, sections), [items, sections]);
  const pageCount = exhibits.at(-1)?.lastPage ?? 0;

  const totals = useMemo(() => {
    const sum = (cats: readonly string[]) =>
      finances
        .filter(
          (f) =>
            !f.excluded &&
            f.date >= CASE_SETTINGS.separationStartDate &&
            cats.includes(f.expenseCategory ?? ""),
        )
        .reduce((acc, f) => acc + (f.gbpEquivalent ?? f.amount), 0);
    const documented = finances
      .filter(
        (f) =>
          !f.excluded &&
          f.date >= CASE_SETTINGS.separationStartDate &&
          f.expenseCategory !== "UK fixed obligations",
      )
      .reduce((acc, f) => acc + (f.gbpEquivalent ?? f.amount), 0);
    return {
      documented,
      sentToAciah: sum(EXPENSE_GROUPS["Money sent to Aciah"] ?? []),
      jibril: sum(EXPENSE_GROUPS["Jibril costs"] ?? []),
      medical: sum(EXPENSE_GROUPS["Aciah medical & pregnancy"] ?? []),
      housing: sum(EXPENSE_GROUPS["Housing & relocation"] ?? []),
      immigration: sum(EXPENSE_GROUPS["Immigration & travel"] ?? []),
    };
  }, [finances]);

  const nextVersion = packets.length + 1;

  const input: PacketInput = {
    version: nextVersion,
    generatedAt: new Date().toISOString(),
    generatedBy: profile,
    lastEditedAt: stats.lastEditedAt,
    sections,
    exhibits,
    events,
    finances,
    gaps,
    totals,
    income: {
      netMonthlyIncome: income.netMonthlyIncome ?? 0,
      mortgage: income.mortgage ?? 0,
      councilTax: income.councilTax ?? 0,
      utilities: income.utilities ?? 0,
      otherCommitments:
        (income.debtCommitments ?? 0) + (income.transportWork ?? 0) + (income.otherObligations ?? 0),
    },
  };

  async function generate() {
    setBusy(true);
    const v = nextVersion;
    const files = [
      { name: `I601_Case_Packet_v${v}.html`, mime: "text/html", content: packetHtml(input) },
      { name: `I601_Exhibit_Index_v${v}.html`, mime: "text/html", content: exhibitIndexHtml(input) },
      { name: `I601_Timeline_v${v}.html`, mime: "text/html", content: timelineHtml(input) },
      {
        name: `I601_Financial_Summary_v${v}.html`,
        mime: "text/html",
        content: financeSummaryHtml(input),
      },
      {
        name: `I601_Financial_Summary_v${v}.csv`,
        mime: "text/csv",
        content: financeCsv(finances, items, exhibits),
      },
      { name: `I601_Gap_Report_v${v}.html`, mime: "text/html", content: gapReportHtml(input) },
    ];

    const results: { name: string; link: string; drive: boolean }[] = [];
    for (const file of files) {
      download(file.name, file.mime, file.content);
      let link = "";
      let drive = false;
      if (connection?.connected) {
        try {
          const res = await uploadPacketFile({
            data: { name: file.name, mimeType: file.mime, content: file.content },
          });
          link = res.webViewLink;
          drive = true;
        } catch (err) {
          console.error(err);
          toast.error(`Could not save ${file.name} to Drive`, {
            description: err instanceof Error ? err.message : "Saved to this device instead.",
          });
        }
      }
      results.push({ name: file.name, link, drive });
    }

    savePacketVersion({
      sourceLastEditedAt: stats.lastEditedAt,
      exhibitCount: exhibits.length,
      pageCount,
      sections,
      totals,
      timelineEventCount: events.length,
      unresolvedIssues: gaps.length,
      driveFolder: "/I601 Evidence/Generated Case Packets/",
      files: results.map((r) => ({ name: r.name, webViewLink: r.link })),
      exhibitMap: exhibits.map((e) => ({
        evidenceId: e.item.id,
        number: e.number,
        pages: `${e.firstPage}-${e.lastPage}`,
      })),
    });

    setSaved(results);
    setBusy(false);
    setStep(4);
  }

  function printPacket() {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Allow pop-ups to print or save as PDF.");
      return;
    }
    w.document.write(packetHtml(input));
    w.document.close();
    setTimeout(() => w.print(), 600);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94svh] flex-col gap-3 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Build case packet</DialogTitle>
          <DialogDescription className="text-xs">
            Organises the evidence into a draft bundle. Original files are never changed, and the
            packet makes no prediction about the outcome.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex shrink-0 items-center gap-1 overflow-x-auto text-[10px]">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-1 rounded-full border px-2 py-1 whitespace-nowrap ${
                i === step
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span className="font-mono">{i + 1}</span> {label}
            </li>
          ))}
        </ol>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {step === 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: "Ready to include",
                    n: exhibits.length,
                    tone: "text-success",
                  },
                  { label: "Needs attention", n: attention.length + blocking.length, tone: "text-warning" },
                  { label: "Optional", n: optional.length, tone: "text-muted-foreground" },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg border border-border bg-card p-2.5">
                    <div className={`font-mono text-lg font-semibold ${c.tone}`}>{c.n}</div>
                    <div className="text-[10px] text-muted-foreground">{c.label}</div>
                  </div>
                ))}
              </div>

              {blocking.length > 0 && (
                <p className="rounded-lg border border-destructive/50 bg-destructive/10 p-2.5 text-[11px]">
                  {blocking.length} exhibit{blocking.length === 1 ? "" : "s"} have no file attached.
                  Fix or exclude these before generating.
                </p>
              )}

              <ul className="space-y-2">
                {[...blocking, ...attention, ...optional].slice(0, 40).map((f) => (
                  <li key={f.id} className="rounded-lg border border-border bg-card p-2.5">
                    <div className="flex items-start gap-2">
                      {f.level === "blocking" ? (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                      ) : f.level === "attention" ? (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      ) : (
                        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{f.label}</p>
                        <p className="text-[11px] text-muted-foreground">{f.detail}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {f.gap?.recordType === "evidence" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-[11px]"
                          onClick={() => openInspector(f.gap!.recordId)}
                        >
                          Fix now
                        </Button>
                      )}
                      {f.gap && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-[11px]"
                          onClick={() =>
                            addTask({
                              title: f.gap!.taskTitle,
                              category: "",
                              dueDate: "",
                              done: false,
                              assignedTo: profile,
                              status: "To do",
                              priority: f.gap!.severity === "high" ? "High" : "Normal",
                              notes: f.detail,
                            })
                          }
                        >
                          <ClipboardList className="size-3.5" /> Create task
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {(attention.length > 0 || optional.length > 0) && (
                <label className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-[11px]">
                  <Checkbox
                    checked={acknowledged}
                    onCheckedChange={(v) => setAcknowledged(Boolean(v))}
                  />
                  I have seen these items and want to continue anyway.
                </label>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-[11px] text-muted-foreground">
                Choose the sections to include. Evidence that supports several sections is filed
                once and cross-referenced.
              </p>
              <ul className="space-y-1.5">
                {DEFAULT_CATEGORIES.map((cat, i) => {
                  const count = items.filter(
                    (it) =>
                      !it.excludeFromPacket &&
                      (it.categories?.length ? it.categories : [it.category]).includes(cat),
                  ).length;
                  return (
                    <li
                      key={cat}
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5"
                    >
                      <Checkbox
                        checked={sections.includes(cat)}
                        onCheckedChange={(v) =>
                          setSections((prev) =>
                            v
                              ? DEFAULT_CATEGORIES.filter((c) => prev.includes(c) || c === cat)
                              : prev.filter((c) => c !== cat),
                          )
                        }
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{cat}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-[11px] text-muted-foreground">
                {exhibits.length} exhibits, {pageCount} packet pages. Turn an exhibit off to leave it
                out of this packet — it stays in the vault.
              </p>
              <ul className="space-y-1.5">
                {items.map((item) => {
                  const ex = exhibits.find((e) => e.item.id === item.id);
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-2.5"
                    >
                      <Switch
                        checked={!item.excludeFromPacket}
                        onCheckedChange={() => togglePacketExclusion(item.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {item.title || item.fileName}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {ex ? `${ex.number} · pages ${ex.firstPage}–${ex.lastPage}` : "excluded"} ·{" "}
                          {formatDate(item.dateOfDocument)} · {item.sourceType}
                        </p>
                      </div>
                      {item.packetExhibitNo && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          fixed
                        </Badge>
                      )}
                    </li>
                  );
                })}
                {items.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    No evidence yet — add documents or sync Drive first.
                  </li>
                )}
              </ul>
            </>
          )}

          {step === 3 && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Exhibits", String(exhibits.length)],
                  ["Packet pages", String(pageCount)],
                  ["Timeline events", String(events.length)],
                  ["Unresolved items", String(gaps.length)],
                  ["Documented since 18 Aug 2026", `£${totals.documented.toFixed(2)}`],
                  ["Sections", String(sections.length)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-2.5">
                    <div className="text-[10px] text-muted-foreground">{label}</div>
                    <div className="font-mono text-sm font-semibold text-foreground">{value}</div>
                  </div>
                ))}
              </div>
              <p className="rounded-lg border border-border bg-secondary/40 p-2.5 text-[11px] text-muted-foreground">
                Last edited: {stats.lastEditedAt ? formatDateTime(stats.lastEditedAt) : "—"}
                <br />
                This will be saved as Case Packet v{nextVersion}. Earlier versions stay exactly as
                they were.
                {connection?.connected
                  ? " Files are also saved to /I601 Evidence/Generated Case Packets/."
                  : " Google Drive is not connected, so files are saved to this device only."}
              </p>
              <Button variant="outline" className="h-11 w-full" onClick={printPacket}>
                <FileText className="size-4" /> Preview / save as PDF
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-success/45 bg-success/10 p-2.5 text-xs">
                <CheckCircle2 className="size-4 text-success" /> Case Packet v{packets.length} saved.
              </div>
              <ul className="space-y-1.5">
                {saved.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5"
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[11px]">{f.name}</span>
                    {f.drive && f.link ? (
                      <a
                        href={f.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] underline"
                      >
                        Drive
                      </a>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">this device</span>
                    )}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="h-11 w-full" onClick={printPacket}>
                <Download className="size-4" /> Print / save the packet as PDF
              </Button>
              {packets.length > 1 && (
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Previous versions
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {packets.slice(0, -1).reverse().map((v) => (
                      <li key={v.id} className="font-mono text-[10px] text-muted-foreground">
                        v{v.version} · {formatDateTime(v.generatedAt)} · {v.exhibitCount} exhibits ·
                        £{v.totals.documented.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border pt-3">
          {step > 0 && step < 4 && (
            <Button variant="outline" className="h-11 flex-1" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button
              className="h-11 flex-1"
              disabled={
                step === 0 &&
                (blocking.length > 0 ||
                  ((attention.length > 0 || optional.length > 0) && !acknowledged))
              }
              onClick={() => setStep(step + 1)}
            >
              Continue
            </Button>
          )}
          {step === 3 && (
            <Button className="h-11 flex-1" disabled={busy} onClick={() => void generate()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Generating…" : `Generate packet v${nextVersion}`}
            </Button>
          )}
          {step === 4 && (
            <Button className="h-11 flex-1" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
