import type { CaseTask, EvidenceItem, FinancialEntry, HardshipEvent } from "./types";

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

/** Device-local provider standing in for Google Drive. Starts empty. */
export class LocalCaseProvider implements DocumentProvider {
  readonly id = "local-case-store";
  readonly displayName = "Google Drive";

  private items: EvidenceItem[] | null = null;
  private connection: ProviderConnection | null = null;

  private loadItems(): EvidenceItem[] {
    if (!this.items) this.items = readJson<EvidenceItem[]>(ITEMS_KEY, []);
    return this.items;
  }

  private persistItems() {
    writeJson(ITEMS_KEY, this.items ?? []);
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
    return clone(this.loadItems());
  }

  async create(draft: Omit<EvidenceItem, "id" | "auditTrail">, file?: File) {
    const now = new Date().toISOString();
    const created: EvidenceItem = {
      ...draft,
      id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      cloudDriveUrl:
        draft.cloudDriveUrl ||
        (file && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : ""),
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
    return updated;
  }

  async remove(ids: string[]) {
    const set = new Set(ids);
    this.items = this.loadItems().filter((item) => !set.has(item.id));
    this.persistItems();
    return ids;
  }

  async loadRecords() {
    return readJson<CaseRecords>(RECORDS_KEY, emptyRecords);
  }

  async saveRecords(records: CaseRecords) {
    writeJson(RECORDS_KEY, records);
  }
}

export const documentProvider: DocumentProvider = new LocalCaseProvider();
