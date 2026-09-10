import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { extractDocument } from "@/lib/ai.functions";
import {
  generateCloneDocument,
  listDriveTree,
  type DriveFileNode,
  type DriveFolderNode,
} from "@/lib/drive-tree.functions";
import type { DiaryPlan } from "./diary-merge";
import { classifyDriveFile, fileTypeFor, titleFromName } from "./drive-classify";
import { documentProvider, type ProviderConnection } from "./provider";
import { defaultReminderAt } from "../task-reminders";
import {
  categoryCoverage,
  detectGaps,
  detectDiaryGaps,
  type CaseGap,
  type CategoryCoverage,
} from "./review";

import {
  CASE_SETTINGS,
  DEFAULT_CATEGORIES,
  DEFAULT_INCOME,
  EXPENSE_CATEGORIES,
  PEOPLE,
  READY_STATUSES,
  SOURCE_TYPES,
  taskStatus,
  type CaseTask,
  type Category,
  type DiaryImport,
  type DiarySource,
  type ExpenseCategory,
  type EvidenceItem,
  type EvidenceStatus,
  type FinancialEntry,
  type HardshipEvent,
  type PacketVersion,
  type IncomeSettings,
  type Profile,
  type SourceType,
  type Tag,
} from "./types";

export type SortKey =
  "exhibitId" | "title" | "category" | "status" | "pageCount" | "dateOfDocument" | "fileSizeBytes";

export interface Filters {
  query: string;
  categories: Category[];
  statuses: EvidenceStatus[];
  tags: Tag[];
  exhibitGroups: string[];
  translationOnly: boolean;
}

const emptyFilters: Filters = {
  query: "",
  categories: [],
  statuses: [],
  tags: [],
  exhibitGroups: [],
  translationOnly: false,
};

type NewRecord<T> = Omit<T, "id" | "createdBy" | "lastEditedBy" | "createdAt" | "updatedAt">;

interface EvidenceContextValue {
  loading: boolean;
  profile: Profile;
  setProfile: (p: Profile) => void;
  profileChosen: boolean;
  caseSettings: typeof CASE_SETTINGS;

  items: EvidenceItem[];
  filtered: EvidenceItem[];
  filters: Filters;
  setFilters: (next: Partial<Filters>) => void;
  resetFilters: () => void;
  sort: { key: SortKey; dir: "asc" | "desc" };
  toggleSort: (key: SortKey) => void;
  selectedIds: string[];
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  clearSelected: () => void;
  inspectorId: string | null;
  openInspector: (id: string | null) => void;
  updateItem: (id: string, patch: Partial<EvidenceItem>, message?: string) => void;
  addItem: (
    draft: Omit<
      EvidenceItem,
      "id" | "auditTrail" | "createdBy" | "lastEditedBy" | "createdAt" | "updatedAt"
    >,
    file?: File,
  ) => Promise<EvidenceItem>;
  /** Bulk-import drafts (e.g. from a Drive sync); skips items whose driveFileId already exists. */
  importItems: (
    drafts: Omit<
      EvidenceItem,
      "id" | "auditTrail" | "createdBy" | "lastEditedBy" | "createdAt" | "updatedAt"
    >[],
  ) => Promise<{ added: number; skipped: number }>;
  bulkUpdate: (patch: Partial<EvidenceItem>, message: string) => void;
  /** Set every document to Ready in one action. */
  markAllReady: () => void;
  bulkAssignPrefix: (prefix: string) => void;
  bulkAddTag: (tag: Tag) => void;
  bulkMoveCategory: (category: Category) => void;
  deleteItem: (id: string) => void;
  bulkDelete: () => void;

  categories: Category[];
  addCategory: (name: string) => void;
  renameCategory: (from: string, to: string) => void;
  deleteCategory: (name: string) => void;

  events: HardshipEvent[];
  addEvent: (draft: NewRecord<HardshipEvent>) => void;
  updateEvent: (id: string, patch: Partial<HardshipEvent>) => void;
  deleteEvent: (id: string) => void;
  finances: FinancialEntry[];
  addFinance: (draft: NewRecord<FinancialEntry>) => FinancialEntry;
  income: IncomeSettings;
  updateIncome: (patch: Partial<IncomeSettings>) => void;
  /** Converts an amount into GBP and USD using the stored rate. */
  convert: (amount: number, currency: "GBP" | "USD") => { gbp: number; usd: number; rate: number };
  updateFinance: (id: string, patch: Partial<FinancialEntry>) => void;
  deleteFinance: (id: string) => void;
  tasks: CaseTask[];
  addTask: (draft: NewRecord<CaseTask>) => void;
  updateTask: (id: string, patch: Partial<CaseTask>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;

  /** Organisation gaps and hardship-coverage labels (never legal predictions). */
  gaps: CaseGap[];
  coverage: CategoryCoverage[];

  /** AI text-extraction run for one document (two-pass verification). */
  runExtraction: (id: string) => Promise<void>;
  runExtractionForSelected: () => Promise<void>;
  extractingIds: string[];
  confirmExtractionField: (id: string, field: string, value: string) => void;
  dismissExtractionField: (id: string, field: string) => void;
  resolveConflict: (id: string, field: string, accept: boolean) => void;

  /** Hardship Diary master import (Prompt 6). */
  diaryImports: DiaryImport[];
  applyDiaryImport: (args: {
    fileName: string;
    fileSizeBytes: number;
    pagesAnalysed: number;
    chunkHashes: string[];
    plan: DiaryPlan;
    acceptEventKeys: string[];
    acceptFinanceKeys: string[];
    masterEvidenceId?: string | undefined;
    createTasksForMissing: boolean;
  }) => DiaryImport;

  /** Case packet builder (Prompt 5). */
  packets: PacketVersion[];
  togglePacketExclusion: (id: string) => void;
  savePacketVersion: (
    record: Omit<PacketVersion, "id" | "version" | "generatedAt" | "generatedBy">,
  ) => PacketVersion;

  connection: ProviderConnection | null;
  connectDrive: (config: { apiKey?: string; folderPath?: string; accountLabel?: string }) => void;
  driveTree: { folders: DriveFolderNode[]; files: DriveFileNode[]; syncedAt: string } | null;
  driveSyncing: boolean;
  syncDrive: () => Promise<{ added: number; updated: number; removed: number; folders: number; files: number }>;
  /** Reads every Drive document with AI, then builds its detailed clone PDF. */
  scanAllDocuments: (opts?: { rescanAll?: boolean }) => Promise<{
    scanned: number;
    cloned: number;
    failed: number;
    total: number;
  }>;
  scanProgress: ScanProgress;
  exhibitGroups: string[];
  stats: {
    total: number;
    ready: number;
    needsConfirmation: number;
    gaps: number;
    missingTranslation: number;
    totalPages: number;
    openTasks: number;
    timelineEvents: number;
    financialImpact: number;
    lastEditedAt: string | null;
    byCategory: { category: Category; total: number; ready: number; percent: number }[];
  };
}

export interface ScanProgress {
  running: boolean;
  phase: string;
  done: number;
  total: number;
  scanned: number;
  cloned: number;
  failed: number;
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

function nowIso() {
  return new Date().toISOString();
}

function rid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function groupOf(exhibitId: string) {
  const match = /Exhibit\s+([A-Z]+)/i.exec(exhibitId);
  return match ? match[1]!.toUpperCase() : "—";
}

/** Fingerprint used to recognise the same document stored in more than one folder. */
function contentKeyOf(fileName: string, size: number | undefined, mimeType: string | undefined) {
  return `${fileName.trim().toLowerCase()}|${size ?? 0}|${mimeType ?? ""}`;
}

const PROFILE_KEY = "i601.profile";
const DRIVE_TREE_KEY = "gc.driveTree";

const EXPENSE_CATEGORY_SET = new Set<string>(EXPENSE_CATEGORIES);

export function EvidenceStoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ProviderConnection | null>(null);
  const [filters, setFiltersState] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "dateOfDocument",
    dir: "desc",
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [hiddenCategories, setHiddenCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<HardshipEvent[]>([]);
  const [finances, setFinances] = useState<FinancialEntry[]>([]);
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [income, setIncome] = useState<IncomeSettings>(DEFAULT_INCOME);
  const [profile, setProfileState] = useState<Profile>("Imran");
  const [profileChosen, setProfileChosen] = useState(false);
  const [extractingIds, setExtractingIds] = useState<string[]>([]);
  const [packets, setPackets] = useState<PacketVersion[]>([]);
  const [diaryImports, setDiaryImports] = useState<DiaryImport[]>([]);
  const [driveTree, setDriveTree] = useState<{
    folders: DriveFolderNode[];
    files: DriveFileNode[];
    syncedAt: string;
  } | null>(null);
  const [driveSyncing, setDriveSyncing] = useState(false);
  const [autoSyncNonce, setAutoSyncNonce] = useState(0);
  const hydrated = useRef(false);
  const driveSyncInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, conn, records] = await Promise.all([
        documentProvider.list(),
        documentProvider.getConnection(),
        documentProvider.loadRecords(),
      ]);
      if (cancelled) return;
      setItems(list);
      setConnection(conn);
      setEvents(records.events ?? []);
      setFinances(records.finances ?? []);
      setTasks(records.tasks ?? []);
      setPackets(records.packets ?? []);
      setDiaryImports(records.diaryImports ?? []);
      setIncome({ ...DEFAULT_INCOME, ...(records.income ?? {}) });
      setCustomCategories(
        (records.categories ?? []).filter((c) => !DEFAULT_CATEGORIES.includes(c)),
      );
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem(PROFILE_KEY) : null;
      if (saved === "Imran" || saved === "Aciah") {
        setProfileState(saved);
        setProfileChosen(true);
      }
      if (typeof localStorage !== "undefined") {
        try {
          const cachedTree = localStorage.getItem(DRIVE_TREE_KEY);
          if (cachedTree) setDriveTree(JSON.parse(cachedTree));
        } catch {
          localStorage.removeItem(DRIVE_TREE_KEY);
        }
      }
      hydrated.current = true;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    void documentProvider.saveRecords({
      events,
      finances,
      tasks,
      categories: customCategories,
      income,
      packets,
      diaryImports,
    });
  }, [events, finances, tasks, customCategories, income, packets, diaryImports]);

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    setProfileChosen(true);
    if (typeof localStorage !== "undefined") localStorage.setItem(PROFILE_KEY, p);
  }, []);

  const auditEntry = useCallback(
    (action: string) => ({ id: rid("audit"), at: nowIso(), actor: profile, action }),
    [profile],
  );

  const setFilters = useCallback((next: Partial<Filters>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }, []);
  const resetFilters = useCallback(() => setFiltersState(emptyFilters), []);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const clearSelected = useCallback(() => setSelectedIds([]), []);

  const applyPatch = useCallback(
    (ids: string[], patch: Partial<EvidenceItem>, action: string) => {
      const stamped = { ...patch, lastEditedBy: profile, updatedAt: nowIso() };
      setItems((prev) =>
        prev.map((item) =>
          ids.includes(item.id)
            ? { ...item, ...stamped, auditTrail: [...item.auditTrail, auditEntry(action)] }
            : item,
        ),
      );
      void documentProvider.updateMany(ids, stamped);
    },
    [auditEntry, profile],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<EvidenceItem>, message?: string) => {
      const action = message ?? `Updated ${Object.keys(patch).join(", ")}`;
      applyPatch([id], patch, action);
      if (message) toast.success(message);
    },
    [applyPatch],
  );

  const addItem = useCallback(
    async (
      draft: Omit<
        EvidenceItem,
        "id" | "auditTrail" | "createdBy" | "lastEditedBy" | "createdAt" | "updatedAt"
      >,
      file?: File,
    ) => {
      const now = nowIso();
      const created = await documentProvider.create(
        { ...draft, createdBy: profile, lastEditedBy: profile, createdAt: now, updatedAt: now },
        file,
      );
      setItems((prev) => [...prev, created]);
      setAutoSyncNonce((n) => n + 1);
      toast.success(`${created.exhibitId} added`, { description: created.title });
      return created;
    },
    [profile],
  );

  const importItems = useCallback(
    async (
      drafts: Omit<
        EvidenceItem,
        "id" | "auditTrail" | "createdBy" | "lastEditedBy" | "createdAt" | "updatedAt"
      >[],
    ) => {
      const existing = new Set(
        items.map((i) => i.driveFileId).filter((v): v is string => Boolean(v)),
      );
      const fresh = drafts.filter((d) => !d.driveFileId || !existing.has(d.driveFileId));
      const skipped = drafts.length - fresh.length;
      const now = nowIso();
      const createdBatch: EvidenceItem[] = [];
      for (const draft of fresh) {
        const created = await documentProvider.create({
          ...draft,
          createdBy: profile,
          lastEditedBy: profile,
          createdAt: now,
          updatedAt: now,
        });
        createdBatch.push(created);
      }
      if (createdBatch.length) setItems((prev) => [...prev, ...createdBatch]);
      const conn = await documentProvider.getConnection();
      setConnection({ ...conn, connected: true, lastSyncedAt: now });
      return { added: createdBatch.length, skipped };
    },
    [items, profile],
  );

  const markAllReady = useCallback(() => {
    const ids = items.map((i) => i.id);
    if (!ids.length) {
      toast.info("There are no documents to update yet.");
      return;
    }
    applyPatch(ids, { status: "Ready" }, "Marked as Ready");
    toast.success(`Marked ${ids.length} document${ids.length === 1 ? "" : "s"} as Ready`);
  }, [applyPatch, items]);

  const bulkUpdate = useCallback(
    (patch: Partial<EvidenceItem>, message: string) => {
      if (selectedIds.length === 0) {
        toast.error("Select at least one exhibit first");
        return;
      }
      applyPatch(selectedIds, patch, message);
      toast.success(`${message} · ${selectedIds.length} item(s)`);
    },
    [applyPatch, selectedIds],
  );

  const bulkMoveCategory = useCallback(
    (category: Category) => {
      if (selectedIds.length === 0) {
        toast.error("Select at least one exhibit first");
        return;
      }
      applyPatch(selectedIds, { category, categories: [category] }, `Moved to ${category}`);
      toast.success(`Moved ${selectedIds.length} item(s) to ${category}`);
    },
    [applyPatch, selectedIds],
  );

  const bulkAssignPrefix = useCallback(
    (prefix: string) => {
      if (selectedIds.length === 0) {
        toast.error("Select at least one exhibit first");
        return;
      }
      setItems((prev) => {
        let n = 0;
        return prev.map((item) => {
          if (!selectedIds.includes(item.id)) return item;
          n += 1;
          const exhibitId = `Exhibit ${prefix.toUpperCase()}-${n}`;
          return {
            ...item,
            exhibitId,
            lastEditedBy: profile,
            updatedAt: nowIso(),
            auditTrail: [...item.auditTrail, auditEntry(`Re-numbered to ${exhibitId}`)],
          };
        });
      });
      toast.success(
        `Re-numbered ${selectedIds.length} item(s) under prefix ${prefix.toUpperCase()}`,
      );
    },
    [auditEntry, profile, selectedIds],
  );

  const bulkAddTag = useCallback(
    (tag: Tag) => {
      if (selectedIds.length === 0) {
        toast.error("Select at least one exhibit first");
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          selectedIds.includes(item.id) && !item.tags.includes(tag)
            ? {
                ...item,
                tags: [...item.tags, tag],
                lastEditedBy: profile,
                updatedAt: nowIso(),
                auditTrail: [...item.auditTrail, auditEntry(`Tagged ${tag}`)],
              }
            : item,
        ),
      );
      toast.success(`Tagged ${selectedIds.length} item(s) with ${tag}`);
    },
    [auditEntry, profile, selectedIds],
  );

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id);
      if (gone) toast.success(`${gone.exhibitId} deleted`, { description: gone.title });
      return prev.filter((i) => i.id !== id);
    });
    setSelectedIds((prev) => prev.filter((s) => s !== id));
    setInspectorId((prev) => (prev === id ? null : prev));
    void documentProvider.remove([id]);
  }, []);

  const bulkDelete = useCallback(() => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one exhibit first");
      return;
    }
    const ids = [...selectedIds];
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setSelectedIds([]);
    setInspectorId((prev) => (prev && ids.includes(prev) ? null : prev));
    void documentProvider.remove(ids);
    toast.success(`${ids.length} item(s) deleted`);
  }, [selectedIds]);

  const categories = useMemo(() => {
    const set = new Set<Category>([
      ...DEFAULT_CATEGORIES,
      ...customCategories,
      ...items.map((i) => i.category),
    ]);
    const used = new Set(items.map((i) => i.category));
    return Array.from(set).filter((c) => used.has(c) || !hiddenCategories.includes(c));
  }, [customCategories, hiddenCategories, items]);

  const addCategory = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      if (categories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
        toast.error(`"${clean}" already exists`);
        return;
      }
      setCustomCategories((prev) => [...prev, clean]);
      setHiddenCategories((prev) => prev.filter((c) => c !== clean));
      toast.success(`Category "${clean}" added`);
    },
    [categories],
  );

  const renameCategory = useCallback(
    (from: string, to: string) => {
      const clean = to.trim();
      if (!clean || clean === from) return;
      setCustomCategories((prev) => [...prev.filter((c) => c !== from), clean]);
      setHiddenCategories((prev) => (prev.includes(from) ? prev : [...prev, from]));
      setItems((prev) =>
        prev.map((item) =>
          item.category === from
            ? {
                ...item,
                category: clean,
                categories: (item.categories ?? [from]).map((c) => (c === from ? clean : c)),
                lastEditedBy: profile,
                updatedAt: nowIso(),
                auditTrail: [...item.auditTrail, auditEntry(`Category renamed to ${clean}`)],
              }
            : item,
        ),
      );
      setFiltersState((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c === from ? clean : c)),
      }));
      toast.success(`Category renamed to "${clean}"`);
    },
    [auditEntry, profile],
  );

  const deleteCategory = useCallback(
    (name: string) => {
      const used = items.filter((i) => i.category === name).length;
      if (used > 0) {
        toast.error(`"${name}" still holds ${used} document(s)`, {
          description: "Move or delete those documents first.",
        });
        return;
      }
      setCustomCategories((prev) => prev.filter((c) => c !== name));
      setHiddenCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setFiltersState((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c !== name),
      }));
      toast.success(`Category "${name}" removed`);
    },
    [items],
  );

  const stamp = useCallback(
    <T,>(draft: T) => ({
      ...draft,
      createdBy: profile,
      lastEditedBy: profile,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }),
    [profile],
  );

  const addEvent = useCallback(
    (draft: NewRecord<HardshipEvent>) => {
      setEvents((prev) => [...prev, { ...stamp(draft), id: rid("evt") }]);
      toast.success("Hardship event added", { description: draft.title });
    },
    [stamp],
  );
  const updateEvent = useCallback(
    (id: string, patch: Partial<HardshipEvent>) => {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, ...patch, lastEditedBy: profile, updatedAt: nowIso() } : e,
        ),
      );
    },
    [profile],
  );
  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    toast.success("Event deleted");
  }, []);

  const convert = useCallback(
    (amount: number, currency: "GBP" | "USD") => {
      const rate = income.usdToGbp || DEFAULT_INCOME.usdToGbp;
      return currency === "USD"
        ? { gbp: amount * rate, usd: amount, rate }
        : { gbp: amount, usd: rate ? amount / rate : amount, rate };
    },
    [income.usdToGbp],
  );

  const addFinance = useCallback(
    (draft: NewRecord<FinancialEntry>) => {
      const conv = convert(draft.amount, draft.currency);
      const enriched: NewRecord<FinancialEntry> = {
        ...draft,
        gbpEquivalent: draft.gbpEquivalent ?? Math.round(conv.gbp * 100) / 100,
        usdEquivalent: draft.usdEquivalent ?? Math.round(conv.usd * 100) / 100,
        exchangeRate: draft.exchangeRate ?? conv.rate,
        exchangeRateDate: draft.exchangeRateDate ?? (income.rateDate || nowIso().slice(0, 10)),
        exchangeRateSource: draft.exchangeRateSource ?? income.rateSource,
        status:
          draft.status ??
          ((draft.evidenceIds ?? []).length === 0 ? "Missing receipt" : "Needs confirmation"),
      };
      // The same real-world transfer may be proved by several documents — link, never duplicate.
      const twin = enriched.transferKey
        ? finances.find((f) => f.transferKey === enriched.transferKey)
        : undefined;
      if (twin) {
        const merged = Array.from(
          new Set([...(twin.evidenceIds ?? []), ...(enriched.evidenceIds ?? [])]),
        );
        setFinances((prev) =>
          prev.map((f) =>
            f.id === twin.id
              ? {
                  ...f,
                  evidenceIds: merged,
                  status: merged.length ? "Verified" : f.status,
                  lastEditedBy: profile,
                  updatedAt: nowIso(),
                }
              : f,
          ),
        );
        toast.info("Already recorded — evidence linked to the existing transaction", {
          description: `${twin.label} · counted once`,
        });
        return { ...twin, evidenceIds: merged };
      }
      const created = { ...stamp(enriched), id: rid("fin") } as FinancialEntry;
      setFinances((prev) => [...prev, created]);
      toast.success("Expense recorded", { description: draft.label });
      return created;
    },
    [convert, finances, income.rateDate, income.rateSource, profile, stamp],
  );

  const updateIncome = useCallback(
    (patch: Partial<IncomeSettings>) => {
      setIncome((prev) => ({ ...prev, ...patch, updatedAt: nowIso(), updatedBy: profile }));
    },
    [profile],
  );
  const updateFinance = useCallback(
    (id: string, patch: Partial<FinancialEntry>) => {
      setFinances((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, ...patch, lastEditedBy: profile, updatedAt: nowIso() } : f,
        ),
      );
    },
    [profile],
  );
  const deleteFinance = useCallback((id: string) => {
    setFinances((prev) => prev.filter((f) => f.id !== id));
    toast.success("Expense deleted");
  }, []);

  const addTask = useCallback(
    (draft: NewRecord<CaseTask>) => {
      setTasks((prev) => [
        ...prev,
        {
          ...stamp({ status: "To do", priority: "Normal", ...draft }),
          reminderAt: draft.reminderAt ?? defaultReminderAt(draft.dueDate),
          id: rid("task"),
        },
      ]);
      toast.success("Task added", { description: draft.title });
    },
    [stamp],
  );
  const updateTask = useCallback(
    (id: string, patch: Partial<CaseTask>) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...patch, lastEditedBy: profile, updatedAt: nowIso() };
          if (patch.status) next.done = patch.status === "Complete";
          return next;
        }),
      );
    },
    [profile],
  );
  const toggleTask = useCallback(
    (id: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const done = !t.done;
          return {
            ...t,
            done,
            status: done ? "Complete" : "To do",
            lastEditedBy: profile,
            updatedAt: nowIso(),
          };
        }),
      );
    },
    [profile],
  );
  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const runOne = useCallback(
    async (item: EvidenceItem, categoryList: Category[]) => {
      const result = await extractDocument({
        data: {
          driveFileId: item.driveFileId ?? "",
          fileName: item.fileName,
          mimeType: item.mimeType ?? "application/pdf",
          allowedCategories: categoryList,
          allowedPeople: [...PEOPLE],
          allowedSourceTypes: [...SOURCE_TYPES],
          knownTitle: item.title,
        },
      });

      const patch: Partial<EvidenceItem> = {};
      const applied: string[] = [];
      const a = result.agreed;
      if (a.title) {
        patch.title = a.title;
        applied.push("title");
      }
      if (a.documentDate && /^\d{4}-\d{2}-\d{2}$/.test(a.documentDate)) {
        patch.dateOfDocument = a.documentDate;
        applied.push("date");
      }
      if (a.people?.length) {
        patch.people = a.people;
        applied.push("people");
      }
      if (a.categories?.length) {
        const valid = a.categories.filter((c) => categoryList.includes(c));
        if (valid.length) {
          patch.categories = valid;
          patch.category = valid[0]!;
          applied.push("categories");
        }
      }
      if (a.sourceType && (SOURCE_TYPES as readonly string[]).includes(a.sourceType)) {
        patch.sourceType = a.sourceType as SourceType;
        applied.push("source type");
      }
      if (a.pageCount && a.pageCount > 0) {
        patch.pageCount = a.pageCount;
        applied.push("pages");
      }
      // Human-confirmed values win: never silently overwrite them.
      const confirmed = item.confirmedFields ?? [];
      const conflicts = [...(item.aiConflicts ?? [])];
      const guard = (field: string, key: keyof EvidenceItem, aiValue: unknown) => {
        if (!confirmed.includes(field)) return;
        const existing = String(item[key] ?? "");
        const incoming = Array.isArray(aiValue) ? aiValue.join(", ") : String(aiValue ?? "");
        delete patch[key];
        if (incoming && incoming !== existing) {
          conflicts.push({ field, existing, aiValue: incoming, ranAt: result.ranAt });
        }
      };
      guard("title", "title", a.title);
      guard("documentDate", "dateOfDocument", a.documentDate);
      guard("people", "people", a.people);
      guard("categories", "categories", a.categories);
      guard("sourceType", "sourceType", a.sourceType);
      guard("pageCount", "pageCount", a.pageCount);
      if (conflicts.length) patch.aiConflicts = conflicts;

      patch.aiExtraction = {
        ranAt: result.ranAt,
        contentRead: result.contentRead,
        summary: result.summary,
        language: result.language,
        applied,
        uncertain: result.uncertain,
        passes: result.passes as unknown as Record<string, unknown>[] | undefined,
      };
      patch.status =
        result.uncertain.length > 0 || conflicts.length > (item.aiConflicts?.length ?? 0)
          ? "Needs confirmation"
          : "Reviewed";

      if (result.summary && !item.notes.trim()) patch.notes = result.summary;

      applyPatch(
        [item.id],
        patch,
        result.uncertain.length
          ? `AI read the document — ${result.uncertain.length} field(s) need confirmation`
          : "AI read the document — verified by double scan",
      );
      return result;
    },
    [applyPatch],
  );

  const runExtraction = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      setExtractingIds((prev) => [...prev, id]);
      applyPatch([id], { status: "AI processing" }, "AI read started");
      try {
        const result = await runOne(item, categories);
        if (result.uncertain.length) {
          toast.warning(`${result.uncertain.length} field(s) need your confirmation`, {
            description: item.fileName,
          });
        } else {
          toast.success("Verified by double scan", { description: item.fileName });
        }
      } catch (error) {
        applyPatch([id], { status: "Needs confirmation" }, "AI read failed");
        toast.error("AI read failed", {
          description: error instanceof Error ? error.message.slice(0, 160) : "Please try again.",
        });
      } finally {
        setExtractingIds((prev) => prev.filter((x) => x !== id));
      }
    },
    [applyPatch, categories, items, runOne],
  );

  const runExtractionForSelected = useCallback(async () => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one document first");
      return;
    }
    const queue = items.filter((i) => selectedIds.includes(i.id));
    toast.info(`Reading ${queue.length} document(s) with AI…`);
    let ok = 0;
    let needs = 0;
    for (const item of queue) {
      setExtractingIds((prev) => [...prev, item.id]);
      try {
        const result = await runOne(item, categories);
        ok += 1;
        if (result.uncertain.length) needs += 1;
      } catch {
        applyPatch([item.id], { status: "Needs confirmation" }, "AI read failed");
      } finally {
        setExtractingIds((prev) => prev.filter((x) => x !== item.id));
      }
    }
    toast.success(`AI read ${ok} document(s)`, {
      description: needs ? `${needs} need your confirmation` : "All verified by double scan",
    });
  }, [applyPatch, categories, items, runOne, selectedIds]);

  // ---- Deep scan: read every document, then build its detailed clone --------
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const scanInFlight = useRef(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    running: false,
    phase: "",
    done: 0,
    total: 0,
    scanned: 0,
    cloned: 0,
    failed: 0,
  });

  const scanAllDocuments = useCallback(
    async (opts?: { rescanAll?: boolean }) => {
      const rescan = opts?.rescanAll ?? false;
      if (scanInFlight.current) return { scanned: 0, cloned: 0, failed: 0, total: 0 };
      const queue = itemsRef.current.filter(
        (item) =>
          item.driveFileId &&
          (rescan || !item.aiExtraction?.contentRead || !item.cloneFileId),
      );
      if (!queue.length) {
        setScanProgress({ running: false, phase: "", done: 0, total: 0, scanned: 0, cloned: 0, failed: 0 });
        return { scanned: 0, cloned: 0, failed: 0, total: 0 };
      }
      scanInFlight.current = true;
      let scanned = 0;
      let cloned = 0;
      let failed = 0;
      let done = 0;
      setScanProgress({
        running: true,
        phase: `Reading ${queue.length} document(s)`,
        done: 0,
        total: queue.length,
        scanned: 0,
        cloned: 0,
        failed: 0,
      });
      try {
        for (const item of queue) {
          let latest = item;
          try {
            if (rescan || !item.aiExtraction?.contentRead) {
              setExtractingIds((prev) => [...prev, item.id]);
              setScanProgress((prev) => ({ ...prev, phase: `Reading ${item.fileName}` }));
              try {
                const result = await runOne(item, categories);
                const a = result.agreed;
                const validCategories = (a.categories ?? []).filter((c) =>
                  categories.includes(c as Category),
                ) as Category[];
                latest = {
                  ...item,
                  title: a.title || item.title,
                  dateOfDocument:
                    a.documentDate && /^\d{4}-\d{2}-\d{2}$/.test(a.documentDate)
                      ? a.documentDate
                      : item.dateOfDocument,
                  people: a.people?.length ? a.people : item.people,
                  categories: validCategories.length ? validCategories : item.categories,
                  pageCount: a.pageCount && a.pageCount > 0 ? a.pageCount : item.pageCount,
                  notes: item.notes || result.summary || item.notes,
                };
                scanned += 1;
              } finally {
                setExtractingIds((prev) => prev.filter((x) => x !== item.id));
              }
            }

            if (rescan || !latest.cloneFileId) {
              setScanProgress((prev) => ({ ...prev, phase: `Building clone for ${latest.exhibitId}` }));
              const clone = await generateCloneDocument({
                data: {
                  driveFileId: latest.driveFileId,
                  fileName: latest.fileName,
                  folderPath: latest.driveFolder ?? "",
                  mimeType: latest.mimeType,
                  meta: {
                    exhibitId: latest.exhibitId,
                    title: latest.title,
                    documentDate: latest.dateOfDocument,
                    person: latest.people?.[0] ?? "Aciah",
                    categories: latest.categories ?? [],
                    people: latest.people ?? [],
                    sourceType: latest.sourceType ?? "",
                    status: latest.status ?? "",
                    summary: latest.aiExtraction?.summary || latest.notes || "",
                    tags: latest.tags ?? [],
                    affectsAciah: latest.affectsAciah,
                    addedBy: profile,
                  },
                },
              });
              applyPatch(
                [item.id],
                {
                  cloneFileId: clone.id,
                  cloneUrl: clone.webViewLink,
                  cloneFileName: clone.name,
                  cloneGeneratedAt: nowIso(),
                },
                `Detailed clone generated — ${clone.name}`,
              );
              cloned += 1;
            }
          } catch {
            failed += 1;
          } finally {
            done += 1;
            setScanProgress((prev) => ({ ...prev, done, scanned, cloned, failed }));
          }
        }
      } finally {
        scanInFlight.current = false;
        setScanProgress((prev) => ({ ...prev, running: false, phase: "" }));
      }
      return { scanned, cloned, failed, total: queue.length };
    },
    [applyPatch, categories, profile, runOne],
  );


  const applyConfirmed = useCallback((item: EvidenceItem, field: string, value: string) => {
    const patch: Partial<EvidenceItem> = {};
    if (field === "title") patch.title = value;
    if (field === "documentDate") patch.dateOfDocument = value;
    if (field === "sourceType" && (SOURCE_TYPES as readonly string[]).includes(value))
      patch.sourceType = value as SourceType;
    if (field === "pageCount") patch.pageCount = Math.max(1, Number(value) || 1);
    if (field === "people")
      patch.people = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    if (field === "categories") {
      const list = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (list.length) {
        patch.categories = list;
        patch.category = list[0]!;
      }
    }
    return patch;
  }, []);

  const resolveField = useCallback(
    (id: string, field: string, value: string | null) => {
      const item = items.find((i) => i.id === id);
      if (!item?.aiExtraction) return;
      const remaining = item.aiExtraction.uncertain.filter((u) => u.field !== field);
      const patch: Partial<EvidenceItem> = value ? applyConfirmed(item, field, value) : {};
      patch.aiExtraction = {
        ...item.aiExtraction,
        uncertain: remaining,
        applied: value
          ? [...item.aiExtraction.applied, `${field} (confirmed)`]
          : item.aiExtraction.applied,
      };
      if (value) {
        patch.confirmedFields = Array.from(new Set([...(item.confirmedFields ?? []), field]));
      }
      if (remaining.length === 0 && item.status === "Needs confirmation") patch.status = "Reviewed";
      applyPatch([id], patch, value ? `Confirmed ${field}: ${value}` : `Left ${field} as it was`);
    },
    [applyConfirmed, applyPatch, items],
  );

  const confirmExtractionField = useCallback(
    (id: string, field: string, value: string) => resolveField(id, field, value),
    [resolveField],
  );
  const dismissExtractionField = useCallback(
    (id: string, field: string) => resolveField(id, field, null),
    [resolveField],
  );

  /** Keep the human-confirmed value, or accept the AI's value after review. */
  const resolveConflict = useCallback(
    (id: string, field: string, accept: boolean) => {
      const item = items.find((i) => i.id === id);
      const conflict = item?.aiConflicts?.find((c) => c.field === field);
      if (!item || !conflict) return;
      const patch: Partial<EvidenceItem> = accept
        ? applyConfirmed(item, field, conflict.aiValue)
        : {};
      patch.aiConflicts = (item.aiConflicts ?? []).filter((c) => c.field !== field);
      patch.confirmedFields = Array.from(new Set([...(item.confirmedFields ?? []), field]));
      applyPatch([id], patch, accept ? `Accepted AI value for ${field}` : `Kept existing ${field}`);
    },
    [applyConfirmed, applyPatch, items],
  );

  /**
   * Write an approved hardship-diary import into the case. Existing records are only
   * enriched with information they are missing; nothing is replaced or deleted, and
   * every created record keeps its diary page provenance.
   */
  const applyDiaryImport = useCallback(
    (args: {
      fileName: string;
      fileSizeBytes: number;
      pagesAnalysed: number;
      chunkHashes: string[];
      plan: DiaryPlan;
      acceptEventKeys: string[];
      acceptFinanceKeys: string[];
      masterEvidenceId?: string | undefined;
      createTasksForMissing: boolean;
    }) => {
      const importId = rid("diary");
      const importedAt = nowIso();
      const source = (
        pages: number[],
        passage: string,
        appendixRefs: string[],
        passes?: Record<string, unknown>[],
      ): DiarySource => ({
        master: "Hardship Diary",
        importId,
        fileName: args.fileName,
        pages,
        passage,
        appendixRefs,
        importedAt,
        passes,
        narrativeOnly: true,
      });

      const acceptEvents = new Set(args.acceptEventKeys);
      const acceptFinances = new Set(args.acceptFinanceKeys);

      const newEvents: HardshipEvent[] = [];
      const eventPatches: { id: string; patch: Partial<HardshipEvent> }[] = [];
      const usedKeys: string[] = [];
      let eventsCreated = 0;
      let eventsEnriched = 0;

      for (const plan of args.plan.events) {
        if (!acceptEvents.has(plan.key)) continue;
        usedKeys.push(plan.key);
        const src = source(plan.draft.pages, plan.draft.passage, plan.draft.appendixRefs);
        if (plan.outcome === "enrich" && plan.matchId) {
          eventPatches.push({
            id: plan.matchId,
            patch: { ...plan.enrich, diarySource: src },
          });
          eventsEnriched += 1;
          continue;
        }
        const cats = plan.draft.categories.filter((c) => categories.includes(c));
        const primary = cats[0] ?? "Other";
        newEvents.push({
          id: rid("evt"),
          date: plan.draft.date,
          title: plan.draft.title || "Hardship diary entry",
          category: primary,
          categories: cats.length ? cats : [primary],
          people: plan.draft.people.length ? plan.draft.people : ["Aciah"],
          description: plan.draft.description,
          effectOnAciah: plan.draft.effectOnAciah,
          effectOnFamily: plan.draft.effectOnFamily,
          professionalOutcome: plan.draft.professionalOutcome,
          followUp: plan.draft.followUp,
          status: plan.linkedEvidenceIds.length ? "Recorded" : "Needs evidence",
          evidenceIds: Array.from(
            new Set([
              ...plan.linkedEvidenceIds,
              ...(args.masterEvidenceId ? [args.masterEvidenceId] : []),
            ]),
          ),
          appendixRefs: plan.draft.appendixRefs,
          diarySource: src,
          createdBy: profile,
          lastEditedBy: profile,
          createdAt: importedAt,
          updatedAt: importedAt,
        });
        eventsCreated += 1;
      }

      const newFinances: FinancialEntry[] = [];
      const financePatches: { id: string; patch: Partial<FinancialEntry> }[] = [];
      let financesCreated = 0;
      let financesEnriched = 0;

      for (const plan of args.plan.finances) {
        if (!acceptFinances.has(plan.key)) continue;
        usedKeys.push(plan.key);
        const src = source(plan.draft.pages, plan.draft.passage, plan.draft.appendixRefs);
        if (plan.outcome === "enrich" && plan.matchId) {
          financePatches.push({ id: plan.matchId, patch: { ...plan.enrich, diarySource: src } });
          financesEnriched += 1;
          continue;
        }
        const currency = plan.draft.currency === "USD" ? "USD" : "GBP";
        const conv = convert(plan.draft.amount, currency);
        newFinances.push({
          id: rid("fin"),
          date: plan.draft.date,
          label: plan.draft.label || "Cost recorded in hardship diary",
          kind: "Other",
          amount: plan.draft.amount,
          currency,
          recurring: false,
          notes: plan.draft.purpose,
          evidenceIds: Array.from(
            new Set([
              ...plan.linkedEvidenceIds,
              ...(args.masterEvidenceId ? [args.masterEvidenceId] : []),
            ]),
          ),
          expenseCategory: (EXPENSE_CATEGORY_SET.has(plan.draft.expenseCategory)
            ? plan.draft.expenseCategory
            : "Other") as ExpenseCategory,
          payer: plan.draft.payer === "Aciah" ? "Aciah" : "Imran",
          merchant: plan.draft.merchant,
          purpose: plan.draft.purpose,
          gbpEquivalent: Math.round(conv.gbp * 100) / 100,
          usdEquivalent: Math.round(conv.usd * 100) / 100,
          exchangeRate: conv.rate,
          exchangeRateDate: income.rateDate || importedAt.slice(0, 10),
          exchangeRateSource: income.rateSource,
          status: plan.draft.amountMissing ? "Needs confirmation" : "Missing receipt",
          amountMissing: plan.draft.amountMissing,
          appendixRefs: plan.draft.appendixRefs,
          diarySource: src,
          createdBy: profile,
          lastEditedBy: profile,
          createdAt: importedAt,
          updatedAt: importedAt,
        });
        financesCreated += 1;
      }

      if (newEvents.length || eventPatches.length) {
        setEvents((prev) => {
          const patched = prev.map((e) => {
            const hit = eventPatches.find((p) => p.id === e.id);
            return hit ? { ...e, ...hit.patch, lastEditedBy: profile, updatedAt: importedAt } : e;
          });
          return [...patched, ...newEvents];
        });
      }
      if (newFinances.length || financePatches.length) {
        setFinances((prev) => {
          const patched = prev.map((f) => {
            const hit = financePatches.find((p) => p.id === f.id);
            return hit ? { ...f, ...hit.patch, lastEditedBy: profile, updatedAt: importedAt } : f;
          });
          return [...patched, ...newFinances];
        });
      }

      if (args.createTasksForMissing && args.plan.appendixMissing.length) {
        const chase: CaseTask[] = args.plan.appendixMissing.slice(0, 60).map((link) => ({
          id: rid("task"),
          title: `Obtain ${link.ref} — ${link.description || "referenced in hardship diary"}`.slice(
            0,
            120,
          ),
          category: "",
          dueDate: "",
          done: false,
          assignedTo: profile,
          status: "To do",
          priority: "Normal",
          notes: `Hardship diary page ${link.pages.join(", ") || "?"} refers to ${link.ref} but no matching document is in the vault.`,
          createdBy: profile,
          lastEditedBy: profile,
          createdAt: importedAt,
          updatedAt: importedAt,
        }));
        setTasks((prev) => [...prev, ...chase]);
      }

      const previous = diaryImports.flatMap((d) => d.recordKeys);
      const record: DiaryImport = {
        id: importId,
        fileName: args.fileName,
        fileSizeBytes: args.fileSizeBytes,
        importedAt,
        importedBy: profile,
        pagesAnalysed: args.pagesAnalysed,
        chunkHashes: args.chunkHashes,
        recordKeys: Array.from(new Set([...previous, ...usedKeys])),
        masterEvidenceId: args.masterEvidenceId,
        appendix: args.plan.appendix,
        summary: {
          eventsCreated,
          eventsEnriched,
          financesCreated,
          financesEnriched,
          matchedExisting: args.plan.alreadyImported,
          possibleDuplicates: [...args.plan.events, ...args.plan.finances].filter(
            (p) => p.outcome === "duplicate",
          ).length,
          needsConfirmation: [...args.plan.events, ...args.plan.finances].filter(
            (p) => p.uncertainFields.length,
          ).length,
          appendixRefs: args.plan.appendix.length,
          appendixMissing: args.plan.appendixMissing.length,
        },
      };
      setDiaryImports((prev) => [...prev, record]);
      return record;
    },
    [categories, convert, diaryImports, income.rateDate, income.rateSource, profile],
  );

  const connectDrive = useCallback(
    (config: { apiKey?: string; folderPath?: string; accountLabel?: string }) => {
      void documentProvider.connect(config).then((conn) => {
        setConnection(conn);
        toast.success("Google Drive folder linked", { description: conn.folderPath });
      });
    },
    [],
  );

  const syncDrive = useCallback(async () => {
    if (driveSyncInFlight.current) {
      return { added: 0, updated: 0, removed: 0, folders: driveTree?.folders.length ?? 0, files: driveTree?.files.length ?? 0 };
    }
    driveSyncInFlight.current = true;
    setDriveSyncing(true);
    try {
      const next = await listDriveTree();
      setDriveTree(next);
      if (typeof localStorage !== "undefined") localStorage.setItem(DRIVE_TREE_KEY, JSON.stringify(next));

      const originalFiles = next.files.filter(
        (file) =>
          !file.path.split("/").includes("I601 Evidence Clones") &&
          !file.path.includes("Generated Case Packets") &&
          Boolean(fileTypeFor(file.name, file.mimeType)),
      );
      const liveIds = new Set(originalFiles.map((file) => file.id));
      const existingByDriveId = new Map(
        items.filter((item) => item.driveFileId).map((item) => [item.driveFileId as string, item]),
      );
      const removedIds = items
        .filter((item) => item.driveFileId && !liveIds.has(item.driveFileId))
        .map((item) => item.id);
      const removedSet = new Set(removedIds);
      let updated = 0;
      const now = nowIso();
      const updatedItems = items
        .filter((item) => !removedSet.has(item.id))
        .map((item) => {
          if (!item.driveFileId) return item;
          const file = originalFiles.find((candidate) => candidate.id === item.driveFileId);
          if (!file) return item;
          const nextTitle = (item.confirmedFields ?? []).includes("title")
            ? item.title
            : titleFromName(file.name);
          const changed =
            item.fileName !== file.name ||
            item.driveFolder !== file.path ||
            item.cloudDriveUrl !== file.webViewLink ||
            item.fileSizeBytes !== file.size ||
            item.title !== nextTitle;
          if (!changed) return item;
          updated += 1;
          return {
            ...item,
            fileName: file.name,
            title: nextTitle,
            driveFolder: file.path,
            cloudDriveUrl: file.webViewLink,
            fileSizeBytes: file.size,
            mimeType: file.mimeType,
            updatedAt: now,
            auditTrail: [...item.auditTrail, auditEntry("Matched renamed or moved Drive file")],
          };
        });

      // One exhibit per identical document, even when the same file sits in several folders.
      const seenContent = new Set(
        updatedItems
          .filter((item) => item.driveFileId)
          .map((item) => contentKeyOf(item.fileName, item.fileSizeBytes, item.mimeType)),
      );
      const fresh = originalFiles.filter((file) => {
        if (existingByDriveId.has(file.id)) return false;
        const key = contentKeyOf(file.name, file.size, file.mimeType);
        if (seenContent.has(key)) return false;
        seenContent.add(key);
        return true;
      });
      const created: EvidenceItem[] = [];
      for (const [index, file] of fresh.entries()) {
        const classification = classifyDriveFile({
          ...file,
          parentFolders: file.path.split("/").filter(Boolean),
        });
        const fileType = fileTypeFor(file.name, file.mimeType);
        if (!fileType) continue;
        const categories = classification?.categories ?? ["Other"];
        const people = classification?.people ?? ["Third party"];
        const missingImportant =
          categories.length === 0 ||
          categories.every((category) => category === "Other") ||
          people.length === 0 ||
          people.every((person) => person === "Third party");
        const record = await documentProvider.create({
          exhibitId: `Exhibit D-${items.length + index + 1}`,
          fileName: file.name,
          title: titleFromName(file.name),
          category: categories[0] ?? "Other",
          categories,
          subCategory: file.path.split("/").at(-1) ?? "Google Drive",
          sourceType: classification?.sourceType ?? "Other",
          people,
          fileType,
          fileSizeBytes: file.size,
          mimeType: file.mimeType,
          pageCount: 1,
          status: missingImportant ? "Needs confirmation" : "Ready",
          dateOfDocument: (file.modifiedTime || now).slice(0, 10),
          tags: classification?.tags ?? [],
          cloudDriveUrl: file.webViewLink,
          driveFileId: file.id,
          driveFolder: file.path,
          aiConfidence: classification?.confidence,
          notes: missingImportant
            ? "Imported from Drive. Confirm the person or hardship category."
            : "Imported from Drive and matched to its folder.",
          createdBy: profile,
          lastEditedBy: profile,
          createdAt: now,
          updatedAt: now,
        });
        created.push(record);
      }

      const statusCorrectedIds = new Set<string>();
      const reconciled = [...updatedItems, ...created].map((item) => {
        if (item.status !== "Needs confirmation") return item;
        const hasUncertainty = (item.aiExtraction?.uncertain.length ?? 0) > 0;
        const hasConflict = (item.aiConflicts?.length ?? 0) > 0;
        const missingImportant =
          !item.title.trim() ||
          !item.dateOfDocument ||
          !(item.people ?? []).length ||
          (item.people ?? []).every((person) => person === "Third party") ||
          !(item.categories ?? []).length ||
          (item.categories ?? []).every((category) => category === "Other");
        if (hasUncertainty || hasConflict || missingImportant) return item;
        statusCorrectedIds.add(item.id);
        return { ...item, status: "Ready" as EvidenceStatus };
      });

      setItems(reconciled);
      await documentProvider.remove(removedIds);
      const finalById = new Map(reconciled.map((item) => [item.id, item]));
      await Promise.all(
        reconciled
          .filter((item) => updatedItems.some((updatedItem) => updatedItem.id === item.id) || statusCorrectedIds.has(item.id))
          .map((item) => documentProvider.update(item.id, finalById.get(item.id) ?? item)),
      );
      const conn = await documentProvider.connect({ accountLabel: "Google Drive", folderPath: "/My Drive/" });
      setConnection({ ...conn, lastSyncedAt: next.syncedAt });
      return {
        added: created.length,
        updated,
        removed: removedIds.length,
        folders: next.folders.length,
        files: originalFiles.length,
      };
    } finally {
      driveSyncInFlight.current = false;
      setDriveSyncing(false);
    }
  }, [auditEntry, driveTree, items, profile]);

  // Auto-synch with Drive whenever a new evidence entry is created in the app.
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const syncDriveRef = useRef(syncDrive);
  syncDriveRef.current = syncDrive;
  useEffect(() => {
    if (autoSyncNonce > 0 && connectionRef.current?.connected) {
      void syncDriveRef.current();
    }
  }, [autoSyncNonce]);

  const exhibitGroups = useMemo(
    () => Array.from(new Set(items.map((i) => groupOf(i.exhibitId)))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const list = items.filter((item) => {
      const itemCats = item.categories?.length ? item.categories : [item.category];
      if (filters.categories.length && !filters.categories.some((c) => itemCats.includes(c)))
        return false;
      if (filters.statuses.length && !filters.statuses.includes(item.status)) return false;
      if (filters.tags.length && !filters.tags.some((t) => item.tags.includes(t))) return false;
      if (filters.exhibitGroups.length && !filters.exhibitGroups.includes(groupOf(item.exhibitId)))
        return false;
      if (filters.translationOnly && item.status !== "Translation needed") return false;
      if (!q) return true;
      return [
        item.title,
        item.fileName,
        item.exhibitId,
        item.notes,
        item.subCategory,
        item.sourceType,
        item.dateOfDocument,
        itemCats.join(" "),
        (item.people ?? []).join(" "),
        item.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const key = sort.key;
      const av = a[key];
      const bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [items, filters, sort]);

  const togglePacketExclusion = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      applyPatch(
        [id],
        { excludeFromPacket: !item.excludeFromPacket },
        item.excludeFromPacket ? "Included in the packet" : "Excluded from the packet",
      );
    },
    [applyPatch, items],
  );

  /** Store an immutable packet version and freeze the exhibit numbers it used. */
  const savePacketVersion = useCallback(
    (record: Omit<PacketVersion, "id" | "version" | "generatedAt" | "generatedBy">) => {
      const version: PacketVersion = {
        ...record,
        id: rid("packet"),
        version: packets.length + 1,
        generatedAt: nowIso(),
        generatedBy: profile,
      };
      setPackets((prev) => [...prev, version]);
      setItems((prev) =>
        prev.map((item) => {
          const mapped = record.exhibitMap.find((m) => m.evidenceId === item.id);
          if (!mapped || item.packetExhibitNo) return item;
          return { ...item, packetExhibitNo: mapped.number };
        }),
      );
      return version;
    },
    [packets.length, profile],
  );

  const gaps = useMemo(
    () => [
      ...detectGaps(items, events, finances, tasks, categories),
      ...detectDiaryGaps(diaryImports, items),
    ],
    [items, events, finances, tasks, categories, diaryImports],
  );

  const coverage = useMemo(
    () => categoryCoverage(items, events, categories, gaps),
    [items, events, categories, gaps],
  );

  const stats = useMemo(() => {
    const ready = items.filter((i) => READY_STATUSES.includes(i.status)).length;
    const missingTranslation = items.filter((i) => i.status === "Translation needed").length;
    const gaps = items.filter((i) => i.status === "Missing supporting evidence").length;
    const needsConfirmation = items.filter((i) => i.status === "Needs confirmation").length;
    const byCategory = categories.map((category) => {
      const rows = items.filter((i) =>
        (i.categories?.length ? i.categories : [i.category]).includes(category),
      );
      const readyRows = rows.filter((i) => READY_STATUSES.includes(i.status)).length;
      return {
        category,
        total: rows.length,
        ready: readyRows,
        percent: rows.length ? Math.round((readyRows / rows.length) * 100) : 0,
      };
    });
    const since = CASE_SETTINGS.separationStartDate;
    const financialImpact = finances
      .filter((f) => f.date >= since)
      .reduce((sum, f) => sum + (f.currency === "USD" ? f.amount * 0.79 : f.amount), 0);
    const editStamps = [
      ...items.map((i) => i.updatedAt),
      ...events.map((e) => e.updatedAt),
      ...finances.map((f) => f.updatedAt),
      ...tasks.map((t) => t.updatedAt),
    ].filter(Boolean) as string[];
    return {
      total: items.length,
      ready,
      needsConfirmation,
      gaps,
      missingTranslation,
      totalPages: items.reduce((sum, i) => sum + (i.pageCount || 0), 0),
      openTasks: tasks.filter((t) => taskStatus(t) !== "Complete").length,
      timelineEvents: events.length,
      financialImpact,
      lastEditedAt: editStamps.length ? editStamps.sort().at(-1)! : null,
      byCategory,
    };
  }, [items, categories, events, finances, tasks]);

  const value: EvidenceContextValue = {
    loading,
    profile,
    setProfile,
    profileChosen,
    caseSettings: CASE_SETTINGS,
    items,
    filtered,
    filters,
    setFilters,
    resetFilters,
    sort,
    toggleSort,
    selectedIds,
    toggleSelected,
    setSelected: setSelectedIds,
    clearSelected,
    inspectorId,
    openInspector: setInspectorId,
    updateItem,
    addItem,
    importItems,
    bulkUpdate,
    markAllReady,
    bulkAssignPrefix,
    bulkAddTag,
    bulkMoveCategory,
    deleteItem,
    bulkDelete,
    categories,
    addCategory,
    renameCategory,
    deleteCategory,
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    finances,
    addFinance,
    income,
    updateIncome,
    convert,
    updateFinance,
    deleteFinance,
    tasks,
    addTask,
    toggleTask,
    updateTask,
    gaps,
    coverage,

    deleteTask,
    runExtraction,
    runExtractionForSelected,
    extractingIds,
    confirmExtractionField,
    dismissExtractionField,
    resolveConflict,
    diaryImports,
    applyDiaryImport,
    packets,
    togglePacketExclusion,
    savePacketVersion,

    connection,
    connectDrive,
    driveTree,
    driveSyncing,
    syncDrive,
    scanAllDocuments,
    scanProgress,
    exhibitGroups,
    stats,
  };

  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}

export function useEvidence() {
  const ctx = useContext(EvidenceContext);
  if (!ctx) throw new Error("useEvidence must be used inside EvidenceStoreProvider");
  return ctx;
}

export { groupOf };
