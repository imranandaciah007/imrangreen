import { useState } from "react";
import { MessagesSquare, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { askEvidence, type AskAnswer } from "@/lib/ai.functions";
import { formatDate } from "@/lib/evidence/format";
import { useEvidence } from "@/lib/evidence/store";

const SUGGESTIONS = [
  "Show everything about Aciah's mental health since 18 August",
  "What evidence supports family separation?",
  "Show documents involving Jibril",
  "What costs are documented since the separation?",
];

export function AskEvidenceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { items, events, finances, tasks, openInspector } = useEvidence();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);

  /** Only the case's own stored records are sent — nothing else. */
  function buildRecords() {
    const docs = items.map((i) =>
      [
        `DOC ${i.id}`,
        `exhibit=${i.exhibitId}`,
        `title=${i.title}`,
        `file=${i.fileName}`,
        `date=${i.dateOfDocument}`,
        `categories=${(i.categories?.length ? i.categories : [i.category]).join("/")}`,
        `people=${(i.people ?? []).join("/")}`,
        `source=${i.sourceType}`,
        `status=${i.status}`,
        `tags=${i.tags.join("/")}`,
        i.affectsAciah ? `affectsAciah=${i.affectsAciah}` : "",
        i.notes ? `notes=${i.notes.slice(0, 400)}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    );
    const evts = events.map((e) =>
      [
        `EVENT ${e.id}`,
        `date=${e.date}`,
        `title=${e.title}`,
        `categories=${(e.categories?.length ? e.categories : [e.category]).join("/")}`,
        `people=${(e.people ?? []).join("/")}`,
        e.effectOnAciah ? `effectOnAciah=${e.effectOnAciah}` : "",
        e.description ? `detail=${e.description.slice(0, 400)}` : "",
        `evidence=${(e.evidenceIds ?? []).join(",")}`,
      ]
        .filter(Boolean)
        .join(" | "),
    );
    const fin = finances.map(
      (f) =>
        `EXPENSE ${f.id} | date=${f.date} | label=${f.label} | amount=${f.amount} ${f.currency} | kind=${f.kind} | evidence=${(f.evidenceIds ?? []).join(",")}`,
    );
    const tsk = tasks.map(
      (t) => `TASK ${t.id} | title=${t.title} | done=${t.done} | owner=${t.assignedTo}`,
    );
    return [...docs, ...evts, ...fin, ...tsk].join("\n");
  }

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      const out = await askEvidence({ data: { question: q.trim(), records: buildRecords() } });
      setAnswer(out);
    } catch (error) {
      setAnswer({
        answer:
          error instanceof Error ? error.message.slice(0, 200) : "Could not search the case records.",
        recordIds: [],
        gaps: [],
      });
    } finally {
      setBusy(false);
    }
  }

  const cited = (answer?.recordIds ?? [])
    .map((id) => items.find((i) => i.id === id))
    .filter((v): v is (typeof items)[number] => Boolean(v));
  const citedEvents = (answer?.recordIds ?? [])
    .map((id) => events.find((e) => e.id === id))
    .filter((v): v is (typeof events)[number] => Boolean(v));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="size-4" /> Ask my evidence
          </DialogTitle>
          <DialogDescription className="text-xs">
            Searches only what is stored in this case. It will never add facts that are not in your
            records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="Show everything about Aciah's mental health since 18 August"
            className="text-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  void ask(s);
                }}
                className="min-h-9 rounded-full border border-border bg-card px-3 text-[11px] text-muted-foreground hover:bg-secondary"
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            className="h-11 w-full"
            disabled={busy || !question.trim()}
            onClick={() => void ask(question)}
          >
            <Search className="size-4" /> {busy ? "Searching your case…" : "Ask"}
          </Button>

          {answer && (
            <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                <Sparkles className="size-3" /> Answer from your records
              </p>
              <p className="text-xs whitespace-pre-wrap text-foreground">{answer.answer}</p>

              {cited.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Documents cited
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {cited.map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            openInspector(i.id);
                          }}
                          className="w-full rounded-md border border-border bg-card p-2 text-left hover:bg-accent/40"
                        >
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {i.exhibitId} · {formatDate(i.dateOfDocument)}
                          </span>
                          <span className="block truncate text-xs text-foreground">{i.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {citedEvents.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Timeline events cited
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {citedEvents.map((e) => (
                      <li key={e.id} className="rounded-md border border-border bg-card p-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatDate(e.date)}
                        </span>
                        <span className="block text-xs text-foreground">{e.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {answer.gaps.length > 0 && (
                <div className="rounded-md border border-warning/50 bg-warning/10 p-2">
                  <p className="text-[11px] font-medium text-foreground">Missing from your case</p>
                  <ul className="mt-1 list-disc pl-4 text-[11px] text-foreground/85">
                    {answer.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
