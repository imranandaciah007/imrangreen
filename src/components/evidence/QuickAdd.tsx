import { useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  CheckSquare,
  Coins,
  Mic,
  MicOff,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EvidencePicker } from "@/components/evidence/EvidencePicker";
import { Textarea } from "@/components/ui/textarea";
import { structureEvent } from "@/lib/ai.functions";
import { useEvidence } from "@/lib/evidence/store";
import {
  EVENT_STATUSES,
  FINANCE_KINDS,
  PEOPLE,
  PROFILES,
  type EventStatus,
  type FinanceKind,
} from "@/lib/evidence/types";

const today = () => new Date().toISOString().slice(0, 10);


export function AddSheet({
  open,
  onOpenChange,
  onUpload,
  onExpense,
  onEvent,
  onTask,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpload: () => void;
  onExpense: () => void;
  onEvent: () => void;
  onTask: () => void;
}) {
  const actions = [
    { label: "Upload evidence", icon: UploadCloud, run: onUpload },
    { label: "Add expense", icon: Coins, run: onExpense },
    { label: "Add hardship event", icon: CalendarPlus, run: onEvent },
    { label: "Add task", icon: CheckSquare, run: onTask },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle className="text-base">Add to the case</SheetTitle>
        </SheetHeader>
        <div className="grid gap-2 px-4 pb-4">
          {actions.map(({ label, icon: Icon, run }) => (
            <Button
              key={label}
              variant="outline"
              className="h-14 justify-start text-sm"
              onClick={() => {
                onOpenChange(false);
                run();
              }}
            >
              <Icon className="mr-2 size-5" /> {label}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addFinance, caseSettings } = useEvidence();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<FinanceKind>("Travel / Flights");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"GBP" | "USD">("GBP");
  const [date, setDate] = useState(today());
  const [recurring, setRecurring] = useState(false);
  const [notes, setNotes] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEvidenceIds([]);
    setLabel("");
    setKind("Travel / Flights");
    setAmount("");
    setCurrency(caseSettings.baseCurrency as "GBP");
    setDate(today());
    setRecurring(false);
    setNotes("");
  }, [open, caseSettings.baseCurrency]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add expense</DialogTitle>
          <DialogDescription className="text-xs">
            Costs caused by the separation, counted from {caseSettings.separationStartDate}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">What was it?</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Return flight London–Boston"
              className="h-11 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "GBP" | "USD")}>
                <SelectTrigger className="h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as FinanceKind)}>
                <SelectTrigger className="h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINANCE_KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 text-xs"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="size-4"
            />
            This repeats every month
          </label>
          <div className="space-y-1.5">
            <Label className="text-xs">Receipt or bank evidence</Label>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-start text-xs"
              onClick={() => setPickerOpen(true)}
            >
              {evidenceIds.length === 0
                ? "Link a receipt or statement (optional)"
                : `${evidenceIds.length} document(s) linked`}
            </Button>
            {evidenceIds.length === 0 && (
              <p className="text-[11px] text-warning-foreground/90">
                No evidence linked yet — link one now or add a task to collect it.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11"
            onClick={() => {
              if (!label.trim() || !Number(amount)) return;
              addFinance({
                date,
                label: label.trim(),
                kind,
                amount: Number(amount),
                currency,
                recurring,
                notes: notes.trim(),
                evidenceIds,
              });
              onOpenChange(false);
            }}
          >
            Save expense
          </Button>
        </DialogFooter>
        <EvidencePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          selected={evidenceIds}
          onChange={setEvidenceIds}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EventDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addEvent, addTask, addFinance, categories, profile } = useEvidence();
  const [sentence, setSentence] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [cats, setCats] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>(["Aciah"]);
  const [description, setDescription] = useState("");
  const [effectOnAciah, setEffectOnAciah] = useState("");
  const [effectOnFamily, setEffectOnFamily] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [status, setStatus] = useState<EventStatus>("Recorded");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"GBP" | "USD">("GBP");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const recognition = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSentence("");
    setMissing([]);
    setEvidenceIds([]);
    setTitle("");
    setDate(today());
    setCats(categories[0] ? [categories[0]] : []);
    setPeople(["Aciah"]);
    setDescription("");
    setEffectOnAciah("");
    setEffectOnFamily("");
    setFollowUp("");
    setStatus("Recorded");
    setAmount("");
    setCurrency("GBP");
  }, [open, categories]);

  function dictate() {
    const w = window as unknown as {
      SpeechRecognition?: new () => never;
      webkitSpeechRecognition?: new () => never;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Dictation is not supported in this browser");
      return;
    }
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor() as unknown as {
      lang: string;
      interimResults: boolean;
      start: () => void;
      stop: () => void;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
    };
    rec.lang = "en-GB";
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i += 1) text += `${e.results[i]![0]!.transcript} `;
      setSentence((prev) => `${prev} ${text}`.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  async function structure() {
    if (!sentence.trim()) return;
    setThinking(true);
    try {
      const out = await structureEvent({
        data: {
          text: sentence.trim(),
          today: today(),
          allowedCategories: categories,
          allowedPeople: [...PEOPLE],
        },
      });
      if (out.title) setTitle(out.title);
      if (out.date && /^\d{4}-\d{2}-\d{2}$/.test(out.date)) setDate(out.date);
      const valid = out.categories.filter((c) => categories.includes(c));
      if (valid.length) setCats(valid);
      if (out.people.length) setPeople(out.people);
      if (out.description) setDescription(out.description);
      if (out.effectOnAciah) setEffectOnAciah(out.effectOnAciah);
      if (out.effectOnFamily) setEffectOnFamily(out.effectOnFamily);
      if (out.followUp) setFollowUp(out.followUp);
      if (out.amount > 0) setAmount(String(out.amount));
      if (out.currency === "USD" || out.currency === "GBP") setCurrency(out.currency);
      setMissing(out.missing);
      toast.success("Turned into an event — check anything highlighted");
    } catch (error) {
      toast.error("Could not read that", {
        description: error instanceof Error ? error.message.slice(0, 140) : undefined,
      });
    } finally {
      setThinking(false);
    }
  }

  function save() {
    if (!title.trim()) return;
    const category = cats[0] ?? categories[0] ?? "Other";
    const money = Number(amount) || 0;
    addEvent({
      date,
      title: title.trim(),
      category,
      categories: cats.length ? cats : [category],
      people,
      description: description.trim(),
      effectOnAciah: effectOnAciah.trim(),
      effectOnFamily: effectOnFamily.trim(),
      followUp: followUp.trim(),
      status,
      financialImpact: money || undefined,
      financialCurrency: money ? currency : undefined,
      evidenceIds,
    });
    if (money > 0) {
      addFinance({
        date,
        label: title.trim(),
        kind: "Other",
        amount: money,
        currency,
        recurring: false,
        notes: "Created from a hardship event",
        evidenceIds,
      });
    }
    if (followUp.trim()) {
      addTask({
        title: followUp.trim(),
        category,
        dueDate: "",
        done: false,
        assignedTo: profile,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add hardship event</DialogTitle>
          <DialogDescription className="text-xs">
            Say or type one sentence and let the app structure it — nothing is invented.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-lg border border-border bg-secondary/40 p-2.5">
            <Label className="text-xs">Describe it in a sentence</Label>
            <Textarea
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              rows={3}
              placeholder="Aciah missed her midwife appointment on 3 Sep because she had no childcare"
              className="text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                className="h-10 text-xs"
                onClick={dictate}
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {listening ? "Stop" : "Dictate"}
              </Button>
              <Button
                type="button"
                className="h-10 text-xs"
                disabled={thinking || !sentence.trim()}
                onClick={() => void structure()}
              >
                <Sparkles className="size-4" /> {thinking ? "Working…" : "Turn into event"}
              </Button>
            </div>
            {missing.length > 0 && (
              <p className="text-[11px] text-warning-foreground/90">
                Not stated in your note — please check: {missing.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">What happened?</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Aciah admitted to A&E with panic attack"
              className="h-11 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EventStatus)}>
                <SelectTrigger className="h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hardship categories</Label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setCats((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                    )
                  }
                  className={`min-h-9 rounded-full border px-3 text-xs ${
                    cats.includes(c)
                      ? "border-navy bg-navy text-navy-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Who was affected?</Label>
            <div className="flex flex-wrap gap-1.5">
              {PEOPLE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setPeople((prev) =>
                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                    )
                  }
                  className={`min-h-9 rounded-full border px-3 text-xs ${
                    people.includes(p)
                      ? "border-navy bg-navy text-navy-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Detail</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Effect on Aciah</Label>
            <Textarea
              value={effectOnAciah}
              onChange={(e) => setEffectOnAciah(e.target.value)}
              rows={2}
              placeholder="The hardship this caused Aciah, as fact"
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Effect on Jibril / family (optional)</Label>
            <Textarea
              value={effectOnFamily}
              onChange={(e) => setEffectOnFamily(e.target.value)}
              rows={2}
              className="text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cost (optional)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "GBP" | "USD")}>
                <SelectTrigger className="h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Follow-up action (optional)</Label>
            <Input
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder="Request GP letter confirming the appointment"
              className="h-11 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Supporting evidence</Label>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-start text-xs"
              onClick={() => setPickerOpen(true)}
            >
              {evidenceIds.length === 0
                ? "Link documents (optional)"
                : `${evidenceIds.length} document(s) linked`}
            </Button>
            {evidenceIds.length === 0 && (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-2">
                <p className="text-[11px] text-foreground">
                  No evidence linked yet — link one now or create a task to collect it.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1.5 h-8 text-[11px]"
                  onClick={() =>
                    addTask({
                      title: title.trim()
                        ? `Collect evidence for: ${title.trim()}`
                        : "Collect supporting evidence",
                      category: cats[0] ?? "",
                      dueDate: "",
                      done: false,
                      assignedTo: profile,
                    })
                  }
                >
                  Create task to collect it
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" onClick={save}>
            Save event
          </Button>
        </DialogFooter>
        <EvidencePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          selected={evidenceIds}
          onChange={setEvidenceIds}
        />
      </DialogContent>
    </Dialog>
  );
}


export function TaskDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addTask, categories, profile } = useEvidence();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>(profile);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDueDate("");
    setCategory("");
    setAssignedTo(profile);
  }, [open, profile]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add task</DialogTitle>
          <DialogDescription className="text-xs">
            Something to chase — a letter to request, a record to order.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Task</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Request GP letter for Aciah"
              className="h-11 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Due</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owner</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFILES.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category (optional)</Label>
            <Select
              value={category || "none"}
              onValueChange={(v) => setCategory(v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-11 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  None
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-11"
            onClick={() => {
              if (!title.trim()) return;
              addTask({ title: title.trim(), dueDate, category, assignedTo, done: false });
              onOpenChange(false);
            }}
          >
            Save task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
