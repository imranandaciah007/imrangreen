import { useEffect, useState } from "react";
import { CalendarPlus, CheckSquare, Coins, UploadCloud } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { useEvidence } from "@/lib/evidence/store";
import { FINANCE_KINDS, PEOPLE, PROFILES, type FinanceKind } from "@/lib/evidence/types";

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

  useEffect(() => {
    if (!open) return;
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
                evidenceIds: [],
              });
              onOpenChange(false);
            }}
          >
            Save expense
          </Button>
        </DialogFooter>
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
  const { addEvent, categories } = useEvidence();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState(categories[0] ?? "Other");
  const [people, setPeople] = useState<string[]>(["Aciah"]);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(today());
    setCategory(categories[0] ?? "Other");
    setPeople(["Aciah"]);
    setDescription("");
  }, [open, categories]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add hardship event</DialogTitle>
          <DialogDescription className="text-xs">
            Something that happened and its effect — a missed appointment, a hospital visit, a
            cancelled trip.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              rows={4}
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
              if (!title.trim()) return;
              addEvent({
                date,
                title: title.trim(),
                category,
                people,
                description: description.trim(),
                evidenceIds: [],
              });
              onOpenChange(false);
            }}
          >
            Save event
          </Button>
        </DialogFooter>
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
