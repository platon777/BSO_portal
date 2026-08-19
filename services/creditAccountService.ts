import { CompteCredit, SyncQueueItem, TransactionCredit } from '../types';
import { db } from './database';
import { isOnline } from './networkMonitor';
import { mapSupabaseToLocal } from './schemaMapper';
import { supabase } from './supabase';
import { getCreditFinalCapital, getCreditMontantRestant } from '../utils/creditCalculations';

export interface CreditAccountSyncSummary {
  pendingCount: number;
  failedCount: number;
  pendingPaidDelta: number;
  failedPaidDelta: number;
  confirmedPaidEstimate: number;
  confirmedRemainingEstimate: number;
  projectedPaid: number;
  projectedRemaining: number;
  hasBlockingIssue: boolean;
}

export interface CreditTransactionGuardResult {
  allowed: boolean;
  message?: string;
  serverRemaining?: number;
  serverPaid?: number;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getCreditTransactionPaidDelta = (transaction: Partial<TransactionCredit>): number => {
  if (transaction.type_transaction !== 'Paiement') return 0;
  return Math.max(0, toNumber(transaction.montant));
};

const isCreditTransactionQueueItem = (item: SyncQueueItem, accountId: string): boolean => {
  return item.table === 'transactions_credit' && item.data?.id_compte_credit === accountId;
};

const isCreditAccountQueueItem = (item: SyncQueueItem, accountId: string): boolean => {
  return item.table === 'comptes_credit' && item.pk === accountId;
};

export const buildCreditAccountSyncSummary = (
  compte: CompteCredit,
  queueItems: SyncQueueItem[]
): CreditAccountSyncSummary => {
  const relevantItems = queueItems.filter((item) =>
    item.status !== 'completed' &&
    (isCreditTransactionQueueItem(item, compte.id_compte_credit) || isCreditAccountQueueItem(item, compte.id_compte_credit))
  );

  const pendingTransactionItems = relevantItems.filter(
    (item) => item.status === 'pending' && isCreditTransactionQueueItem(item, compte.id_compte_credit)
  );
  const failedTransactionItems = relevantItems.filter(
    (item) => item.status === 'failed' && isCreditTransactionQueueItem(item, compte.id_compte_credit)
  );

  const pendingPaidDelta = pendingTransactionItems.reduce(
    (sum, item) => sum + getCreditTransactionPaidDelta(item.data),
    0
  );
  const failedPaidDelta = failedTransactionItems.reduce((sum, item) => {
    if (item.data?._local_rolled_back) return sum;
    return sum + getCreditTransactionPaidDelta(item.data);
  }, 0);

  const paidLocal = toNumber(compte.paiement_rembourse);
  const confirmedPaidEstimate = Math.max(0, paidLocal - pendingPaidDelta - failedPaidDelta);
  const capitalFinal = getCreditFinalCapital(compte);
  const confirmedRemainingEstimate = Math.max(0, capitalFinal - confirmedPaidEstimate - toNumber(compte.montant_deja_paye_manuellement));
  const projectedPaid = confirmedPaidEstimate + pendingPaidDelta;
  const projectedRemaining = Math.max(0, capitalFinal - projectedPaid - toNumber(compte.montant_deja_paye_manuellement));

  return {
    pendingCount: relevantItems.filter((item) => item.status === 'pending').length,
    failedCount: relevantItems.filter((item) => item.status === 'failed').length,
    pendingPaidDelta,
    failedPaidDelta,
    confirmedPaidEstimate,
    confirmedRemainingEstimate,
    projectedPaid,
    projectedRemaining,
    hasBlockingIssue: relevantItems.some((item) => item.status === 'failed'),
  };
};

export const getCreditAccountSyncSummary = async (compte: CompteCredit): Promise<CreditAccountSyncSummary> => {
  const queueItems = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'failed'])
    .toArray();

  return buildCreditAccountSyncSummary(compte, queueItems);
};

export const refreshCreditAccountFromServer = async (accountId: string): Promise<CompteCredit | null> => {
  if (!isOnline()) return null;

  const { data, error } = await supabase
    .from('comptes_credit')
    .select('*')
    .eq('id_compte_credit', accountId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const mapped = mapSupabaseToLocal('comptes_credit', data) as CompteCredit;
  await db.comptes_credit.put(mapped);
  return mapped;
};

export const validateCreditTransactionBeforeLocalSave = async (
  compte: CompteCredit,
  typeTransaction: TransactionCredit['type_transaction'],
  amount: number
): Promise<CreditTransactionGuardResult> => {
  const summary = await getCreditAccountSyncSummary(compte);

  if (summary.hasBlockingIssue) {
    return {
      allowed: false,
      message: 'Ce compte credit a une erreur de synchronisation. Corrigez-la avant une nouvelle transaction.',
    };
  }

  if (typeTransaction !== 'Paiement') {
    return { allowed: true };
  }

  // Si on est en ligne, on tente de rafraîchir les données officielles depuis Supabase
  if (isOnline()) {
    try {
      const serverCompte = await refreshCreditAccountFromServer(compte.id_compte_credit);
      if (serverCompte) {
        const serverRemaining = Math.max(0, getCreditMontantRestant(serverCompte));
        const serverPaid = toNumber(serverCompte.paiement_rembourse);
        if (amount > serverRemaining) {
          return {
            allowed: false,
            serverRemaining,
            serverPaid,
            message: `Remboursement superieur au montant restant. Restant du: ${serverRemaining.toFixed(2)} HTG.`,
          };
        }
        return { allowed: true, serverRemaining, serverPaid };
      }
    } catch {
      // Si la requête échoue, on continue avec la validation locale (Offline-First)
    }
  }

  // Mode Hors-Ligne (Offline-First) : validation contre le solde restant local
  const localRemaining = Math.max(0, getCreditMontantRestant(compte));
  const localPaid = toNumber(compte.paiement_rembourse);
  if (amount > localRemaining) {
    return {
      allowed: false,
      serverRemaining: localRemaining,
      serverPaid: localPaid,
      message: `Remboursement superieur au montant restant local. Restant du: ${localRemaining.toFixed(2)} HTG.`,
    };
  }

  return { allowed: true, serverRemaining: localRemaining, serverPaid: localPaid };
};

export const rollbackRejectedCreditTransaction = async (item: SyncQueueItem): Promise<void> => {
  if (item.table !== 'transactions_credit' || item.action !== 'add' || item.data?._local_rolled_back) {
    return;
  }

  const transaction = item.data as TransactionCredit;
  const accountId = transaction.id_compte_credit;
  if (!accountId) return;

  const paidDelta = getCreditTransactionPaidDelta(transaction);

  await db.transaction('rw', db.comptes_credit, db.transactions_credit, db.syncQueue, async () => {
    const compte = await db.comptes_credit.get(accountId);
    if (compte && paidDelta > 0) {
      await db.comptes_credit.update(accountId, {
        paiement_rembourse: Math.max(0, toNumber(compte.paiement_rembourse) - paidDelta),
        updated_at: new Date().toISOString(),
      });
    }

    if (transaction.id_transaction_credit) {
      await db.transactions_credit.delete(transaction.id_transaction_credit);
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
    await refreshCreditAccountFromServer(accountId);
  } catch (error) {
    console.warn('[Credit] Impossible de realigner le compte avec Supabase apres rejet', error);
  }
};

export const isRejectedCreditBusinessError = (error: any): boolean => {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === 'P0001' && (
    message.includes('montant restant') ||
    message.includes('compte credit') ||
    message.includes('remboursement')
  );
};
