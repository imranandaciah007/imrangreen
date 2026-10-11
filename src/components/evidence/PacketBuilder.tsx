import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wand2,
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
import { draftFilingLanguage, type FilingLanguage } from "@/lib/filing.functions";
import {
  buildFilingFrontMatter,
  buildFilingPart,
  type FilingExhibitInput,
  type FilingPartResult,
} from "@/lib/filing-pdf.functions";
import { buildWaiverAnalysis, type WaiverAnalysis } from "@/lib/waiver-analysis.functions";
import { waiverAnalysisHtml } from "@/lib/evidence/waiver-analysis-html";
import { FixWizard } from "./FixWizard";

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
    openInspector,
    togglePacketExclusion,
    savePacketVersion,
    updatePacketVersion,
    resetFilingNumbers,
    connection,
    driveTree,
    runExtraction,
    extractingIds,
  } = useEvidence();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStartId, setWizardStartId] = useState<string | undefined>(undefined);
  const [fixAllRunning, setFixAllRunning] = useState(false);
  const [fixAllProgress, setFixAllProgress] = useState("");

  const [step, setStep] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [sections, setSections] = useState<string[]>(DEFAULT_CATEGORIES);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ name: string; link: string; drive: boolean }[]>([]);
  const [savedFolderLink, setSavedFolderLink] = useState("");
  const [savedPacket, setSavedPacket] = useState<{ id: string; version: number } | null>(null);
  const [filingProgress, setFilingProgress] = useState<{ done: number; total: number } | null>(null);
  const [filingFiles, setFilingFiles] = useState<{ name: string; webViewLink: string }[]>([]);
  const [filingMissing, setFilingMissing] = useState<{ number: string; title: string; note: string }[]>([]);
  const [filingError, setFilingError] = useState<string | null>(null);
  /** Parts already built for this packet, so a retry carries on from the failed part. */
  const filingDone = useRef<{ packetId: string; parts: FilingPartResult[] } | null>(null);
  const [narrative, setNarrative] = useState<FilingLanguage | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [analysis, setAnalysis] = useState<WaiverAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);

  const findings = useMemo<AuditFinding[]>(
    () => preflightAudit(items, events, finances, tasks, gaps),
    [items, events, finances, tasks, gaps],
  );
  const blocking = findings.filter((f) => f.level === "blocking");
  const attention = findings.filter((f) => f.level === "attention");
  const optional = findings.filter((f) => f.level === "optional");

  /** Every flagged document, in the order shown, so the wizard can step through them. */
  const wizardQueue = useMemo(() => {
    const ids: string[] = [];
    for (const f of [...blocking, ...attention, ...optional]) {
      const id = f.gap?.recordType === "evidence" ? f.gap.recordId : null;
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [blocking, attention, optional]);

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
  const latestPacket = packets.at(-1);
  const packetFolderLink =
    latestPacket?.driveFolderWebViewLink ??
    (() => {
      const folder = driveTree?.folders.find(
        (entry) => entry.path.replace(/^\/+|\/+$/g, "") === "I601 Evidence/Generated Case Packets",
      );
      return folder ? `https://drive.google.com/drive/folders/${folder.id}` : "";
    })();

  const input: PacketInput = {
    version: nextVersion,
    generatedAt: new Date().toISOString(),
    generatedBy: profile,
    lastEditedAt: stats.lastEditedAt,
    sections,
    exhibits,
    events,
    narrative: narrative ?? undefined,
    finances,
    gaps,
    totals,
    income: {
      netMonthlyIncome: income.netMonthlyIncome ?? 0,
      mortgage: income.mortgage ?? 0,
      councilTax: income.councilTax ?? 0,
      utilities: income.utilities ?? 0,
      otherCommitments:
        (income.debtCommitments ?? 0) +
        (income.transportWork ?? 0) +
        (income.otherObligations ?? 0),
    },
  };

  async function draftLanguage() {
    setDrafting(true);
    try {
      const result = await draftFilingLanguage({
        data: {
          version: nextVersion,
          caseName: CASE_SETTINGS.caseName,
          qualifyingRelative: CASE_SETTINGS.primaryQualifyingRelative,
          applicant: "Imran",
          child: CASE_SETTINGS.child,
          separationStartDate: CASE_SETTINGS.separationStartDate,
          sections,
          exhibits: exhibits.map((e) => ({
            number: e.number,
            title: e.item.title || e.item.fileName,
            date: e.item.dateOfDocument ?? "",
            sourceType: e.item.sourceType ?? "",
            people: e.item.people ?? [],
            categories: e.item.categories?.length ? e.item.categories : [e.item.category],
            pages: `${e.firstPage}-${e.lastPage}`,
            summary: e.item.aiExtraction?.summary || e.item.notes || "",
          })),
          totals: { documented: totals.documented },
          timelineEvents: events.length,
        },
      });
      setNarrative(result);
      toast.success("Filing language drafted", {
        description: `${result.coverLetter.length} cover-letter paragraph(s) and ${result.exhibitNotes.length} exhibit description(s). Read them before filing.`,
      });
    } catch (err) {
      toast.error("Could not draft the filing language", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setDrafting(false);
    }
  }

  /**
   * Full waiver analysis: grounds, framework, hardship to Aciah in
   * fact/evidence/effect/relevance/exhibit form, discretion, plus the internal
   * review page (challenges, conflicts, unverified statements, missing evidence,
   * attorney-review flags). Written only from the recorded exhibits and events.
   */
  async function runAnalysis() {
    setAnalysing(true);
    try {
      const flagged = new Set(
        gaps.filter((g) => g.recordType === "evidence").map((g) => g.recordId),
      );
      const result = await buildWaiverAnalysis({
        data: {
          version: nextVersion,
          caseName: CASE_SETTINGS.caseName,
          qualifyingRelative: CASE_SETTINGS.primaryQualifyingRelative,
          applicant: "Imran",
          child: CASE_SETTINGS.child,
          separationStartDate: CASE_SETTINGS.separationStartDate,
          exhibits: exhibits.map((e) => ({
            number: e.number,
            title: e.item.title || e.item.fileName,
            date: e.item.dateOfDocument ?? "",
            sourceType: e.item.sourceType ?? "",
            people: e.item.people ?? [],
            categories: e.item.categories?.length ? e.item.categories : [e.item.category],
            pages: `${e.firstPage}-${e.lastPage}`,
            summary: e.item.aiExtraction?.summary || e.item.notes || "",
            aciahImpact: e.item.affectsAciah ?? "",
            needsAttention: flagged.has(e.item.id),
          })),
          events: events.map((ev) => ({
            date: ev.date,
            title: ev.title,
            categories: ev.categories?.length ? ev.categories : [ev.category],
            people: ev.people ?? [],
            description: ev.description ?? "",
            effectOnAciah: ev.effectOnAciah ?? "",
            exhibits: ev.evidenceIds
              .map((id) => exhibits.find((e) => e.item.id === id)?.number)
              .filter((n): n is string => Boolean(n)),
          })),
          finance: { ...totals, currency: CASE_SETTINGS.baseCurrency },
          openGaps: gaps.map((g) => `${g.label}: ${g.detail}`),
        },
      });
      setAnalysis(result);
      const flags =
        result.attorneyReview.length + result.contradictions.length + result.unverified.length;
      toast.success("Waiver analysis prepared", {
        description: `${result.sections.length} section(s), ${result.missingEvidence.length} evidence gap(s), ${flags} item(s) flagged for your review. Read it all before filing.`,
      });
    } catch (err) {
      toast.error("Could not prepare the waiver analysis", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setAnalysing(false);
    }
  }

  const analysisDoc = () =>
    analysis
      ? waiverAnalysisHtml(analysis, {
          caseName: CASE_SETTINGS.caseName,
          version: nextVersion,
          applicant: "Imran",
          qualifyingRelative: CASE_SETTINGS.primaryQualifyingRelative,
          exhibits,
        })
      : null;

  async function generate() {
    setBusy(true);
    const v = nextVersion;
    const files = [
      { name: `I601_Case_Packet_v${v}.html`, mime: "text/html", content: packetHtml(input) },
      {
        name: `I601_Exhibit_Index_v${v}.html`,
        mime: "text/html",
        content: exhibitIndexHtml(input),
      },
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
    const analysisHtml = analysisDoc();
    if (analysisHtml) {
      files.unshift({
        name: `I601_Waiver_Analysis_v${v}.html`,
        mime: "text/html",
        content: analysisHtml,
      });
    }

    const results: { name: string; link: string; drive: boolean }[] = [];
    let folderWebViewLink = "";
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
          folderWebViewLink = res.folderWebViewLink;
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

    const savedVersion = savePacketVersion({
      sourceLastEditedAt: stats.lastEditedAt,
      exhibitCount: exhibits.length,
      pageCount,
      sections,
      totals,
      timelineEventCount: events.length,
      unresolvedIssues: gaps.length,
      driveFolder: "/I601 Evidence/Generated Case Packets/",
      driveFolderWebViewLink: folderWebViewLink || undefined,
      files: results.map((r) => ({ name: r.name, webViewLink: r.link })),
      exhibitMap: exhibits.map((e) => ({
        evidenceId: e.item.id,
        number: e.number,
        pages: `${e.firstPage}-${e.lastPage}`,
      })),
    });

    setSaved(results);
    setSavedFolderLink(folderWebViewLink);
    setSavedPacket({ id: savedVersion.id, version: savedVersion.version });
    setFilingFiles([]);
    setFilingMissing([]);
    setFilingError(null);
    filingDone.current = null;
    setBusy(false);
    setStep(4);
  }

  /**
   * The finished filing packet: built from the Drive originals in parts of a few
   * exhibits (a whole packet is too big for one request), with page numbers that
   * run on from part to part, then the index with the real page numbers.
   */
  async function buildFilingPdf() {
    if (!savedPacket) return;
    const version = savedPacket.version;
    const pad = (n: number) => String(n).padStart(2, "0");
    const short = (number: string) => number.replace(/^Exhibit /, "");

    // Plan the parts: a new part at each tab, and at most 8 exhibits / ~12 MB each.
    const plan: { exhibits: typeof exhibits; tabsStartingHere: string[] }[] = [];
    const seenTabs = new Set<string>();
    let current: (typeof plan)[number] | null = null;
    let bytes = 0;
    for (const e of exhibits) {
      const size = e.item.fileSizeBytes || 0;
      const newTab = !seenTabs.has(e.sectionLetter);
      if (!current || newTab || current.exhibits.length >= 8 || (bytes + size > 12_000_000 && current.exhibits.length)) {
        current = { exhibits: [], tabsStartingHere: [] };
        plan.push(current);
        bytes = 0;
      }
      if (newTab) {
        seenTabs.add(e.sectionLetter);
        current.tabsStartingHere.push(e.sectionLetter);
      }
      current.exhibits.push(e);
      bytes += size;
    }
    if (!plan.length) return;

    if (filingDone.current?.packetId !== savedPacket.id) {
      filingDone.current = { packetId: savedPacket.id, parts: [] };
    }
    const done = filingDone.current;
    setFilingError(null);
    setFilingProgress({ done: done.parts.length, total: plan.length + 1 });
    try {
      for (let i = done.parts.length; i < plan.length; i += 1) {
        const part = plan[i]!;
        const startPage = i === 0 ? 1 : done.parts[i - 1]!.lastPage + 1;
        const inputs: FilingExhibitInput[] = part.exhibits.map((e) => ({
          number: e.number,
          tabLetter: e.sectionLetter,
          tabTitle: e.section === "Other" ? "Other Evidence" : e.section,
          title: e.item.title || e.item.fileName,
          date: e.item.dateOfDocument ? formatDate(e.item.dateOfDocument) : "",
          driveFileId: e.item.driveFileId ?? "",
          fileName: e.item.fileName,
          mimeType: e.item.mimeType ?? "",
        }));
        const first = short(part.exhibits[0]!.number);
        const last = short(part.exhibits.at(-1)!.number);
        const result = await buildFilingPart({
          data: {
            version,
            name: `I601 Filing Packet v${version} - Part ${pad(i + 1)} (${first === last ? first : `${first} to ${last}`})`,
            startPage,
            exhibits: inputs,
            tabsStartingHere: part.tabsStartingHere,
          },
        });
        done.parts.push(result);
        setFilingProgress({ done: done.parts.length, total: plan.length + 1 });
      }

      const pagesOf = new Map(done.parts.flatMap((p) => p.exhibits).map((e) => [e.number, e]));
      const tabs: { letter: string; title: string; exhibits: { number: string; title: string; date: string; firstPage: number; lastPage: number }[] }[] = [];
      for (const e of exhibits) {
        let tab = tabs.find((t) => t.letter === e.sectionLetter);
        if (!tab) {
          tab = { letter: e.sectionLetter, title: e.section === "Other" ? "Other Evidence" : e.section, exhibits: [] };
          tabs.push(tab);
        }
        const pages = pagesOf.get(e.number);
        tab.exhibits.push({
          number: e.number,
          title: e.item.title || e.item.fileName,
          date: e.item.dateOfDocument ? formatDate(e.item.dateOfDocument) : "",
          firstPage: pages?.firstPage ?? 0,
          lastPage: pages?.lastPage ?? 0,
        });
      }
      const front = await buildFilingFrontMatter({
        data: {
          version,
          name: `I601 Filing Packet v${version} - Part 00 (Index and cover letter)`,
          caseName: CASE_SETTINGS.caseName,
          applicant: CASE_SETTINGS.applicantFullName,
          qualifyingRelative: CASE_SETTINGS.qualifyingRelativeFullName,
          preparedOn: formatDate(new Date().toISOString().slice(0, 10)),
          coverLetter: narrative?.coverLetter ?? [],
          tabs,
          parts: done.parts.map((p) => ({ name: p.name.replace(/\.pdf$/, ""), firstPage: p.firstPage, lastPage: p.lastPage })),
        },
      });
      setFilingProgress({ done: plan.length + 1, total: plan.length + 1 });

      const files = [
        { name: front.name, webViewLink: front.webViewLink },
        ...done.parts.map((p) => ({ name: p.name, webViewLink: p.webViewLink })),
      ];
      const missing = done.parts
        .flatMap((p) => p.exhibits)
        .filter((e) => !e.included)
        .map((e) => ({
          number: e.number,
          title: exhibits.find((x) => x.number === e.number)?.item.title ?? "",
          note: e.note ?? "",
        }));
      setFilingFiles(files);
      setFilingMissing(missing);
      const totalPages = done.parts.at(-1)?.lastPage ?? 0;
      updatePacketVersion(savedPacket.id, {
        filingFiles: files,
        filingBuiltAt: new Date().toISOString(),
        filingPageCount: totalPages,
        exhibitMap: exhibits.map((e) => {
          const p = pagesOf.get(e.number);
          return { evidenceId: e.item.id, number: e.number, pages: p ? `${p.firstPage}-${p.lastPage}` : "" };
        }),
      });
      toast.success(`Filing packet ready: ${totalPages} numbered pages`, {
        description: missing.length
          ? `${missing.length} original(s) need inserting by hand — listed below.`
          : "Saved to the packet folder in Drive.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The filing packet could not be built.";
      setFilingError(message);
      toast.error("The filing packet stopped part-way", {
        description: `${message} Press the button again to carry on from where it stopped.`,
      });
    } finally {
      setFilingProgress(null);
    }
  }

  function printDoc(html: string) {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Allow pop-ups to print or save as PDF.");
      return;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }

  function printPacket() {
    printDoc(packetHtml(input));
  }

  function printAnalysis() {
    const html = analysisDoc();
    if (html) printDoc(html);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94svh] flex-col gap-3 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Build case packet</DialogTitle>
          <DialogDescription className="text-xs">
            Organises the evidence into a draft bundle. Original files are never changed, and the
            packet makes no prediction about the outcome.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
            <span>
              Last draft: {latestPacket ? formatDateTime(latestPacket.generatedAt) : "None yet"}
            </span>
            {packetFolderLink && (
              <a
                href={packetFolderLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-8 items-center gap-1 font-semibold text-primary underline underline-offset-2"
              >
                <ExternalLink className="size-3.5" /> Open packet folder
              </a>
            )}
          </div>
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
                  {
                    label: "Needs attention",
                    n: attention.length + blocking.length,
                    tone: "text-warning",
                  },
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

              {(() => {
                const ids = Array.from(
                  new Set(
                    [...blocking, ...attention]
                      .filter((f) => f.gap?.recordType === "evidence")
                      .map((f) => f.gap!.recordId),
                  ),
                );
                if (!ids.length) return null;
                return (
                  <Button
                    className="h-11 w-full"
                    disabled={fixAllRunning}
                    onClick={async () => {
                      setFixAllRunning(true);
                      let n = 0;
                      for (const id of ids) {
                        setFixAllProgress(`${++n} of ${ids.length}`);
                        try {
                          await runExtraction(id);
                        } catch {
                          /* keep going; it stays highlighted */
                        }
                      }
                      setFixAllRunning(false);
                      setFixAllProgress("");
                      toast.success("Finished fixing with AI", {
                        description: "Anything still unresolved stays highlighted.",
                      });
                    }}
                  >
                    {fixAllRunning ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {fixAllRunning
                      ? `Fixing ${fixAllProgress}…`
                      : `Fix all ${ids.length} outstanding with AI`}
                  </Button>
                );
              })()}

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
                        <>
                          <Button
                            size="sm"
                            className="h-9 text-[11px]"
                            onClick={() => {
                              setWizardStartId(f.gap!.recordId);
                              setWizardOpen(true);
                            }}
                          >
                            Fix now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 text-[11px]"
                            onClick={() => openInspector(f.gap!.recordId)}
                          >
                            View
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {wizardQueue.length > 0 && (
                <Button
                  className="h-11 w-full"
                  onClick={() => {
                    setWizardStartId(undefined);
                    setWizardOpen(true);
                  }}
                >
                  <Wand2 className="size-4" /> Step through all {wizardQueue.length} document
                  {wizardQueue.length === 1 ? "" : "s"}
                </Button>
              )}

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
                {DEFAULT_CATEGORIES.map((cat) => {
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
                      <span className="w-4 font-mono text-[10px] text-muted-foreground">
                        {sections.includes(cat)
                          ? String.fromCharCode(65 + sections.indexOf(cat))
                          : "–"}
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
                {exhibits.length} exhibits, {pageCount} packet pages. Turn an exhibit off to leave
                it out of this packet — it stays in Documents.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Each section is a tab, and exhibits are numbered within it (Exhibit A-1, A-2,
                B-1…). Numbers stay fixed once a packet is generated.{" "}
                <button
                  type="button"
                  className="font-semibold text-primary underline underline-offset-2"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Number every tab again from 1, in date order? Only do this before you file — numbers in earlier drafts will no longer match.",
                      )
                    ) {
                      const n = resetFilingNumbers();
                      toast.success(`Numbering cleared on ${n} exhibit(s)`, {
                        description: "The next packet numbers each tab from 1.",
                      });
                    }
                  }}
                >
                  Start numbering again
                </button>
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
                          {ex ? `${ex.number} · pages ${ex.firstPage}–${ex.lastPage}` : "excluded"}{" "}
                          · {formatDate(item.dateOfDocument)} · {item.sourceType}
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
              <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold text-foreground">
                  Cover letter and index wording
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {narrative
                    ? `Drafted ${formatDateTime(narrative.generatedAt)} — ${narrative.coverLetter.length} paragraph(s), ${narrative.exhibitNotes.length} exhibit description(s). Included in the packet and index.`
                    : "Writes a formal cover letter and a one-line description for every exhibit, using only the details already recorded. Nothing is invented and no outcome is predicted."}
                </p>
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  disabled={drafting || !exhibits.length}
                  onClick={() => void draftLanguage()}
                >
                  {drafting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ClipboardList className="size-4" />
                  )}
                  {narrative ? "Redraft the filing language" : "Draft the filing language"}
                </Button>
                {narrative?.coverLetter[0] && (
                  <p className="rounded-md border border-border bg-secondary/40 p-2 text-[11px] text-muted-foreground">
                    {narrative.coverLetter[0].slice(0, 260)}
                    {narrative.coverLetter[0].length > 260 ? "…" : ""}
                  </p>
                )}
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold text-foreground">
                  Full waiver analysis (Aciah as qualifying relative)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {analysis
                    ? `Prepared ${formatDateTime(analysis.generatedAt)} — ${analysis.sections.length} section(s), ${analysis.missingEvidence.length} evidence gap(s), ${analysis.contradictions.length} conflict(s), ${analysis.attorneyReview.length} item(s) for an attorney. Included with the packet.`
                    : "Works out the possible inadmissibility ground, the waiver route, and the hardship to Aciah — separation, relocation and the combined effect — with every statement tied to an exhibit. Also lists conflicts, weak points, missing documents and anything needing an immigration attorney."}
                </p>
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  disabled={analysing || !exhibits.length}
                  onClick={() => void runAnalysis()}
                >
                  {analysing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  {analysis ? "Prepare it again" : "Prepare the full waiver analysis"}
                </Button>
                {analysis && (
                  <>
                    {analysis.attorneyReview.length > 0 && (
                      <p className="rounded-md border border-destructive/45 bg-destructive/10 p-2 text-[11px] text-foreground">
                        <AlertTriangle className="mr-1 inline size-3.5 text-destructive" />
                        {analysis.attorneyReview.length} point(s) need an immigration attorney before
                        filing.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      className="h-11 w-full"
                      onClick={() => printAnalysis()}
                    >
                      <Sparkles className="size-4" /> Read the analysis / save as PDF
                    </Button>
                  </>
                )}
              </div>
              <Button variant="outline" className="h-11 w-full" onClick={printPacket}>
                <FileText className="size-4" /> Preview / save as PDF
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-success/45 bg-success/10 p-2.5 text-xs">
                <CheckCircle2 className="size-4 text-success" /> Case Packet v{packets.length}{" "}
                saved.
              </div>
              {savedFolderLink && (
                <Button variant="outline" className="h-11 w-full" asChild>
                  <a href={savedFolderLink} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" /> Open case packet folder in Drive
                  </a>
                </Button>
              )}
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
              <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
                <p className="text-[11px] font-semibold text-foreground">
                  Filing packet (the version you submit)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Builds the finished PDFs from your Drive originals: a title page, the cover letter
                  and a table of contents, then every tab with divider pages and each exhibit
                  numbered (Exhibit A-1, A-2…). Every page is numbered in one run across all the
                  files, and each file has bookmarks. Originals are not changed.
                </p>
                {!connection?.connected ? (
                  <p className="text-[11px] font-semibold text-destructive">
                    Link Google Drive first — the packet is built from the originals there.
                  </p>
                ) : (
                  <Button
                    className="h-11 w-full"
                    disabled={!savedPacket || filingProgress !== null}
                    onClick={() => void buildFilingPdf()}
                  >
                    {filingProgress ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    {filingProgress
                      ? `Building part ${Math.min(filingProgress.done + 1, filingProgress.total)} of ${filingProgress.total}…`
                      : filingError
                        ? "Carry on building the filing packet"
                        : filingFiles.length
                          ? "Build the filing packet again"
                          : "Build the filing packet"}
                  </Button>
                )}
                {filingProgress && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round((filingProgress.done / filingProgress.total) * 100)}%` }}
                    />
                  </div>
                )}
                {filingError && (
                  <p className="text-[11px] font-semibold text-destructive">Stopped: {filingError}</p>
                )}
                {filingFiles.length > 0 && (
                  <ul className="space-y-1">
                    {filingFiles.map((f) => (
                      <li key={f.name} className="flex items-center gap-2 text-[11px]">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        {f.webViewLink && (
                          <a href={f.webViewLink} target="_blank" rel="noreferrer" className="text-[10px] underline">
                            Open
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {filingMissing.length > 0 && (
                  <div className="rounded-md border border-warning/50 bg-warning/10 p-2 text-[11px]">
                    <p className="font-semibold">Insert these originals by hand</p>
                    <p className="text-muted-foreground">
                      Their numbered slip page is in the packet with a note saying where they go.
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {filingMissing.map((m) => (
                        <li key={m.number}>
                          {m.number} — {m.title} <span className="text-muted-foreground">({m.note})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Button variant="outline" className="h-11 w-full" onClick={printPacket}>
                <Download className="size-4" /> Print / save the draft packet as PDF
              </Button>
              {packets.length > 1 && (
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Previous versions
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {packets
                      .slice(0, -1)
                      .reverse()
                      .map((v) => (
                        <li key={v.id} className="font-mono text-[10px] text-muted-foreground">
                          v{v.version} · {formatDateTime(v.generatedAt)} · {v.exhibitCount} exhibits
                          · £{v.totals.documented.toFixed(2)}
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
    <FixWizard
      open={wizardOpen}
      onOpenChange={setWizardOpen}
      itemIds={wizardQueue}
      startId={wizardStartId}
    />
    </>
  );
}
