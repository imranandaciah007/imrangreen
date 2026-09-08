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

import { documentProvider, type ProviderConnection } from "./provider";
import {
  CASE_SETTINGS,
  DEFAULT_CATEGORIES,
  READY_STATUSES,
  type CaseTask,
  type Category,
  type EvidenceItem,
  type EvidenceStatus,
  type FinancialEntry,
  type HardshipEvent,
  type Profile,
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
  deleteEvent: (id: string) => void;
  finances: FinancialEntry[];
  addFinance: (draft: NewRecord<FinancialEntry>) => void;
  deleteFinance: (id: string) => void;
  tasks: CaseTask[];
  addTask: (draft: NewRecord<CaseTask>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;

  connection: ProviderConnection | null;
  connectDrive: (config: { apiKey?: string; folderPath?: string; accountLabel?: string }) => void;
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

const PROFILE_KEY = "i601.profile";

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
  const [profile, setProfileState] = useState<Profile>("Imran");
  const [profileChosen, setProfileChosen] = useState(false);
  const hydrated = useRef(false);

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
      setCustomCategories(
        (records.categories ?? []).filter((c) => !DEFAULT_CATEGORIES.includes(c)),
      );
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem(PROFILE_KEY) : null;
      if (saved === "Imran" || saved === "Aciah") {
        setProfileState(saved);
        setProfileChosen(true);
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
    void documentProvider.saveRecords({ events, finances, tasks, categories: customCategories });
  }, [events, finances, tasks, customCategories]);

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
  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    toast.success("Event deleted");
  }, []);

  const addFinance = useCallback(
    (draft: NewRecord<FinancialEntry>) => {
      setFinances((prev) => [...prev, { ...stamp(draft), id: rid("fin") }]);
      toast.success("Expense added", { description: draft.label });
    },
    [stamp],
  );
  const deleteFinance = useCallback((id: string) => {
    setFinances((prev) => prev.filter((f) => f.id !== id));
    toast.success("Expense deleted");
  }, []);

  const addTask = useCallback(
    (draft: NewRecord<CaseTask>) => {
      setTasks((prev) => [...prev, { ...stamp(draft), id: rid("task") }]);
      toast.success("Task added", { description: draft.title });
    },
    [stamp],
  );
  const toggleTask = useCallback(
    (id: string) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, done: !t.done, lastEditedBy: profile, updatedAt: nowIso() } : t,
        ),
      );
    },
    [profile],
  );
  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const connectDrive = useCallback(
    (config: { apiKey?: string; folderPath?: string; accountLabel?: string }) => {
      void documentProvider.connect(config).then((conn) => {
        setConnection(conn);
        toast.success("Google Drive folder linked", { description: conn.folderPath });
      });
    },
    [],
  );

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
      openTasks: tasks.filter((t) => !t.done).length,
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
    deleteEvent,
    finances,
    addFinance,
    deleteFinance,
    tasks,
    addTask,
    toggleTask,
    deleteTask,
    connection,
    connectDrive,
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
