import type { EvidenceItem } from "./types";

/**
 * Storage abstraction layer.
 *
 * The UI only ever talks to a `DocumentProvider`. Swapping the mock for a real
 * Google Drive / OneDrive / S3 sync means implementing this interface — no UI,
 * state, or schema changes required.
 */
export interface ProviderConnection {
  providerName: string;
  connected: boolean;
  accountLabel?: string | undefined;
  folderPath?: string | undefined;
  lastSyncedAt?: string | undefined;
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

}

function clone(items: EvidenceItem[]): EvidenceItem[] {
  return items.map((item) => ({ ...item, tags: [...item.tags], auditTrail: [...item.auditTrail] }));
}

/** In-memory provider standing in for a cloud drive folder. Starts empty. */
export class MockDriveProvider implements DocumentProvider {
  readonly id = "mock-google-drive";
  readonly displayName = "Google Drive (Mock)";

  private items: EvidenceItem[] = [];
  private connection: ProviderConnection = {
    providerName: "Google Drive",
    connected: false,
    accountLabel: undefined,
    folderPath: undefined,
    lastSyncedAt: undefined,
  };

  async getConnection() {
    return { ...this.connection };
  }

  async connect(config: { apiKey?: string; folderPath?: string; accountLabel?: string }) {
    this.connection = {
      ...this.connection,
      connected: true,
      accountLabel: config.accountLabel || this.connection.accountLabel,
      folderPath: config.folderPath || this.connection.folderPath,
      lastSyncedAt: new Date().toISOString(),
    };
    return { ...this.connection };
  }

  async disconnect() {
    this.connection = { ...this.connection, connected: false };
    return { ...this.connection };
  }

  async list() {
    return clone(this.items);
  }

  async create(draft: Omit<EvidenceItem, "id" | "auditTrail">, file?: File) {
    const created: EvidenceItem = {
      ...draft,
      id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      cloudDriveUrl:
        draft.cloudDriveUrl ||
        (file && typeof URL !== "undefined" && URL.createObjectURL
          ? URL.createObjectURL(file)
          : ""),
      auditTrail: [
        {
          id: `audit-${Math.random().toString(36).slice(2, 10)}`,
          at: new Date().toISOString(),
          actor: "A. Whitfield (Counsel)",
          action: `Uploaded ${draft.fileName}`,
        },
      ],
    };
    this.items = [...this.items, created];
    this.connection = { ...this.connection, lastSyncedAt: new Date().toISOString() };
    return created;
  }

  async update(id: string, patch: Partial<EvidenceItem>) {
    let updated: EvidenceItem | undefined;
    this.items = this.items.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...patch };
      return updated;
    });
    if (!updated) throw new Error(`Unknown evidence item: ${id}`);
    return updated;
  }

  async updateMany(ids: string[], patch: Partial<EvidenceItem>) {
    const set = new Set(ids);
    const updated: EvidenceItem[] = [];
    this.items = this.items.map((item) => {
      if (!set.has(item.id)) return item;
      const next = { ...item, ...patch };
      updated.push(next);
      return next;
    });
    return updated;
  }
}

export const documentProvider: DocumentProvider = new MockDriveProvider();
