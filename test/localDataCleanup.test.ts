import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  open: vi.fn(),
}));

const syncLoggerMocks = vi.hoisted(() => ({
  deleteSyncLogDatabase: vi.fn(),
}));

vi.mock('../services/database', () => ({
  db: databaseMocks,
}));

vi.mock('../services/syncLogger', () => syncLoggerMocks);

import {
  LOCAL_USER_CACHE_NAMES,
  LOCAL_USER_DATA_KEYS,
  clearLocalUserData,
} from '../services/localDataCleanup';

describe('purge locale à la déconnexion', () => {
  const cacheDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    databaseMocks.delete.mockResolvedValue(undefined);
    databaseMocks.open.mockResolvedValue(undefined);
    syncLoggerMocks.deleteSyncLogDatabase.mockResolvedValue(undefined);
    cacheDelete.mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { delete: cacheDelete },
    });
  });

  it('efface IndexedDB, les caches de données et les clés utilisateur', async () => {
    LOCAL_USER_DATA_KEYS.forEach((key) => localStorage.setItem(key, 'sensible'));
    localStorage.setItem('sb-project-auth-token', 'jwt');
    localStorage.setItem('bso_offres_plans_cache_v1', 'référence non sensible');

    await clearLocalUserData();

    expect(databaseMocks.delete).toHaveBeenCalledOnce();
    expect(databaseMocks.open).toHaveBeenCalledOnce();
    expect(syncLoggerMocks.deleteSyncLogDatabase).toHaveBeenCalledOnce();
    LOCAL_USER_DATA_KEYS.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    expect(localStorage.getItem('sb-project-auth-token')).toBeNull();
    expect(localStorage.getItem('bso_offres_plans_cache_v1')).toBe('référence non sensible');
    LOCAL_USER_CACHE_NAMES.forEach((name) => expect(cacheDelete).toHaveBeenCalledWith(name));
  });

  it('remonte un échec de purge au lieu de prétendre que les données ont disparu', async () => {
    databaseMocks.delete.mockRejectedValue(new Error('IndexedDB verrouillée'));
    await expect(clearLocalUserData()).rejects.toThrow('Certaines données locales');
  });
  it('remonte aussi un echec de purge de l historique de synchronisation', async () => {
    syncLoggerMocks.deleteSyncLogDatabase.mockRejectedValue(new Error('Journal verrouille'));
    await expect(clearLocalUserData()).rejects.toThrow(/Certaines donn/);
  });
});
