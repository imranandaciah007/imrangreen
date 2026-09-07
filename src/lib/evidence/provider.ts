import { mockEvidence } from "./mock-data";
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
  connect(config: { apiKey?: string; folderPath?: string; accountLabel?: string }): Promise<ProviderConnection>;
  disconnect(): Promise<ProviderConnection>;
  /** Full listing of evidence items in the connected folder. */
  list(): Promise<EvidenceItem[]>;
  /** Persist a partial change to one item. */
  update(id: string, patch: Partial<EvidenceItem>): Promise<EvidenceItem>;
  /** Persist a partial change to many items at once. */
  updateMany(ids: string[], patch: Partial<EvidenceItem>): Promise<EvidenceItem[]>;
}

function clone(items: EvidenceItem[]): EvidenceItem[] {
  return items.map((item) => ({ ...item, tags: [...item.tags], auditTrail: [...item.auditTrail] }));
}

/** In-memory provider that simulates a connected cloud drive folder. */
export class MockDriveProvider implements DocumentProvider {
  readonly id = "mock-google-drive";
  readonly displayName = "Google Drive (Mock)";

  private items = clone(mockEvidence);
  private connection: ProviderConnection = {
    providerName: "Google Drive",
    connected: true,
    accountLabel: "counsel@whitfield-immigration.com",
    folderPath: "/Petitions/2026/EB-2 NIW — Rahman/Evidence",
    lastSyncedAt: new Date().toISOString(),
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
