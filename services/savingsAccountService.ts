import { CompteEpargne, SyncQueueItem, TransactionEpargne } from '../types';
import { db } from './database';
import { isOnline } from './networkMonitor';
import { mapSupabaseToLocal } from './schemaMapper';
import { supabase } from './supabase';

export const DEBIT_SAVINGS_TRANSACTION_TYPES = new Set(['R', 'FL', 'S', 'FA', 'V']);

export interface SavingsAccountSyncSummary {
  pendingCount: number;
  failedCount: number;
  pendingDelta: number;
  failedDelta: number;
  hasPendingAccountChange: boolean;
  hasFailedAccountChange: boolean;
  confirmedBalanceEstimate: number;
  projectedBalance: number;
  hasBlockingIssue: boolean;
}

export interface SavingsTransactionGuardResult {
  allowed: boolean;
  message?: string;
  serverBalance?: number;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getSavingsTransactionDelta = (transaction: Partial<TransactionEpargne>): number => {
  const amount = toNumber(transaction.montant);
  if (!transaction.type_transaction || amount <= 0) return 0;
  return DEBIT_SAVINGS_TRANSACTION_TYPES.has(transaction.type_transaction) ? -amount : amount;
};

const isSavingsTransactionQueueItem = (item: SyncQueueItem, accountId: string): boolean => {
  return item.table === 'transactions_epargne' && item.data?.id_compte_epargne === accountId;
};

const isAccountQueueItem = (item: SyncQueueItem, accountId: string): boolean => {
  return item.table === 'comptes_epargne' && item.pk === accountId;
};

export const buildSavingsAccountSyncSummary = (
  compte: CompteEpargne,
  queueItems: SyncQueueItem[]
): SavingsAccountSyncSummary => {
  const relevantItems = queueItems.filter((item) =>
    item.status !== 'completed' &&
    (isSavingsTransactionQueueItem(item, compte.id_compte_epargne) || isAccountQueueItem(item, compte.id_compte_epargne))
  );

  const pendingTransactionItems = relevantItems.filter(
    (item) => item.status === 'pending' && isSavingsTransactionQueueItem(item, compte.id_compte_epargne)
  );
  const failedTransactionItems = relevantItems.filter(
    (item) => item.status === 'failed' && isSavingsTransactionQueueItem(item, compte.id_compte_epargne)
  );

  const pendingDelta = pendingTransactionItems.reduce(
    (sum, item) => sum + getSavingsTransactionDelta(item.data),
    0
  );
  const failedDelta = failedTransactionItems.reduce((sum, item) => {
    if (item.data?._local_rolled_back) return sum;
    return sum + getSavingsTransactionDelta(item.data);
  }, 0);

  const hasPendingAccountChange = relevantItems.some(
    (item) => item.status === 'pending' && isAccountQueueItem(item, compte.id_compte_epargne)
  );
  const hasFailedAccountChange = relevantItems.some(
    (item) => item.status === 'failed' && isAccountQueueItem(item, compte.id_compte_epargne)
  );

  const localBalance = toNumber(compte.solde_actuel);
  const confirmedBalanceEstimate = localBalance - pendingDelta - failedDelta;

  return {
    pendingCount: relevantItems.filter((item) => item.status === 'pending').length,
    failedCount: relevantItems.filter((item) => item.status === 'failed').length,
    pendingDelta,
    failedDelta,
    hasPendingAccountChange,
    hasFailedAccountChange,
    confirmedBalanceEstimate,
    projectedBalance: confirmedBalanceEstimate + pendingDelta,
    hasBlockingIssue: hasFailedAccountChange || failedTransactionItems.length > 0,
  };
};

export const getSavingsAccountSyncSummary = async (compte: CompteEpargne): Promise<SavingsAccountSyncSummary> => {
  const queueItems = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'failed'])
    .toArray();

  return buildSavingsAccountSyncSummary(compte, queueItems);
};

export const refreshSavingsAccountFromServer = async (accountId: string): Promise<CompteEpargne | null> => {
  if (!isOnline()) return null;

  const { data, error } = await supabase
    .from('comptes_epargne')
    .select('*')
    .eq('id_compte_epargne', accountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const mapped = mapSupabaseToLocal('comptes_epargne', data) as CompteEpargne;
  await db.comptes_epargne.put(mapped);
  return mapped;
};

export const refreshSavingsAccountByNumberFromServer = async (accountNumber: string): Promise<CompteEpargne | null> => {
  if (!isOnline()) return null;
  const trimmedAccountNumber = String(accountNumber || '').trim();
  if (!trimmedAccountNumber) return null;

  const { data, error } = await supabase
    .from('comptes_epargne')
    .select('*')
    .eq('no_compte', trimmedAccountNumber)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const mapped = mapSupabaseToLocal('comptes_epargne', data) as CompteEpargne;
  await db.comptes_epargne.put(mapped);
  return mapped;
};

export const validateSavingsTransactionBeforeLocalSave = async (
  compte: CompteEpargne,
  typeTransaction: TransactionEpargne['type_transaction'],
  amount: number
): Promise<SavingsTransactionGuardResult> => {
  const summary = await getSavingsAccountSyncSummary(compte);
  const isDebit = DEBIT_SAVINGS_TRANSACTION_TYPES.has(typeTransaction);

  if (summary.hasBlockingIssue) {
    return {
      allowed: false,
      message: 'Ce compte a une erreur de synchronisation. Corrigez ou supprimez l element en erreur avant une nouvelle transaction.',
    };
  }

  if (!isDebit) {
    return { allowed: true };
  }

  if (summary.pendingCount > 0 || summary.hasPendingAccountChange) {
    return {
      allowed: false,
      message: 'Ce compte a deja une operation en attente. Synchronisez-la avant un retrait, un virement ou des frais.',
    };
  }

  if (!isOnline()) {
    return {
      allowed: false,
      message: 'Retrait, virement et frais doivent etre verifies en ligne pour proteger le solde du client.',
    };
  }

  const serverCompte = await refreshSavingsAccountFromServer(compte.id_compte_epargne);
  if (!serverCompte) {
    return {
      allowed: false,
      message: 'Ce compte n est pas encore confirme sur Supabase. Synchronisez le compte avant cette operation.',
    };
  }

  const serverBalance = toNumber(serverCompte.solde_actuel);
  if (serverBalance < amount) {
    return {
      allowed: false,
      serverBalance,
      message: `Solde confirme insuffisant. Disponible sur Supabase: ${serverBalance.toFixed(2)} HTG.`,
    };
  }

  return { allowed: true, serverBalance };
};

export const rollbackRejectedSavingsTransaction = async (item: SyncQueueItem): Promise<void> => {
  if (item.table !== 'transactions_epargne' || item.action !== 'add' || item.data?._local_rolled_back) {
    return;
  }

  const transaction = item.data as TransactionEpargne;
  const accountId = transaction.id_compte_epargne;
  if (!accountId) return;

  const delta = getSavingsTransactionDelta(transaction);

  await db.transaction('rw', db.comptes_epargne, db.transactions_epargne, db.syncQueue, async () => {
    const compte = await db.comptes_epargne.get(accountId);
    if (compte) {
      await db.comptes_epargne.update(accountId, {
        solde_actuel: toNumber(compte.solde_actuel) - delta,
        updated_at: new Date().toISOString(),
      });
    }

    if (transaction.id_transaction_epargne) {
      await db.transactions_epargne.delete(transaction.id_transaction_epargne);
    }

    if (item.id) {
      await db.syncQueue.update(item.id, {
        data: {
          ...item.data,
          _local_rolled_back: true,
          _local_rolled_back_at: new Date().toISOString(),
        },
        retry_count: Math.max(item.retry_count, 3),
      });
    }
  });

  try {
    await refreshSavingsAccountFromServer(accountId);
  } catch (error) {
    console.warn('[Savings] Impossible de realigner le compte avec Supabase apres rejet', error);
  }
};

export const isRejectedForInsufficientSavingsBalance = (error: any): boolean => {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === 'P0001' && message.includes('solde insuffisant');
};
