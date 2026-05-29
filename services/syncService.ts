import { supabase } from './supabase';
import { db } from './database';
import { SyncQueueItem } from '../types';
import { mapLocalToSupabase, mapSupabaseToLocal, getPrimaryKeyField } from './schemaMapper';
import { validateSyncItem } from './dataValidator';
import { withRetry, batchArray, isOnline } from './networkMonitor';
import { SyncLogBuilder } from './syncLogger';
import { useAuthStore } from '../stores/authStore';
import { parseSupabaseError, parseNetworkError, formatErrorForDisplay, formatErrorForLog, createSyncContext } from './errorHandler';
import {
  isRejectedForInsufficientSavingsBalance,
  rollbackRejectedSavingsTransaction,
} from './savingsAccountService';
import {
  isRejectedCreditBusinessError,
  rollbackRejectedCreditTransaction,
} from './creditAccountService';

/**
 * Sync Service - Core synchronization logic
 * Handles bidirectional sync between local IndexedDB and Supabase
 */

export interface SyncResult {
  success: number;
  failed: number;
  errors: string[];
  added?: number;
  updated?: number;
  deleted?: number;
}

export interface ProgressCallback {
  (current: number, total: number, message: string): void;
}

const BATCH_SIZE = 50; // Process 50 items at a time
const MAX_RETRY_COUNT = 3;
const PHOTO_BUCKET = 'bso';
const PHOTO_CLIENT_FOLDER = 'photo_client';
const PHOTO_AUTHORIZED_FOLDER = 'photo_client';
const CREDIT_FULL_DOWNLOAD_FIX_KEY = 'bso_credit_fix_full_download_v20260211_1';

// Table dependency order (important for foreign keys)
const TABLE_ORDER = [
  'personnes',
  'comptes_epargne',
  'comptes_credit',
  'transactions_epargne',
  'transactions_credit',
] as const;

/**
 * Upload pending changes from syncQueue to Supabase
 */
export const uploadPendingChanges = async (
  onProgress?: ProgressCallback
): Promise<SyncResult> => {
  const logger = new SyncLogBuilder('upload');

  if (!isOnline()) {
    const error = 'Impossible de synchroniser : vous êtes hors ligne';
    logger.addError(error);
    await logger.save();
    return { success: 0, failed: 0, errors: [error] };
  }

  try {
    // Get current user ID
    const { user } = useAuthStore.getState();
    if (!user) {
      const error = 'Utilisateur non authentifié';
      logger.addError(error);
      await logger.save();
      return { success: 0, failed: 0, errors: [error] };
    }

    // Get all pending and failed items (with retry limit)
    const pendingItems = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'failed'])
      .and(item => item.retry_count < MAX_RETRY_COUNT)
      .toArray();

    if (pendingItems.length === 0) {
      logger.setItemsProcessed(0).setItemsSuccess(0);
      await logger.save();
      return { success: 0, failed: 0, errors: [] };
    }

    // Sort by table dependency order and then by timestamp
    const sortedItems = sortByDependencyOrder(pendingItems);

    logger.setItemsProcessed(sortedItems.length);

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Process in batches
    const batches = batchArray(sortedItems, BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const overallIndex = batchIndex * BATCH_SIZE + i + 1;

        if (onProgress) {
          onProgress(
            overallIndex,
            sortedItems.length,
            `Synchronisation ${item.table} (${item.action})...`
          );
        }

        try {
          // Validate item
          const validation = validateSyncItem(item);
          if (!validation.isValid) {
            throw new Error(`Validation échouée: ${validation.errors.join(', ')}`);
          }

          // Upload item
          await uploadSyncItem(item, user.id);

          // Mark as completed
          await db.syncQueue.update(item.id!, {
            status: 'completed',
            error: undefined,
            updated_at: Date.now(),
          });

          successCount++;
        } catch (error: any) {
          // Parse error for better messaging
          const parsedError = error?.code ? parseSupabaseError(error) : parseNetworkError(error);
          const context = createSyncContext(item.table, item.action, item.pk);

          // Format error for display
          const displayError = formatErrorForDisplay(parsedError, context);
          const logError = formatErrorForLog(parsedError, context);

          errors.push(displayError);

          // Store detailed error in sync queue
          await db.syncQueue.update(item.id!, {
            status: 'failed',
            error: logError,
            retry_count: item.retry_count + 1,
            updated_at: Date.now(),
          });

          if (isRejectedForInsufficientSavingsBalance(error)) {
            await rollbackRejectedSavingsTransaction(item);
          }
          if (isRejectedCreditBusinessError(error)) {
            await rollbackRejectedCreditTransaction(item);
          }

          failedCount++;
        }
      }

      // Small delay between batches to avoid overwhelming the server
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger
      .setItemsSuccess(successCount)
      .setItemsFailed(failedCount)
      .addErrors(errors);

    await logger.save();

    return { success: successCount, failed: failedCount, errors };
  } catch (error: any) {
    const parsedError = error?.code ? parseSupabaseError(error) : parseNetworkError(error);
    const displayError = formatErrorForDisplay(parsedError, 'Synchronisation générale');
    logger.addError(displayError);
    await logger.save();
    return { success: 0, failed: 0, errors: [displayError] };
  }
};

/**
 * Download updates from Supabase since last sync
 */
export const downloadUpdatesFromServer = async (
  onProgress?: ProgressCallback
): Promise<SyncResult> => {
  const logger = new SyncLogBuilder('download');

  if (!isOnline()) {
    const error = 'Impossible de télécharger : vous êtes hors ligne';
    logger.addError(error);
    await logger.save();
    return { success: 0, failed: 0, errors: [error] };
  }

  try {
    // Get last sync timestamp from localStorage
    const lastSyncStr = localStorage.getItem('bso_last_download_sync');
    let lastSyncTimestamp = lastSyncStr ? new Date(parseInt(lastSyncStr)) : null;

    // Guard against invalid/future timestamps that can block incremental sync forever.
    if (lastSyncTimestamp && Number.isNaN(lastSyncTimestamp.getTime())) {
      lastSyncTimestamp = null;
    } else if (
      lastSyncTimestamp &&
      lastSyncTimestamp.getTime() > Date.now() + 5 * 60 * 1000
    ) {
      console.warn('[Sync] last download timestamp is in the future, forcing full download');
      lastSyncTimestamp = null;
    }

    // Check if database is empty (force full download if so)
    const personnesCount = await db.personnes.count();
    const isEmptyDatabase = personnesCount === 0;

    if (isEmptyDatabase && lastSyncTimestamp) {
      console.log('[Sync] Database is empty, forcing full download');
      lastSyncTimestamp = null; // Force full download
    }

    let totalDownloaded = 0;
    let totalAdded = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    const downloadType = lastSyncTimestamp ? 'incrémental' : 'complet';
    console.log(`[Sync] Starting ${downloadType} download`);

    // One-time safety net: force a full re-download of credit accounts after rate formula fixes.
    const shouldForceFullCreditDownload = localStorage.getItem(CREDIT_FULL_DOWNLOAD_FIX_KEY) !== '1';

    // Download each table in order
    for (let tableIndex = 0; tableIndex < TABLE_ORDER.length; tableIndex++) {
      const tableName = TABLE_ORDER[tableIndex];
      const forceFullForTable = shouldForceFullCreditDownload && tableName === 'comptes_credit';

      if (onProgress) {
        const prefix = lastSyncTimestamp ? '📥' : '📦';
        onProgress(
          tableIndex + 1,
          TABLE_ORDER.length,
          `${prefix} Téléchargement ${lastSyncTimestamp ? 'incrémental' : 'complet'} - ${tableName}...`
        );
      }

      try {
        const result = await downloadTable(tableName, lastSyncTimestamp, forceFullForTable);
        totalDownloaded += result.downloaded;
        totalAdded += result.added;
        totalUpdated += result.updated;

        if (forceFullForTable) {
          localStorage.setItem(CREDIT_FULL_DOWNLOAD_FIX_KEY, '1');
        }

        if (onProgress) {
          const summary = `(+${totalAdded}, ~${totalUpdated})`;
          onProgress(
            tableIndex + 1,
            TABLE_ORDER.length,
            `✅ ${tableName} terminé ${summary}`
          );
        }
      } catch (error: any) {
        // Parse error for better messaging
        const parsedError = error?.code ? parseSupabaseError(error) : parseNetworkError(error);
        const context = createSyncContext(tableName, 'download');

        // Format error for display
        const displayError = formatErrorForDisplay(parsedError, context);

        errors.push(displayError);
        totalFailed++;
      }
    }

    // Download deletions
    let totalDeleted = 0;
    try {
      if (onProgress) {
        onProgress(
          TABLE_ORDER.length,
          TABLE_ORDER.length,
          `🗑️ Traitement des suppressions...`
        );
      }
      totalDeleted = await downloadDeletions(lastSyncTimestamp);
      if (onProgress) {
        onProgress(
          TABLE_ORDER.length,
          TABLE_ORDER.length,
          `🗑️ Suppressions terminées (${totalDeleted})`
        );
      }
      console.log(`[Sync] Processed ${totalDeleted} deletions`);
    } catch (error) {
      console.error('[Sync] Error processing deletions:', error);
    }

    // Update last sync timestamp
    localStorage.setItem('bso_last_download_sync', Date.now().toString());

    logger
      .setItemsProcessed(totalDownloaded + totalDeleted)
      .setItemsSuccess(totalDownloaded + totalDeleted)
      .setItemsFailed(totalFailed)
      .addErrors(errors);

    await logger.save();

    return {
      success: totalDownloaded + totalDeleted,
      failed: totalFailed,
      errors,
      added: totalAdded,
      updated: totalUpdated,
      deleted: totalDeleted
    };
  } catch (error: any) {
    const parsedError = error?.code ? parseSupabaseError(error) : parseNetworkError(error);
    const displayError = formatErrorForDisplay(parsedError, 'Téléchargement général');
    logger.addError(displayError);
    await logger.save();
    return { success: 0, failed: 0, errors: [displayError] };
  }
};

/**
 * Retry failed sync items
 */
export const retryFailedSyncItems = async (
  onProgress?: ProgressCallback
): Promise<SyncResult> => {
  const logger = new SyncLogBuilder('retry');

  try {
    // Get failed items with retry count < MAX_RETRY_COUNT
    const failedItems = await db.syncQueue
      .where('status')
      .equals('failed')
      .and(item => item.retry_count < MAX_RETRY_COUNT)
      .toArray();

    if (failedItems.length === 0) {
      logger.setItemsProcessed(0);
      await logger.save();
      return { success: 0, failed: 0, errors: [] };
    }

    // Reset status to pending
    for (const item of failedItems) {
      await db.syncQueue.update(item.id!, {
        status: 'pending',
        updated_at: Date.now(),
      });
    }

    // Retry upload
    return await uploadPendingChanges(onProgress);
  } catch (error: any) {
    const errorMessage = error.message || 'Erreur lors de la relance';
    logger.addError(errorMessage);
    await logger.save();
    return { success: 0, failed: 0, errors: [errorMessage] };
  }
};

/**
 * Remove an item from the sync queue
 */
export const removeFromSyncQueue = async (id: number): Promise<void> => {
  await db.syncQueue.delete(id);
};

/**
 * Upload a single sync item to Supabase
 */
const uploadSyncItem = async (item: SyncQueueItem, userId: string): Promise<void> => {
  const tableName = item.table;
  const pkField = getPrimaryKeyField(tableName);

  return withRetry(async () => {
    switch (item.action) {
      case 'add': {
        const normalizedData = await normalizeSyncPayloadForUpload(tableName, item.data);
        let mappedData = mapLocalToSupabase(tableName, normalizedData, userId);
        mappedData = await uploadImageFieldsIfNeeded(item, mappedData);
        const { error } = await supabase.from(tableName).insert(mappedData);
        if (error) throw error;
        break;
      }

      case 'update': {
        // Check if record exists and compare timestamps
        const { data: existing, error: fetchError } = await supabase
          .from(tableName)
          .select('updated_at')
          .eq(pkField, item.pk)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          throw fetchError;
        }

        // If record doesn't exist, insert instead
        if (!existing) {
          const fullData = await db.table(tableName).get(item.pk);
          if (fullData) {
            const normalizedFullData = await normalizeSyncPayloadForUpload(tableName, fullData);
            let mappedFullData = mapLocalToSupabase(tableName, normalizedFullData, userId);
            mappedFullData = await uploadImageFieldsIfNeeded(item, mappedFullData);
            const { error } = await supabase.from(tableName).insert(mappedFullData);
            if (error) throw error;
          }
          break;
        }

        // Compare timestamps (Last Modified Wins)
        const localUpdatedAt = new Date(item.data.updated_at || item.data.created_at);
        const serverUpdatedAt = new Date(existing.updated_at);

        if (localUpdatedAt >= serverUpdatedAt) {
          // Local is newer or same, update server
          const normalizedData = await normalizeSyncPayloadForUpload(tableName, item.data);
          let mappedData = mapLocalToSupabase(tableName, normalizedData, userId);
          mappedData = await uploadImageFieldsIfNeeded(item, mappedData);

          const { error } = await supabase
            .from(tableName)
            .update(mappedData)
            .eq(pkField, item.pk);

          if (error) throw error;
        }
        // If server is newer, skip update (server wins)
        break;
      }

      case 'delete': {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq(pkField, item.pk);

        // Ignore 404 errors for deletes (already deleted)
        if (error && error.code !== 'PGRST116') {
          throw error;
        }
        break;
      }
    }
  });
};

const normalizeSyncPayloadForUpload = async (tableName: string, data: any): Promise<any> => {
  if (tableName !== 'transactions_epargne') {
    return data;
  }
  return normalizeTransactionEpargneForUpload(data);
};

const normalizeTransactionEpargneForUpload = async (data: any): Promise<any> => {
  const normalized = { ...data };
  const typeTransaction = String(normalized.type_transaction || '').trim();

  // Non-virement transactions should not send virement fields.
  if (typeTransaction !== 'V') {
    normalized.virement_from = null;
    normalized.virement_to = null;
    return normalized;
  }

  const rawFrom = String(normalized.virement_from || '').trim();
  if (!rawFrom) {
    throw new Error('Virement invalide: compte emetteur manquant (virement_from).');
  }

  // Canonical value for virement_from is no_compte (normal account number).
  const byNoCompte = await db.comptes_epargne.where('no_compte').equals(rawFrom).first();
  if (byNoCompte?.no_compte) {
    normalized.virement_from = byNoCompte.no_compte;
    return normalized;
  }

  // Backward compatibility: old payloads may still hold no_compte_ancien
  const byLegacy = await db.comptes_epargne.where('no_compte_ancien').equals(rawFrom).first();
  if (byLegacy?.no_compte) {
    normalized.virement_from = byLegacy.no_compte;
    return normalized;
  }

  const byId = await db.comptes_epargne.get(rawFrom);
  if (byId?.no_compte) {
    normalized.virement_from = byId.no_compte;
    return normalized;
  }

  throw new Error(`Virement invalide: impossible de resoudre le compte emetteur "${rawFrom}" vers un no_compte.`);
};

const isImageDataUrl = (value: unknown): value is string => {
  return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
};

const dataUrlToBlob = (dataUrl: string): { blob: Blob; extension: string } => {
  const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Format de photo invalide');
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const extension = mimeType.split('/')[1]?.split('+')[0] || 'jpg';

  return { blob, extension };
};

const isStorageRlsError = (error: any): boolean => {
  const message = String(error?.message || error?.error || '').toLowerCase();
  return message.includes('row-level security') || message.includes('violates row-level security policy');
};

const uploadImageFieldsIfNeeded = async (item: SyncQueueItem, mappedData: any): Promise<any> => {
  const configByTable: Record<string, { field: string; folder: string; localTable: 'personnes' | 'comptes_epargne' }> = {
    personnes: {
      field: 'photo_identification',
      folder: PHOTO_CLIENT_FOLDER,
      localTable: 'personnes',
    },
    comptes_epargne: {
      field: 'photo_personne_autorisee',
      folder: PHOTO_AUTHORIZED_FOLDER,
      localTable: 'comptes_epargne',
    },
  };

  const config = configByTable[item.table];
  if (!config) {
    return mappedData;
  }

  const photoValue = mappedData?.[config.field];
  if (!isImageDataUrl(photoValue)) {
    return mappedData;
  }

  const { blob, extension } = dataUrlToBlob(photoValue);
  const path = `${config.folder}/${item.pk}_${item.timestamp}_${config.field}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, {
      contentType: blob.type,
      upsert: true,
    });

  if (uploadError) {
    // If storage policy is not configured yet, keep sync alive by falling back
    // to the existing local value (usually a data URL).
    if (isStorageRlsError(uploadError)) {
      console.warn(`[Sync] Upload photo bloque par RLS Storage. Fallback en ${config.field} locale.`, uploadError);
      return mappedData;
    }
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const publicUrl = publicUrlData?.publicUrl;

  if (!publicUrl) {
    throw new Error('URL publique de la photo introuvable apres upload');
  }

  if (config.localTable === 'personnes') {
    await db.personnes.update(item.pk, {
      photo_identification: publicUrl,
      updated_at: new Date().toISOString(),
    });
  } else if (config.localTable === 'comptes_epargne') {
    await db.comptes_epargne.update(item.pk, {
      photo_personne_autorisee: publicUrl,
      updated_at: new Date().toISOString(),
    });
  }

  return {
    ...mappedData,
    [config.field]: publicUrl,
  };
};

/**
 * Download a table from Supabase
 */
const downloadTable = async (
  tableName: string,
  lastSyncTimestamp: Date | null,
  forceFullDownload = false
): Promise<{ downloaded: number; added: number; updated: number }> => {
  let query = supabase.from(tableName).select('*');

  // Only get updated records if we have a last sync timestamp
  if (lastSyncTimestamp && !forceFullDownload) {
    query = query.gt('updated_at', lastSyncTimestamp.toISOString());
  }

  // Pagination for large datasets
  const DOWNLOAD_BATCH_SIZE = 1000;
  let downloaded = 0;
  let added = 0;
  let updated = 0;
  let hasMore = true;
  let offset = 0;

  console.log(
    `[Sync] Starting download for ${tableName}, lastSync:`,
    forceFullDownload ? null : lastSyncTimestamp,
    forceFullDownload ? '(forced full download)' : ''
  );

  while (hasMore) {
    console.log(`[Sync] ${tableName}: Fetching batch at offset ${offset}`);

    const { data, error } = await query
      .range(offset, offset + DOWNLOAD_BATCH_SIZE - 1)
      .order('updated_at', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      console.log(`[Sync] ${tableName}: No more data, stopping`);
      hasMore = false;
      break;
    }

    console.log(`[Sync] ${tableName}: Received ${data.length} records`);

    // Prepare records for bulk upsert
    const recordsToUpsert: any[] = [];

    try {
      // Get all PKs from the batch to check locally in one go
      const pkField = getPrimaryKeyField(tableName);
      const pks = data.map(record => record[pkField]);

      // Fetch all local records for this batch at once
      const localRecords = await db.table(tableName).where(pkField).anyOf(pks).toArray();
      const localRecordMap = new Map(localRecords.map(r => [r[pkField], r]));

      // Process each record and determine if it needs to be upserted
      for (const record of data) {
        const pk = record[pkField];
        const localRecord = localRecordMap.get(pk);

        if (localRecord) {
          // Compare timestamps
          const localUpdatedAt = new Date(localRecord.updated_at || localRecord.created_at);
          const serverUpdatedAt = new Date(record.updated_at);

          if (serverUpdatedAt > localUpdatedAt) {
            // Server is newer, add to upsert list
            const mappedData = mapSupabaseToLocal(tableName, record);
            recordsToUpsert.push(mappedData);
            updated++;
          }
          // If local is newer, skip (keep local)
        } else {
          // Doesn't exist locally, add to upsert list
          const mappedData = mapSupabaseToLocal(tableName, record);
          recordsToUpsert.push(mappedData);
          added++;
        }
      }

      // Bulk upsert all records at once
      if (recordsToUpsert.length > 0) {
        console.log(`[Sync] ${tableName}: Bulk upserting ${recordsToUpsert.length} records`);
        await db.table(tableName).bulkPut(recordsToUpsert);
      } else {
        console.log(`[Sync] ${tableName}: No records to upsert (all local data is newer)`);
      }
    } catch (error: any) {
      // Log the error but continue with other batches
      console.error(`[Sync] Error bulk upserting records in ${tableName}:`, error);
      // Don't throw - continue processing other batches
    }

    downloaded += data.length;
    offset += DOWNLOAD_BATCH_SIZE;

    console.log(`[Sync] ${tableName}: Processed batch, total so far: ${downloaded}`);

    // If we got fewer records than batch size, we're done
    if (data.length < DOWNLOAD_BATCH_SIZE) {
      console.log(`[Sync] ${tableName}: Last batch (${data.length} < ${DOWNLOAD_BATCH_SIZE}), stopping`);
      hasMore = false;
    }
  }

  console.log(`[Sync] ${tableName}: Download complete, total downloaded: ${downloaded}, added: ${added}, updated: ${updated}`);
  return { downloaded, added, updated };
};

/**
 * Download deletions from Supabase
 */
const downloadDeletions = async (lastSyncTimestamp: Date | null): Promise<number> => {
  if (!lastSyncTimestamp) return 0;

  console.log('[Sync] Checking for deletions...');

  const { data, error } = await supabase
    .from('sync_deletions')
    .select('*')
    .gt('deleted_at', lastSyncTimestamp.toISOString());

  if (error) {
    console.error('[Sync] Error fetching deletions:', error);
    return 0;
  }

  if (!data || data.length === 0) return 0;

  console.log(`[Sync] Found ${data.length} deletions to process`);
  let processedCount = 0;

  await db.transaction('rw', db.tables, async () => {
    for (const deletion of data) {
      try {
        const table = db.table(deletion.table_name);
        if (table) {
          // Verify if record exists locally
          const record = await table.get(deletion.record_id);
          if (record) {
            console.log(`[Sync] Deleting ${deletion.table_name} record ${deletion.record_id} (found locally)`);
            await table.delete(deletion.record_id);
            processedCount++;
          } else {
            console.log(`[Sync] ${deletion.table_name} record ${deletion.record_id} not found locally, skipping`);
            // We still count it as processed because it's "done" (doesn't exist)
            processedCount++;
          }
        }
      } catch (err) {
        console.error(`[Sync] Failed to apply deletion for ${deletion.table_name}/${deletion.record_id}:`, err);
      }
    }
  });

  return processedCount;
};

/**
 * Sort sync items by dependency order
 */
const sortByDependencyOrder = (items: SyncQueueItem[]): SyncQueueItem[] => {
  return items.sort((a, b) => {
    // First sort by table order
    const tableOrderA = TABLE_ORDER.indexOf(a.table as any);
    const tableOrderB = TABLE_ORDER.indexOf(b.table as any);

    if (tableOrderA !== tableOrderB) {
      return tableOrderA - tableOrderB;
    }

    // Then sort deletes before adds/updates
    if (a.action === 'delete' && b.action !== 'delete') {
      return -1;
    }
    if (a.action !== 'delete' && b.action === 'delete') {
      return 1;
    }

    // Finally sort by timestamp
    return a.timestamp - b.timestamp;
  });
};

/**
 * Get sync statistics
 */
export const getSyncStats = async () => {
  const pending = await db.syncQueue.where('status').equals('pending').count();
  const failed = await db.syncQueue.where('status').equals('failed').count();
  const completed = await db.syncQueue.where('status').equals('completed').count();

  return { pending, failed, completed };
};
