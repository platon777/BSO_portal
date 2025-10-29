import { db } from './database';
import { TransactionCredit, TransactionEpargne, CompteCredit, CompteEpargne, SyncQueueItem } from '../types';

export interface DateFilter {
  type: 'today' | 'specific' | 'range' | 'all';
  date?: string;
  startDate?: string;
  endDate?: string;
}

export interface AgentStats {
  comptes_credit_crees: number;
  comptes_epargne_crees: number;
  transactions_epargne_depot: number;
  transactions_epargne_retrait: number;
  transactions_epargne_frais_service: number;
  transactions_frais_livret: number;
  transactions_credit_paiement: number;
  transactions_credit_penalite: number;
  transactions_credit_garantie: number;
  montant_comptes_credit: number;
  montant_comptes_epargne: number;
  montant_transactions_epargne_depot: number;
  montant_transactions_epargne_retrait: number;
  montant_transactions_epargne_frais_service: number;
  montant_transactions_frais_livret: number;
  montant_transactions_credit_paiement: number;
  montant_transactions_credit_penalite: number;
  montant_transactions_credit_garantie: number;
  cash_total_a_remettre: number;
  total_fonds_garantie_epargne: number;
  total_fonds_garantie_credit: number;
  total_fonds_garantie_global: number;
}

const initialStats: AgentStats = {
  comptes_credit_crees: 0,
  comptes_epargne_crees: 0,
  transactions_epargne_depot: 0,
  transactions_epargne_retrait: 0,
  transactions_epargne_frais_service: 0,
  transactions_frais_livret: 0,
  transactions_credit_paiement: 0,
  transactions_credit_penalite: 0,
  transactions_credit_garantie: 0,
  montant_comptes_credit: 0,
  montant_comptes_epargne: 0,
  montant_transactions_epargne_depot: 0,
  montant_transactions_epargne_retrait: 0,
  montant_transactions_epargne_frais_service: 0,
  montant_transactions_frais_livret: 0,
  montant_transactions_credit_paiement: 0,
  montant_transactions_credit_penalite: 0,
  montant_transactions_credit_garantie: 0,
  cash_total_a_remettre: 0,
  total_fonds_garantie_epargne: 0,
  total_fonds_garantie_credit: 0,
  total_fonds_garantie_global: 0,
};

// FIX: Expanded the generic constraint to include all properties used on the filtered items.
// This allows TypeScript to correctly infer the types and avoids property access errors.
const filterByDateAndUser = <T extends {
  created_by: string;
  date_creation?: string;
  date_transaction?: string;
  montant_prete?: number;
  fonds_garantie?: number;
  solde_actuel?: number;
  montant?: number;
  type_transaction?: 'Paiement' | 'Penalite' | 'Garantie' | 'D' | 'R' | 'FL' | 'S';
}>(
  items: T[],
  dateField: keyof T,
  dateFilter: DateFilter,
  userId: string
): T[] => {
  return items.filter(item => {
    if (item.created_by !== userId) {
      return false;
    }

    if (dateFilter.type === 'all') return true;

    const itemDateStr = item[dateField] as string | undefined;
    if (!itemDateStr) return false;

    const itemDate = new Date(itemDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (dateFilter.type) {
      case 'today':
        return itemDate.toDateString() === new Date().toDateString();
      case 'specific':
        const targetDate = new Date(dateFilter.date!);
        return itemDate.toDateString() === targetDate.toDateString();
      case 'range':
        const startDate = new Date(dateFilter.startDate!);
        const endDate = new Date(dateFilter.endDate!);
        return itemDate >= startDate && itemDate <= endDate;
      default:
        return true;
    }
  });
};

export async function getAgentStats(userId: string, dateFilter: DateFilter): Promise<AgentStats> {
  const stats: AgentStats = { ...initialStats };

  if (!userId) {
    console.error("User ID is required for stats calculation.");
    return stats;
  }

  const comptesCredit = await db.comptes_credit.toArray();
  const comptesCreditFiltered = filterByDateAndUser(comptesCredit, 'date_creation', dateFilter, userId);
  stats.comptes_credit_crees = comptesCreditFiltered.length;
  stats.total_fonds_garantie_credit = comptesCreditFiltered.reduce((sum, c) => sum + (c.fonds_garantie || 0), 0);

  const comptesEpargne = await db.comptes_epargne.toArray();
  const comptesEpargneFiltered = filterByDateAndUser(comptesEpargne, 'date_creation', dateFilter, userId);
  stats.comptes_epargne_crees = comptesEpargneFiltered.length;
  stats.total_fonds_garantie_epargne = comptesEpargneFiltered.reduce((sum, c) => sum + (c.fonds_garantie || 0), 0);

  const transactionsEpargne = await db.transactions_epargne.toArray();
  const transactionsEpargneFiltered = filterByDateAndUser(transactionsEpargne, 'date_transaction', dateFilter, userId);
  transactionsEpargneFiltered.forEach(t => {
    const montant = t.montant || 0;
    if (t.type_transaction === 'D') {
      stats.transactions_epargne_depot++;
      stats.montant_transactions_epargne_depot += montant;
    } else if (t.type_transaction === 'R') {
      stats.transactions_epargne_retrait++;
      stats.montant_transactions_epargne_retrait += montant;
    } else if (t.type_transaction === 'FL') {
      stats.transactions_frais_livret++;
      stats.montant_transactions_frais_livret += montant;
    } else if (t.type_transaction === 'S') {
      stats.transactions_epargne_frais_service++;
      stats.montant_transactions_epargne_frais_service += montant;
    }
  });

  // Calculate total savings transactions: deposits minus withdrawals minus fees
  stats.montant_comptes_epargne = stats.montant_transactions_epargne_depot -
                                   stats.montant_transactions_epargne_retrait -
                                   stats.montant_transactions_frais_livret -
                                   stats.montant_transactions_epargne_frais_service;

  const transactionsCredit = await db.transactions_credit.toArray();
  const transactionsCreditFiltered = filterByDateAndUser(transactionsCredit, 'date_transaction', dateFilter, userId);
  transactionsCreditFiltered.forEach(t => {
    const montant = t.montant || 0;
    if (t.type_transaction === 'Paiement') {
      stats.transactions_credit_paiement++;
      stats.montant_transactions_credit_paiement += montant;
    } else if (t.type_transaction === 'Penalite') {
      stats.transactions_credit_penalite++;
      stats.montant_transactions_credit_penalite += montant;
    } else if (t.type_transaction === 'Garantie') {
      stats.transactions_credit_garantie++;
      stats.montant_transactions_credit_garantie += montant;
    }
  });

  // Calculate total credit transactions: all payments, penalties and guarantees
  stats.montant_comptes_credit = stats.montant_transactions_credit_paiement +
                                  stats.montant_transactions_credit_penalite +
                                  stats.montant_transactions_credit_garantie;

  // Cash collected includes: deposits, credit payments, penalties, booklet fees, and service fees
  const cashCollecte = stats.montant_transactions_epargne_depot +
    stats.montant_transactions_credit_paiement +
    stats.montant_transactions_credit_penalite +
    stats.montant_transactions_frais_livret +
    stats.montant_transactions_epargne_frais_service;

  // Cash distributed includes: withdrawals
  const cashDistribue = stats.montant_transactions_epargne_retrait;
  stats.cash_total_a_remettre = cashCollecte - cashDistribue;
  stats.total_fonds_garantie_global = stats.total_fonds_garantie_epargne + stats.total_fonds_garantie_credit;

  return stats;
}


export async function getUnsyncedStats(): Promise<SyncQueueItem[]> {
    return db.syncQueue.where('status').notEqual('completed').toArray();
}