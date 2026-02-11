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
  montant_transactions_epargne_depot: number;
  montant_transactions_epargne_retrait: number;
  montant_transactions_epargne_frais_service: number;
  montant_transactions_frais_livret: number;
  montant_transactions_credit_paiement: number;
  montant_transactions_credit_penalite: number;
  montant_remise_client: number;
  total_cash: number;
}

export const initialStats: AgentStats = {
  comptes_credit_crees: 0,
  comptes_epargne_crees: 0,
  transactions_epargne_depot: 0,
  transactions_epargne_retrait: 0,
  transactions_epargne_frais_service: 0,
  transactions_frais_livret: 0,
  transactions_credit_paiement: 0,
  transactions_credit_penalite: 0,
  transactions_credit_garantie: 0,
  montant_transactions_epargne_depot: 0,
  montant_transactions_epargne_retrait: 0,
  montant_transactions_epargne_frais_service: 0,
  montant_transactions_frais_livret: 0,
  montant_transactions_credit_paiement: 0,
  montant_transactions_credit_penalite: 0,
  montant_remise_client: 0,
  total_cash: 0,
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
  type_transaction?: 'Paiement' | 'Penalite' | 'Garantie' | 'D' | 'R' | 'FL' | 'S' | 'V';
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

  const comptesEpargne = await db.comptes_epargne.toArray();
  const comptesEpargneFiltered = filterByDateAndUser(comptesEpargne, 'date_creation', dateFilter, userId);
  stats.comptes_epargne_crees = comptesEpargneFiltered.length;

  const transactionsEpargne = await db.transactions_epargne.toArray();
  const transactionsEpargneFiltered = filterByDateAndUser(transactionsEpargne, 'date_transaction', dateFilter, userId);
  transactionsEpargneFiltered.forEach(t => {
    const montant = t.montant || 0;
    const remiseClient = t.remise_client || 0;
    stats.montant_remise_client += remiseClient;

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
    }
  });

  // Calculate total cash:
  // depot - retrait + frais (livret + service) + credit + penalites - remise
  stats.total_cash = stats.montant_transactions_epargne_depot +
                     stats.montant_transactions_frais_livret +
                     stats.montant_transactions_epargne_frais_service +
                     stats.montant_transactions_credit_paiement +
                     stats.montant_transactions_credit_penalite -
                     stats.montant_transactions_epargne_retrait -
                     stats.montant_remise_client;

  return stats;
}


export async function getUnsyncedStats(): Promise<SyncQueueItem[]> {
    return db.syncQueue.where('status').notEqual('completed').toArray();
}
