import { Personne, CompteEpargne, CompteCredit, TransactionEpargne, TransactionCredit } from '../types';

/**
 * Schema mapper for local <-> Supabase data transformation
 * Handles type conversions, field mapping, and ensures data compatibility
 */

// Type for any table data
type TableData = Personne | CompteEpargne | CompteCredit | TransactionEpargne | TransactionCredit;

/**
 * Map local data to Supabase format
 * - Ensures created_by/updated_by are UUIDs
 * - Converts timestamps to ISO strings where needed
 * - Handles null vs undefined differences
 */
export const mapLocalToSupabase = (
  tableName: string,
  data: TableData,
  currentUserId: string
): any => {
  // Clone data to avoid mutations
  const mapped = { ...data };

  // Ensure created_by and updated_by are set to current user
  if ('created_by' in mapped && !mapped.created_by) {
    (mapped as any).created_by = currentUserId;
  }
  if ('updated_by' in mapped) {
    (mapped as any).updated_by = currentUserId;
  }

  // Convert Date objects to ISO strings if needed
  if ('created_at' in mapped && mapped.created_at) {
    if (typeof mapped.created_at !== 'string') {
      (mapped as any).created_at = new Date(mapped.created_at).toISOString();
    }
  }

  if ('updated_at' in mapped && mapped.updated_at) {
    if (typeof mapped.updated_at !== 'string') {
      (mapped as any).updated_at = new Date(mapped.updated_at).toISOString();
    }
  }

  // Handle table-specific mappings
  switch (tableName) {
    case 'personnes':
      return mapPersonneToSupabase(mapped as Personne, currentUserId);
    case 'comptes_epargne':
      return mapCompteEpargneToSupabase(mapped as CompteEpargne, currentUserId);
    case 'comptes_credit':
      return mapCompteCreditToSupabase(mapped as CompteCredit, currentUserId);
    case 'transactions_epargne':
      return mapTransactionEpargneToSupabase(mapped as TransactionEpargne, currentUserId);
    case 'transactions_credit':
      return mapTransactionCreditToSupabase(mapped as TransactionCredit, currentUserId);
    default:
      return mapped;
  }
};

/**
 * Map Supabase data to local format
 * - Handles different timestamp formats
 * - Converts bigints to strings where needed
 */
export const mapSupabaseToLocal = (tableName: string, data: any): TableData => {
  const mapped = { ...data };

  // Convert timestamps to local format (numbers or strings)
  if (mapped.created_at) {
    mapped.created_at = new Date(mapped.created_at).toISOString();
  }

  if (mapped.updated_at) {
    mapped.updated_at = new Date(mapped.updated_at).toISOString();
  }

  // Handle table-specific mappings
  switch (tableName) {
    case 'personnes':
      return mapSupabaseToPersonne(mapped);
    case 'comptes_epargne':
      return mapSupabaseToCompteEpargne(mapped);
    case 'comptes_credit':
      return mapSupabaseToCompteCredit(mapped);
    case 'transactions_epargne':
      return mapSupabaseToTransactionEpargne(mapped);
    case 'transactions_credit':
      return mapSupabaseToTransactionCredit(mapped);
    default:
      return mapped;
  }
};

// ===== TABLE-SPECIFIC MAPPERS =====

const mapPersonneToSupabase = (personne: Personne, userId: string): any => {
  return {
    ...personne,
    created_by: personne.created_by ? parseInt(String(personne.created_by)) : null,
    updated_by: personne.updated_by ? parseInt(String(personne.updated_by)) : null,
    piece_identification: personne.piece_identification ? getIdentificationTypeId(personne.piece_identification) : null,
  };
};

const mapSupabaseToPersonne = (data: any): Personne => {
  return {
    ...data,
    created_by: data.created_by ? String(data.created_by) : '',
    updated_by: data.updated_by ? String(data.updated_by) : undefined,
    piece_identification: data.piece_identification || '',
  };
};

const mapCompteEpargneToSupabase = (compte: CompteEpargne, userId: string): any => {
  return {
    ...compte,
    created_by: userId,
    updated_by: userId,
    succursale: compte.succursale ? parseInt(String(compte.succursale)) : null,
    piece_identification_allowed: compte.piece_identification_allowed ? parseInt(String(compte.piece_identification_allowed)) : null,
  };
};

const mapSupabaseToCompteEpargne = (data: any): CompteEpargne => {
  return {
    ...data,
    created_by: data.created_by || '',
    updated_by: data.updated_by || undefined,
    succursale: data.succursale ? String(data.succursale) : undefined,
    piece_identification_allowed: data.piece_identification_allowed ? String(data.piece_identification_allowed) : undefined,
  };
};

const mapCompteCreditToSupabase = (compte: CompteCredit, userId: string): any => {
  return {
    ...compte,
    created_by: userId,
    updated_by: userId,
    collecteur: null, // Field not in local schema
    cycle: compte.no_compte || null,
    date_debut: compte.date_creation || null,
    date_fin: null,
    montant_final: compte.montant_prete + (compte.montant_prete * compte.taux_interet / 100),
    montant_restant: compte.montant_prete - compte.paiement_rembourse,
  };
};

const mapSupabaseToCompteCredit = (data: any): CompteCredit => {
  return {
    id_compte_credit: data.id_compte_credit,
    id_personne: data.id_personne,
    no_compte: data.no_compte || data.cycle,
    id_compte_epargne: data.id_compte_epargne,
    montant_prete: data.montant_prete,
    taux_interet: data.taux_interet,
    paiement_journalier: data.paiement_journalier,
    duree_credit_mois: data.duree_credit_mois,
    fonds_garantie: data.fonds_garantie || 0,
    penalites: data.penalites || 0,
    date_creation: data.date_creation || data.created_at,
    created_at: data.created_at,
    created_by: data.created_by || '',
    updated_by: data.updated_by || undefined,
    paiement_rembourse: data.paiement_cumule || 0,
    updated_at: data.updated_at || undefined,
    statut: data.statut || 'Actif',
  };
};

const mapTransactionEpargneToSupabase = (transaction: TransactionEpargne, userId: string): any => {
  // Exclude solde fields - they are managed by Supabase triggers
  const { solde_apres_transaction, solde_avant_transaction, ...transactionData } = transaction;

  return {
    ...transactionData,
    created_by: userId,
    // Do NOT send solde_apres_transactions or solde_avant_transaction
    // These are computed by Supabase triggers
  };
};

const mapSupabaseToTransactionEpargne = (data: any): TransactionEpargne => {
  return {
    ...data,
    created_by: data.created_by || '',
    solde_apres_transaction: data.solde_apres_transactions || data.solde_apres_transaction,
  };
};

const mapTransactionCreditToSupabase = (transaction: TransactionCredit, userId: string): any => {
  // Exclude computed fields - they are managed by Supabase triggers
  const { solde_avant_transaction, solde_credit, ...transactionData } = transaction;

  return {
    ...transactionData,
    created_by: userId,
    // Do NOT send paiement_cumule, montant_restant, or solde_avant_transaction
    // These are computed by Supabase triggers
  };
};

const mapSupabaseToTransactionCredit = (data: any): TransactionCredit => {
  return {
    id_transaction_credit: data.id_transaction_credit,
    id_compte_credit: data.id_compte_credit,
    no_compte: data.no_compte,
    type_transaction: data.type_transaction,
    montant: data.montant,
    solde_avant_transaction: data.paiement_cumule || data.solde_avant_transaction || 0,
    date_transaction: data.date_transaction,
    montant_pret: data.montant_pret || undefined,
    solde_credit: data.solde_credit || undefined,
    created_at: data.created_at,
    created_by: data.created_by || '',
    versement_declare: data.versement_declare || undefined,
    updated_at: data.updated_at || undefined,
  };
};

// Helper function to map identification type string to ID
const getIdentificationTypeId = (type: string): number | null => {
  const typeMap: { [key: string]: number } = {
    'NIF': 1,
    'CIN': 2,
    'Passeport': 3,
  };
  return typeMap[type] || null;
};

/**
 * Get the primary key field name for a table
 */
export const getPrimaryKeyField = (tableName: string): string => {
  const pkMap: { [key: string]: string } = {
    'personnes': 'id_personne',
    'comptes_epargne': 'id_compte_epargne',
    'comptes_credit': 'id_compte_credit',
    'transactions_epargne': 'id_transaction_epargne',
    'transactions_credit': 'id_transaction_credit',
  };
  return pkMap[tableName] || 'id';
};
