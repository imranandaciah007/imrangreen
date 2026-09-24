import type {
  CaseTask,
  DiaryImport,
  EvidenceItem,
  FinancialEntry,
  HardshipEvent,
  IncomeSettings,
  PacketVersion,
} from "./types";

/**
 * Storage abstraction layer.
 *
 * The UI only ever talks to a `DocumentProvider`. Swapping the local store for a
 * real Google Drive / OneDrive / S3 sync means implementing this interface — no
 * UI, state, or schema changes required.
 */
export interface ProviderConnection {
  providerName: string;
  connected: boolean;
  accountLabel?: string | undefined;
  folderPath?: string | undefined;
  lastSyncedAt?: string | undefined;
}

export interface CaseRecords {
  events: HardshipEvent[];
  finances: FinancialEntry[];
  tasks: CaseTask[];
  categories: string[];
  income?: IncomeSettings | undefined;
  packets?: PacketVersion[] | undefined;
  diaryImports?: DiaryImport[] | undefined;
}

export interface DocumentProvider {
  readonly id: string;
  readonly displayName: string;
  getConnection(): Promise<ProviderConnection>;
  connect(config: {
    apiKey?: string;
    folderPath?: string;
    accountLabel?: string;
  }): Promise<ProviderConnection>;
  disconnect(): Promise<ProviderConnection>;
  /** Full listing of evidence items in the connected folder. */
  list(): Promise<EvidenceItem[]>;
  /** Upload a new document into the connected folder. */
  create(draft: Omit<EvidenceItem, "id" | "auditTrail">, file?: File): Promise<EvidenceItem>;
  /** Persist a partial change to one item. */
  update(id: string, patch: Partial<EvidenceItem>): Promise<EvidenceItem>;
  /** Persist a partial change to many items at once. */
  updateMany(ids: string[], patch: Partial<EvidenceItem>): Promise<EvidenceItem[]>;
  /** Remove items from the folder index. */
  remove(ids: string[]): Promise<string[]>;
  /** Non-document case records (timeline, finances, tasks, categories). */
  loadRecords(): Promise<CaseRecords>;
  saveRecords(records: CaseRecords): Promise<void>;
}

function clone(items: EvidenceItem[]): EvidenceItem[] {
  return items.map((item) => ({
    ...item,
    tags: [...item.tags],
    categories: [...(item.categories ?? [item.category])],
    people: [...(item.people ?? [])],
    auditTrail: [...item.auditTrail],
  }));
}

const ITEMS_KEY = "i601.items";
const CONN_KEY = "i601.connection";
const RECORDS_KEY = "i601.records";

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — ignore */
  }
}

const emptyRecords: CaseRecords = { events: [], finances: [], tasks: [], categories: [] };

const PENDING_KEY = "gc.cloud.pending";

/**
 * Case store shared across every device. A local copy keeps the app instant and
 * usable offline; every change is also written to the backend, and each device
 * pulls the latest shared copy on open, on focus and every little while.
 */
export class LocalCaseProvider implements DocumentProvider {
  readonly id = "shared-case-store";
  readonly displayName = "Google Drive";

  private items: EvidenceItem[] | null = null;
  private connection: ProviderConnection | null = null;
  private pendingIds = new Set<string>(readJson<string[]>(PENDING_KEY, []).filter((v) => !v.startsWith("-")));
  private pendingDeletes = new Set<string>(
    readJson<string[]>(PENDING_KEY, []).filter((v) => v.startsWith("-")).map((v) => v.slice(1)),
  );
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private storeCache = new Map<string, unknown>();
  private storeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private loadItems(): EvidenceItem[] {
    if (!this.items) this.items = readJson<EvidenceItem[]>(ITEMS_KEY, []);
    return this.items;
  }

  private persistItems() {
    writeJson(ITEMS_KEY, this.items ?? []);
  }

  private savePending() {
    writeJson(PENDING_KEY, [...this.pendingIds, ...[...this.pendingDeletes].map((id) => `-${id}`)]);
  }

  private queue(ids: string[], deleted = false) {
    for (const id of ids) {
      if (deleted) {
        this.pendingDeletes.add(id);
        this.pendingIds.delete(id);
      } else this.pendingIds.add(id);
    }
    this.savePending();
    if (typeof window === "undefined") return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), 700);
  }

  /** Send queued changes to the shared store; anything that fails is retried later. */
  async flush() {
    if (!this.pendingIds.size && !this.pendingDeletes.size) return;
    const ids = [...this.pendingIds];
    const deletedIds = [...this.pendingDeletes];
    const byId = new Map(this.loadItems().map((i) => [i.id, i]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((i): i is EvidenceItem => Boolean(i))
      .map((i) => ({ id: i.id, data: i as unknown as Record<string, unknown> }));
    try {
      const { pushItems } = await import("@/lib/case-sync.functions");
      await pushItems({ data: { items: items as never, deletedIds } });
      ids.forEach((id) => this.pendingIds.delete(id));
      deletedIds.forEach((id) => this.pendingDeletes.delete(id));
      this.savePending();
    } catch (error) {
      console.error("Shared case save failed; will retry", error);
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => void this.flush(), 15_000);
    }
  }

  /** Merge the shared copy into this device: the most recently edited version wins. */
  async pull(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    let remote: {
      items: { id: string; deleted: boolean; data: unknown }[];
      store: { key: string; data: unknown }[];
    };
    try {
      const { pullCase } = await import("@/lib/case-sync.functions");
      remote = JSON.parse((await pullCase()).json);
    } catch (error) {
      console.error("Could not load the shared case", error);
      return false;
    }
    const local = new Map(this.loadItems().map((i) => [i.id, i]));
    const seen = new Set<string>();
    const toPush: string[] = [];
    for (const row of remote.items) {
      seen.add(row.id);
      if (this.pendingDeletes.has(row.id)) {
        local.delete(row.id);
        continue;
      }
      if (row.deleted) {
        local.delete(row.id);
        continue;
      }
      const cloud = row.data as unknown as EvidenceItem;
      const mine = local.get(row.id);
      if (!mine || (!this.pendingIds.has(row.id) && (cloud.updatedAt ?? "") >= (mine.updatedAt ?? ""))) {
        local.set(row.id, cloud);
      } else if ((mine.updatedAt ?? "") > (cloud.updatedAt ?? "")) {
        toPush.push(row.id);
      }
    }
    // Anything only on this device (e.g. before sharing existed) goes up.
    for (const id of local.keys()) if (!seen.has(id)) toPush.push(id);
    this.items = [...local.values()];
    this.persistItems();
    for (const s of remote.store) this.storeCache.set(s.key, s.data);
    if (toPush.length) this.queue(toPush);
    return true;
  }

  /** Read a shared value (records, ignored flags). Falls back to this device's copy. */
  async loadShared<T>(key: string, localKey: string, fallback: T): Promise<T> {
    if (this.storeCache.has(key)) {
      const value = this.storeCache.get(key) as T;
      writeJson(localKey, value);
      return value;
    }
    const localValue = readJson<T>(localKey, fallback);
    if (typeof window !== "undefined" && localStorage.getItem(localKey)) this.saveShared(key, localKey, localValue);
    return localValue;
  }

  saveShared(key: string, localKey: string, value: unknown) {
    writeJson(localKey, value);
    this.storeCache.set(key, value);
    if (typeof window === "undefined") return;
    const prev = this.storeTimers.get(key);
    if (prev) clearTimeout(prev);
    this.storeTimers.set(
      key,
      setTimeout(() => {
        void import("@/lib/case-sync.functions")
          .then(({ pushStore }) => pushStore({ data: { key, data: value as never } }))
          .catch((error) => console.error(`Shared save failed for ${key}`, error));
      }, 800),
    );
  }

  private loadConnection(): ProviderConnection {
    if (!this.connection) {
      this.connection = readJson<ProviderConnection>(CONN_KEY, {
        providerName: "Google Drive",
        connected: false,
      });
    }
    return this.connection;
  }

  async getConnection() {
    return { ...this.loadConnection() };
  }

  async connect(config: { apiKey?: string; folderPath?: string; accountLabel?: string }) {
    const prev = this.loadConnection();
    this.connection = {
      ...prev,
      providerName: "Google Drive",
      connected: true,
      accountLabel: config.accountLabel || prev.accountLabel,
      folderPath: config.folderPath || prev.folderPath || "/I601 Evidence/",
      lastSyncedAt: new Date().toISOString(),
    };
    writeJson(CONN_KEY, this.connection);
    return { ...this.connection };
  }

  async disconnect() {
    this.connection = { ...this.loadConnection(), connected: false };
    writeJson(CONN_KEY, this.connection);
    return { ...this.connection };
  }

  async list() {
    await this.pull();
    return clone(this.loadItems());
  }

  async create(draft: Omit<EvidenceItem, "id" | "auditTrail">, file?: File) {
    const now = new Date().toISOString();
    const created: EvidenceItem = {
      ...draft,
      id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      cloudDriveUrl:
        draft.cloudDriveUrl ||
        (file && typeof URL !== "undefined" && URL.createObjectURL
          ? URL.createObjectURL(file)
          : ""),
      createdAt: draft.createdAt || now,
      updatedAt: now,
      auditTrail: [
        {
          id: `audit-${Math.random().toString(36).slice(2, 10)}`,
          at: now,
          actor: draft.createdBy || "Unknown",
          action: `Added ${draft.fileName || draft.title}`,
        },
      ],
    };
    this.items = [...this.loadItems(), created];
    this.persistItems();
    this.queue([created.id]);
    const conn = this.loadConnection();
    this.connection = { ...conn, lastSyncedAt: now };
    writeJson(CONN_KEY, this.connection);
    return created;
  }

  async update(id: string, patch: Partial<EvidenceItem>) {
    let updated: EvidenceItem | undefined;
    this.items = this.loadItems().map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...patch };
      return updated;
    });
    this.persistItems();
    if (!updated) throw new Error(`Unknown evidence item: ${id}`);
    this.queue([id]);
    return updated;
  }

  async updateMany(ids: string[], patch: Partial<EvidenceItem>) {
    const set = new Set(ids);
    const updated: EvidenceItem[] = [];
    this.items = this.loadItems().map((item) => {
      if (!set.has(item.id)) return item;
      const next = { ...item, ...patch };
      updated.push(next);
      return next;
    });
    this.persistItems();
    this.queue(updated.map((i) => i.id));
    return updated;
  }

  async remove(ids: string[]) {
    const set = new Set(ids);
    this.items = this.loadItems().filter((item) => !set.has(item.id));
    this.persistItems();
    if (ids.length) this.queue(ids, true);
    return ids;
  }

  async loadRecords() {
    return this.loadShared<CaseRecords>("records", RECORDS_KEY, emptyRecords);
  }

  async saveRecords(records: CaseRecords) {
    this.saveShared("records", RECORDS_KEY, records);
  }
}

export const documentProvider = new LocalCaseProvider();
