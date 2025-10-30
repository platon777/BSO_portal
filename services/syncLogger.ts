import Dexie, { Table } from 'dexie';

/**
 * Sync logger for tracking synchronization history
 * Stores logs in IndexedDB for user visibility
 */

export interface SyncLog {
  id?: number;
  timestamp: number;
  action: 'upload' | 'download' | 'retry';
  status: 'success' | 'partial' | 'failed';
  itemsProcessed: number;
  itemsSuccess: number;
  itemsFailed: number;
  duration: number; // milliseconds
  errors: string[];
  details?: string;
}

class SyncLogDB extends Dexie {
  syncLogs!: Table<SyncLog, number>;

  constructor() {
    super('bsoSyncLogsDB');
    this.version(1).stores({
      syncLogs: '++id, timestamp, action, status',
    });
  }
}

const logDB = new SyncLogDB();

/**
 * Add a sync log entry
 */
export const addSyncLog = async (log: Omit<SyncLog, 'id'>): Promise<void> => {
  try {
    await logDB.syncLogs.add(log);

    // Keep only last 100 logs to prevent DB bloat
    const count = await logDB.syncLogs.count();
    if (count > 100) {
      const oldestLogs = await logDB.syncLogs
        .orderBy('timestamp')
        .limit(count - 100)
        .toArray();

      const idsToDelete = oldestLogs.map(l => l.id!);
      await logDB.syncLogs.bulkDelete(idsToDelete);
    }
  } catch (error) {
    console.error('Failed to add sync log:', error);
  }
};

/**
 * Get sync history
 */
export const getSyncHistory = async (limit: number = 20): Promise<SyncLog[]> => {
  try {
    return await logDB.syncLogs
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error('Failed to get sync history:', error);
    return [];
  }
};

/**
 * Get sync history filtered by status
 */
export const getSyncHistoryByStatus = async (
  status: SyncLog['status'],
  limit: number = 20
): Promise<SyncLog[]> => {
  try {
    return await logDB.syncLogs
      .where('status')
      .equals(status)
      .reverse()
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error('Failed to get filtered sync history:', error);
    return [];
  }
};

/**
 * Clear all sync logs
 */
export const clearSyncLogs = async (): Promise<void> => {
  try {
    await logDB.syncLogs.clear();
  } catch (error) {
    console.error('Failed to clear sync logs:', error);
  }
};

/**
 * Get last sync timestamp
 */
export const getLastSyncTimestamp = async (): Promise<number | null> => {
  try {
    const lastSuccessfulSync = await logDB.syncLogs
      .where('status')
      .equals('success')
      .and(log => log.action === 'download')
      .reverse()
      .first();

    return lastSuccessfulSync?.timestamp || null;
  } catch (error) {
    console.error('Failed to get last sync timestamp:', error);
    return null;
  }
};

/**
 * Helper to create a log entry with timing
 */
export class SyncLogBuilder {
  private startTime: number;
  private action: SyncLog['action'];
  private itemsProcessed: number = 0;
  private itemsSuccess: number = 0;
  private itemsFailed: number = 0;
  private errors: string[] = [];
  private details?: string;

  constructor(action: SyncLog['action']) {
    this.startTime = Date.now();
    this.action = action;
  }

  setItemsProcessed(count: number): this {
    this.itemsProcessed = count;
    return this;
  }

  setItemsSuccess(count: number): this {
    this.itemsSuccess = count;
    return this;
  }

  setItemsFailed(count: number): this {
    this.itemsFailed = count;
    return this;
  }

  addError(error: string): this {
    this.errors.push(error);
    return this;
  }

  addErrors(errors: string[]): this {
    this.errors.push(...errors);
    return this;
  }

  setDetails(details: string): this {
    this.details = details;
    return this;
  }

  async save(): Promise<void> {
    const duration = Date.now() - this.startTime;
    const status: SyncLog['status'] =
      this.itemsFailed === 0 ? 'success' :
      this.itemsSuccess > 0 ? 'partial' :
      'failed';

    await addSyncLog({
      timestamp: this.startTime,
      action: this.action,
      status,
      itemsProcessed: this.itemsProcessed,
      itemsSuccess: this.itemsSuccess,
      itemsFailed: this.itemsFailed,
      duration,
      errors: this.errors,
      details: this.details,
    });
  }
}
