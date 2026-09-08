import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { documentProvider, type ProviderConnection } from "./provider";
import {
  CATEGORIES,
  READY_STATUSES,
  type Category,
  type EvidenceItem,
  type EvidenceStatus,
  type Tag,
} from "./types";

export type SortKey = "exhibitId" | "title" | "category" | "status" | "pageCount" | "dateOfDocument" | "fileSizeBytes";

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

interface EvidenceContextValue {
  loading: boolean;
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
  addItem: (draft: Omit<EvidenceItem, "id" | "auditTrail">, file?: File) => Promise<EvidenceItem>;
  bulkUpdate: (patch: Partial<EvidenceItem>, message: string) => void;
  bulkAssignPrefix: (prefix: string) => void;
  bulkAddTag: (tag: Tag) => void;
  deleteItem: (id: string) => void;
  bulkDelete: () => void;
  categories: Category[];
  addCategory: (name: string) => void;
  renameCategory: (from: string, to: string) => void;
  deleteCategory: (name: string) => void;
  connection: ProviderConnection | null;

  connectDrive: (config: { apiKey?: string; folderPath?: string; accountLabel?: string }) => void;
  exhibitGroups: string[];
  stats: {
    total: number;
    targetTotal: number;
    ready: number;
    inReview: number;
    missingTranslation: number;
    missing: number;
    totalPages: number;
    byCategory: { category: Category; total: number; ready: number; percent: number }[];
  };
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

function auditEntry(action: string) {
  return {
    id: `audit-${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    actor: "A. Whitfield (Counsel)",
    action,
  };
}

function groupOf(exhibitId: string) {
  const match = /Exhibit\s+([A-Z]+)/i.exec(exhibitId);
  return match ? match[1]!.toUpperCase() : "—";
}

export function EvidenceStoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ProviderConnection | null>(null);
  const [filters, setFiltersState] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "exhibitId", dir: "asc" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, conn] = await Promise.all([documentProvider.list(), documentProvider.getConnection()]);
      if (cancelled) return;
      setItems(list);
      setConnection(conn);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setFilters = useCallback((next: Partial<Filters>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }, []);
  const resetFilters = useCallback(() => setFiltersState(emptyFilters), []);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const clearSelected = useCallback(() => setSelectedIds([]), []);

  const applyPatch = useCallback((ids: string[], patch: Partial<EvidenceItem>, action: string) => {
    setItems((prev) =>
      prev.map((item) =>
        ids.includes(item.id)
          ? { ...item, ...patch, auditTrail: [...item.auditTrail, auditEntry(action)] }
          : item,
      ),
    );
    void documentProvider.updateMany(ids, patch);
  }, []);

  const updateItem = useCallback(
    (id: string, patch: Partial<EvidenceItem>, message?: string) => {
      const action = message ?? `Updated ${Object.keys(patch).join(", ")}`;
      applyPatch([id], patch, action);
      if (message) toast.success(message);
    },
    [applyPatch],
  );

  const addItem = useCallback(async (draft: Omit<EvidenceItem, "id" | "auditTrail">, file?: File) => {
    const created = await documentProvider.create(draft, file);
    setItems((prev) => [...prev, created]);
    toast.success(`${created.exhibitId} added`, { description: created.title });
    return created;
  }, []);

  const bulkUpdate = useCallback(
    (patch: Partial<EvidenceItem>, message: string) => {
      if (selectedIds.length === 0) {
        toast.error("Select at least one exhibit first");
        return;
      }
      applyPatch(selectedIds, patch, message);
      toast.success(`${message} · ${selectedIds.length} exhibit(s)`);
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
            auditTrail: [...item.auditTrail, auditEntry(`Re-numbered to ${exhibitId}`)],
          };
        });
      });
      toast.success(`Re-numbered ${selectedIds.length} exhibit(s) under prefix ${prefix.toUpperCase()}`);
    },
    [selectedIds],
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
            ? { ...item, tags: [...item.tags, tag], auditTrail: [...item.auditTrail, auditEntry(`Tagged ${tag}`)] }
            : item,
        ),
      );
      toast.success(`Tagged ${selectedIds.length} exhibit(s) with ${tag}`);
    },
    [selectedIds],
  );

  const connectDrive = useCallback(
    (config: { apiKey?: string; folderPath?: string; accountLabel?: string }) => {
      void documentProvider.connect(config).then((conn) => {
        setConnection(conn);
        toast.success("Drive folder connected", { description: conn.folderPath });
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
      if (filters.categories.length && !filters.categories.includes(item.category)) return false;
      if (filters.statuses.length && !filters.statuses.includes(item.status)) return false;
      if (filters.tags.length && !filters.tags.some((t) => item.tags.includes(t))) return false;
      if (filters.exhibitGroups.length && !filters.exhibitGroups.includes(groupOf(item.exhibitId))) return false;
      if (filters.translationOnly && item.status !== "Needs Translation") return false;
      if (!q) return true;
      return [item.title, item.fileName, item.exhibitId, item.notes, item.subCategory, item.tags.join(" ")]
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
    const missingTranslation = items.filter((i) => i.status === "Needs Translation").length;
    const missing = items.filter((i) => i.status === "Missing").length;
    const inReview = items.filter(
      (i) => i.status === "Draft" || i.status === "Certified Translation Added",
    ).length;
    const byCategory = CATEGORIES.map((category) => {
      const rows = items.filter((i) => i.category === category);
      const readyRows = rows.filter((i) => READY_STATUSES.includes(i.status)).length;
      return {
        category,
        total: rows.length,
        ready: readyRows,
        percent: rows.length ? Math.round((readyRows / rows.length) * 100) : 0,
      };
    });
    return {
      total: items.length,
      targetTotal: 300,
      ready,
      inReview,
      missingTranslation,
      missing,
      totalPages: items.reduce((sum, i) => sum + i.pageCount, 0),
      byCategory,
    };
  }, [items]);

  const value: EvidenceContextValue = {
    loading,
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
    bulkUpdate,
    bulkAssignPrefix,
    bulkAddTag,
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
