import { db } from './database';
import { deleteSyncLogDatabase } from './syncLogger';

export const LOCAL_USER_DATA_KEYS = [
  'bso_cached_profiles',
  'bso_last_download_sync',
  'bso_last_upload_sync',
  'bso_credit_fix_full_download_v20260211_1',
  'bso_offline_user',
  'bso_offline_profile',
  'bso_last_auth_sync',
  'bso_device_fingerprint',
] as const;

export const LOCAL_USER_CACHE_NAMES = ['supabase-api', 'images'] as const;

const isSupabaseAuthStorageKey = (key: string): boolean => {
  return key.startsWith('sb-') && key.includes('-auth-token');
};

/**
 * Remove all locally persisted user/business data after logout.
 * Static application assets and non-sensitive plan reference data are preserved.
 */
export const clearLocalUserData = async (): Promise<void> => {
  const failures: unknown[] = [];

  try {
    await db.delete();
    await db.open();
  } catch (error) {
    failures.push(error);
  }

  try {
    await deleteSyncLogDatabase();
  } catch (error) {
    failures.push(error);
  }

  try {
    LOCAL_USER_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
    const dynamicKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isSupabaseAuthStorageKey(key)) dynamicKeys.push(key);
    }
    dynamicKeys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    failures.push(error);
  }

  try {
    if ('caches' in globalThis) {
      await Promise.all(LOCAL_USER_CACHE_NAMES.map((name) => caches.delete(name)));
    }
  } catch (error) {
    failures.push(error);
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, 'Certaines données locales n ont pas pu être supprimées.');
  }
};
