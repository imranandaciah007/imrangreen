import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  FileSearch,
  Link2,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { analyseDiaryChunk, type DiaryChunkResult } from "@/lib/diary.functions";
import type { DiaryChunk } from "@/lib/evidence/diary-pdf";
import {
  planDiaryImport,
  type DiaryPlan,
  type PlannedEvent,
  type PlannedFinance,
} from "@/lib/evidence/diary-merge";
import { useEvidence } from "@/lib/evidence/store";
import { EXPENSE_CATEGORIES, PEOPLE } from "@/lib/evidence/types";
import { todayLocal } from "@/lib/evidence/format";

type Phase =
  | "pick"
  | "uploading"
  | "extracting"
  | "analysing"
  | "cross-checking"
  | "review"
  | "error"
  | "done";

interface DiaryExtractionResponse {
  pageCount: number;
  chunks: DiaryChunk[];
}

function uploadDiaryForExtraction(
  file: File,
  onUploadProgress: (loaded: number, total: number) => void,
  onUploaded: () => void,
) {
  return new Promise<DiaryExtractionResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/diary-extract");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onUploadProgress(event.loaded, event.total);
    });
    request.upload.addEventListener("load", onUploaded);
    request.addEventListener("load", () => {
      const body = request.response as { error?: unknown } | DiaryExtractionResponse | null;
      if (request.status >= 200 && request.status < 300 && body && "chunks" in body) {
        resolve(body);
        return;
      }
      const message = body && "error" in body ? String(body.error) : `Upload failed (${request.status}).`;
      reject(new Error(message));
    });
    request.addEventListener("error", () => reject(new Error("The PDF upload was interrupted.")));
    request.addEventListener("abort", () => reject(new Error("The PDF upload was cancelled.")));
    const form = new FormData();
    form.append("file", file, file.name);
    request.send(form);
  });
}

export function DiaryImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { items, events, finances, categories, addItem, applyDiaryImport, diaryImports, profile } =
    useEvidence();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [pagesAnalysed, setPagesAnalysed] = useState(0);
  const [chunkHashes, setChunkHashes] = useState<string[]>([]);
  const [plan, setPlan] = useState<DiaryPlan | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [keepMaster, setKeepMaster] = useState(true);
  const [makeTasks, setMakeTasks] = useState(true);
  const [failures, setFailures] = useState(0);
  const [summary, setSummary] = useState<ReturnType<typeof describe> | null>(null);
  const [importError, setImportError] = useState("");

  const previousKeys = useMemo(() => diaryImports.flatMap((d) => d.recordKeys), [diaryImports]);
  const previousHashes = useMemo(
    () => new Set(diaryImports.flatMap((d) => d.chunkHashes)),
    [diaryImports],
  );

  function reset() {
    setFile(null);
    setPhase("pick");
    setPlan(null);
    setAccepted({});
    setProgress({ done: 0, total: 0, label: "" });
    setFailures(0);
    setSkipped(0);
    setSummary(null);
    setImportError("");
  }

  async function run(selected: File) {
    setFile(selected);
    setImportError("");
    setPhase("uploading");
    setProgress({ done: 0, total: selected.size, label: "Uploading PDF" });
    try {
      const extraction = await uploadDiaryForExtraction(
        selected,
        (done, total) => setProgress({ done, total, label: "Uploading PDF" }),
        () => {
          setPhase("extracting");
          setProgress({ done: 0, total: 0, label: "Extracting pages" });
        },
      );
      setPagesAnalysed(extraction.pageCount);
      const allChunks = extraction.chunks;
      const fresh = allChunks.filter((c) => !previousHashes.has(c.hash));
      setSkipped(allChunks.length - fresh.length);
      setChunkHashes(allChunks.map((c) => c.hash));
      setPhase("analysing");
      setProgress({ done: 0, total: fresh.length, label: "Analysing diary" });

      const results: DiaryChunkResult[] = [];
      let failed = 0;
      const total = fresh.length;
      let done = 0;
      const queue = [...fresh];
      const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
        for (;;) {
          const chunk = queue.shift();
          if (!chunk) return;
          try {
            const result = await analyseDiaryChunk({
              data: {
                text: chunk.text,
                pageStart: chunk.pageStart,
                pageEnd: chunk.pageEnd,
                allowedCategories: categories,
                allowedPeople: [...PEOPLE],
                allowedExpenseCategories: [...EXPENSE_CATEGORIES],
              },
            });
            results.push(result);
          } catch {
            failed += 1;
          } finally {
            done += 1;
            setProgress({
              done,
              total,
              label: `Analysing diary — section ${done} of ${total}`,
            });
          }
        }
      });
      await Promise.all(workers);
      setFailures(failed);
      setPhase("cross-checking");
      setProgress({ done: total, total, label: "Cross-checking" });

      const built = planDiaryImport(results, {
        items,
        events,
        finances,
        previousKeys,
      });
      setPlan(built);
      const marks: Record<string, boolean> = {};
      [...built.events, ...built.finances].forEach((p) => {
        marks[p.key] = p.outcome !== "duplicate" && p.uncertainFields.length === 0;
      });
      setAccepted(marks);
      setPhase("review");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "The server could not extract this PDF.";
      setImportError(message);
      setPhase("error");
      toast.error("Could not import the diary", { description: message.slice(0, 200) });
    }
  }

  function describe(plan: DiaryPlan) {
    const auto = [...plan.events, ...plan.finances].filter(
      (p) => p.outcome === "new" && !p.uncertainFields.length,
    ).length;
    return {
      auto,
      enriched: [...plan.events, ...plan.finances].filter((p) => p.outcome === "enrich").length,
      duplicates: [...plan.events, ...plan.finances].filter((p) => p.outcome === "duplicate")
        .length,
      uncertain: [...plan.events, ...plan.finances].filter((p) => p.uncertainFields.length).length,
      appendix: plan.appendix.length,
      appendixMissing: plan.appendixMissing.length,
      matched: plan.alreadyImported,
      events: plan.events.length,
      finances: plan.finances.length,
      amountMissing: plan.finances.filter((p) => p.draft.amountMissing).length,
    };
  }

  async function apply() {
    if (!plan || !file) return;
    let masterEvidenceId: string | undefined;
    if (keepMaster) {
      const existingMaster = items.find((i) => i.isMasterDiary);
      if (existingMaster) masterEvidenceId = existingMaster.id;
      else {
        const created = await addItem(
          {
            exhibitId: "Master source — Hardship Diary",
            fileName: file.name,
            title: "Hardship Diary (master source document)",
            category: "Aciah / Qualifying Relative",
            categories: ["Aciah / Qualifying Relative"],
            subCategory: "Hardship diary",
            sourceType: "Personal Statement",
            people: ["Aciah", "Imran", "Jibril"],
            fileType: "PDF",
            fileSizeBytes: file.size,
            mimeType: file.type || "application/pdf",
            pageCount: pagesAnalysed,
            status: "Reviewed",
            dateOfDocument: todayLocal(),
            tags: ["#PrimaryEvidence"],
            cloudDriveUrl: "",
            notes:
              "Master hardship diary kept unchanged. Its contents have been structured into the timeline, finances and appendix references.",
            isMasterDiary: true,
          },
          file,
        );
        masterEvidenceId = created.id;
      }
    }

    const acceptEventKeys = plan.events.filter((p) => accepted[p.key]).map((p) => p.key);
    const acceptFinanceKeys = plan.finances.filter((p) => accepted[p.key]).map((p) => p.key);

    applyDiaryImport({
      fileName: file.name,
      fileSizeBytes: file.size,
      pagesAnalysed,
      chunkHashes,
      plan,
      acceptEventKeys,
      acceptFinanceKeys,
      masterEvidenceId,
      createTasksForMissing: makeTasks,
    });
    setSummary(describe(plan));
    setPhase("done");
    toast.success("Hardship diary imported", {
      description: `${acceptEventKeys.length} timeline record(s) · ${acceptFinanceKeys.length} financial record(s)`,
    });
  }

  const stats = plan ? describe(plan) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] gap-3 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpenText className="size-4" /> Import hardship diary
          </DialogTitle>
          <DialogDescription className="text-xs">
            The whole diary is read page by page, checked twice, then sorted into the timeline,
            finances and appendix references. Your original file is never changed.
          </DialogDescription>
        </DialogHeader>

        {phase === "pick" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-border bg-secondary/60 p-3 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p>
                Anything already in the case is kept. Where the diary describes something you have
                already recorded, it is linked to that record instead of creating a second copy.
                Costs without an amount are flagged, never guessed.
              </p>
            </div>
            {diaryImports.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Last imported {new Date(diaryImports.at(-1)!.importedAt).toLocaleString()} —
                uploading a newer version only brings in what has changed.
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void run(f);
              }}
            />
            <Button className="h-12 w-full text-sm" onClick={() => fileRef.current?.click()}>
              <FileSearch className="size-4" /> Choose the diary PDF
            </Button>
          </div>
        )}

        {(["uploading", "extracting", "analysing", "cross-checking"] as Phase[]).includes(phase) && (
          <div className="space-y-3 py-6 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">{progress.label || "Working…"}</p>
            <Progress
              value={progress.total ? (progress.done / progress.total) * 100 : 5}
              className="h-2"
            />
            <p className="text-[11px] text-muted-foreground">
              {phase === "uploading" && "Sending an unchanged copy securely for processing."}
              {phase === "extracting" && "The server is reading each page and preserving its page number."}
              {phase === "analysing" && "Each section is being read twice."}
              {phase === "cross-checking" && "Comparing both readings before review."}
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold">Diary extraction failed</p>
                <p className="mt-1 text-xs text-muted-foreground">{importError}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                className="h-11"
                disabled={!file}
                onClick={() => {
                  if (file) void run(file);
                }}
              >
                Retry import
              </Button>
              <Button variant="outline" className="h-11" onClick={() => reset()}>
                Choose another PDF
              </Button>
            </div>
          </div>
        )}

        {phase === "review" && plan && stats && (
          <>
            <p className="text-xs font-semibold text-emerald-700">Ready to review</p>
            <ScrollArea className="max-h-[52vh] pr-3">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                  {[
                    { n: pagesAnalysed, l: "Pages analysed" },
                    { n: stats.events, l: "Timeline records" },
                    { n: stats.finances, l: "Financial records" },
                    { n: stats.appendix, l: "Appendix references" },
                    { n: stats.enriched, l: "Existing records enriched" },
                    { n: stats.matched, l: "Already imported" },
                    { n: stats.duplicates, l: "Possible duplicates" },
                    { n: stats.uncertain, l: "Need your confirmation" },
                  ].map((s) => (
                    <div key={s.l} className="rounded-md border border-border p-2">
                      <p className="text-lg font-semibold">{s.n}</p>
                      <p className="text-muted-foreground">{s.l}</p>
                    </div>
                  ))}
                </div>

                {(skipped > 0 || failures > 0) && (
                  <p className="text-[11px] text-muted-foreground">
                    {skipped > 0 &&
                      `${skipped} section(s) unchanged since the last import were skipped. `}
                    {failures > 0 && `${failures} section(s) could not be read and were left out.`}
                  </p>
                )}

                <Group
                  title="Ready to import"
                  icon={<CheckCircle2 className="size-3.5 text-emerald-600" />}
                  rows={[...plan.events, ...plan.finances].filter(
                    (p) => p.outcome === "new" && !p.uncertainFields.length,
                  )}
                  accepted={accepted}
                  onToggle={(k) => setAccepted((prev) => ({ ...prev, [k]: !prev[k] }))}
                />
                <Group
                  title="Existing records to be enriched"
                  icon={<Link2 className="size-3.5 text-primary" />}
                  rows={[...plan.events, ...plan.finances].filter((p) => p.outcome === "enrich")}
                  accepted={accepted}
                  onToggle={(k) => setAccepted((prev) => ({ ...prev, [k]: !prev[k] }))}
                />
                <Group
                  title="Needs your confirmation"
                  icon={<AlertTriangle className="size-3.5 text-amber-600" />}
                  rows={[...plan.events, ...plan.finances].filter(
                    (p) => p.uncertainFields.length && p.outcome !== "duplicate",
                  )}
                  accepted={accepted}
                  onToggle={(k) => setAccepted((prev) => ({ ...prev, [k]: !prev[k] }))}
                />
                <Group
                  title="Possible duplicates — your decision"
                  icon={<AlertTriangle className="size-3.5 text-destructive" />}
                  rows={[...plan.events, ...plan.finances].filter((p) => p.outcome === "duplicate")}
                  accepted={accepted}
                  onToggle={(k) => setAccepted((prev) => ({ ...prev, [k]: !prev[k] }))}
                />

                {plan.appendixMissing.length > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs font-semibold">
                      Mentioned in the diary but no document found ({plan.appendixMissing.length})
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {plan.appendixMissing
                        .slice(0, 24)
                        .map((a) => a.ref)
                        .join(", ")}
                      {plan.appendixMissing.length > 24 ? "…" : ""}
                    </p>
                    <label className="mt-2 flex items-center gap-2 text-[11px]">
                      <Switch checked={makeTasks} onCheckedChange={setMakeTasks} />
                      Create a task for each one so I can collect it
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-2 text-[11px]">
                  <Switch checked={keepMaster} onCheckedChange={setKeepMaster} />
                  Keep the diary itself in the vault as the master source document
                </label>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => reset()}>
                Start again
              </Button>
              <Button size="sm" className="text-xs" onClick={() => void apply()}>
                Import selected
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "done" && summary && (
          <div className="space-y-3">
            <p className="text-sm">
              The diary has been sorted into your case. Every record it created keeps the diary page
              it came from, and appendix references are linked to matching documents where they
              exist.
            </p>
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold">{summary.events}</p>
                <p className="text-muted-foreground">Timeline records</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold">{summary.finances}</p>
                <p className="text-muted-foreground">Financial records</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold">{summary.amountMissing}</p>
                <p className="text-muted-foreground">Costs with no amount stated</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold">{summary.appendixMissing}</p>
                <p className="text-muted-foreground">Referenced documents still to find</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Imported as {profile}.</p>
            <DialogFooter>
              <Button size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Row = PlannedEvent | PlannedFinance;

function Group({
  title,
  icon,
  rows,
  accepted,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Row[];
  accepted: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold">
        {icon} {title} <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="divide-y divide-border">
        {rows.slice(0, 150).map((row) => {
          const draft = row.draft as { title?: string; label?: string };
          const label = draft.title || draft.label || "Diary entry";
          return (
            <label key={row.key} className="flex gap-2 px-3 py-2 text-[11px]">
              <Checkbox
                checked={Boolean(accepted[row.key])}
                onCheckedChange={() => onToggle(row.key)}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">
                  {row.draft.date || "no date"} · {label}
                </span>
                <span className="block text-muted-foreground">{row.reason}</span>
                {row.matchLabel && (
                  <span className="block text-muted-foreground">Existing: {row.matchLabel}</span>
                )}
                {row.uncertainFields.length > 0 && (
                  <span className="block text-amber-700">
                    Unclear:{" "}
                    {row.uncertainFields
                      .map((f) => `${f.field} (${f.options.join(" / ")})`)
                      .join("; ")}
                  </span>
                )}
                <span className="block font-mono text-[10px] text-muted-foreground">
                  Hardship diary page {row.draft.pages.join(", ") || "?"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {rows.length > 150 && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          Showing the first 150 — the rest are included with the same setting.
        </p>
      )}
    </div>
  );
}
