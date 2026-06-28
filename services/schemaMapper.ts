import { Personne, CompteEpargne, CompteCredit, TransactionEpargne, TransactionCredit } from '../types';
import { getSuccursaleId, getSuccursaleLabel } from '../utils/succursale';

/**
 * Schema mapper for local <-> Supabase data transformation
 * Handles type conversions, field mapping, and ensures data compatibility
 */

// Type for any table data
type TableData = Personne | CompteEpargne | CompteCredit | TransactionEpargne | TransactionCredit;

/**
 * Map local data to Supabase format
 * - Normalizes audit fields for each table
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
  const isPersonnes = tableName === 'personnes';

  // Ensure created_by and updated_by are set to current user
  // personnes: created_by/updated_by reference profiles.id (integer), not UUID
  if (!isPersonnes && 'created_by' in mapped && !mapped.created_by) {
    (mapped as any).created_by = currentUserId;
  }
  if (!isPersonnes && 'updated_by' in mapped) {
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

const toNullableInteger = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }

  // Non-numeric values (e.g. UUID) must not be sent to bigint FK fields
  return null;
};

const normalizeRatePercentForSupabase = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed > 0 && parsed < 1) {
    return Math.round(parsed * 100);
  }
  if (parsed > 100 && parsed <= 10000) {
    return Math.round(parsed / 100);
  }
  return Math.max(0, Math.round(parsed));
};

const mapPersonneToSupabase = (personne: Personne, userId: string): any => {
  // Exclude fields that don't exist in Supabase schema
  const { id_plan, montant, ...personneData } = personne;

  return {
    ...personneData,
    created_by: toNullableInteger(personne.created_by),
    updated_by: toNullableInteger(personne.updated_by),
    piece_identification: personne.piece_identification ? getIdentificationTypeId(personne.piece_identification) : null,
    secteur: personne.secteur || null,
    activite: personne.activite || null,
    capacite_distribution: personne.capacite_distribution || null,
    point_de_vente: personne.point_de_vente || null,
    // Do NOT send id_plan or montant - these don't exist in Supabase schema
  };
};

const mapSupabaseToPersonne = (data: any): Personne => {
  return {
    ...data,
    created_by: data.created_by ? String(data.created_by) : '',
    updated_by: data.updated_by ? String(data.updated_by) : undefined,
    piece_identification: getIdentificationTypeName(data.piece_identification),
    secteur: data.secteur || undefined,
    activite: data.activite || undefined,
    capacite_distribution: data.capacite_distribution || undefined,
    point_de_vente: data.point_de_vente || undefined,
    id_plan: undefined, // Not in Supabase schema
    montant: undefined, // Not in Supabase schema
  };
};

const mapCompteEpargneToSupabase = (compte: CompteEpargne, userId: string): any => {
  // Exclude fields that don't exist in Supabase schema or are managed automatically
  const { statut, solde_actuel, personne, ...compteData } = compte as any;

  return {
    ...compteData,
    no_compte_ancien: compte.no_compte_ancien ? String(compte.no_compte_ancien).trim() : null,
    created_by: userId,
    updated_by: userId,
    succursale: getSuccursaleId(compte.succursale),
    piece_identification_allowed: compte.piece_identification_allowed
      ? getIdentificationTypeId(String(compte.piece_identification_allowed))
      : null,
    person_allowed: compte.person_allowed || null,
    nif_cin_allowed: compte.nif_cin_allowed || null,
    photo_allowed: compte.photo_allowed || null,
    // Do NOT send statut or solde_actuel - these are managed by Supabase
  };
};

const mapSupabaseToCompteEpargne = (data: any): CompteEpargne => {
  const succursaleLabel = getSuccursaleLabel(data.succursale);
  return {
    ...data,
    created_by: data.created_by || '',
    updated_by: data.updated_by || undefined,
    succursale: succursaleLabel || (data.succursale ? String(data.succursale) : undefined),
    piece_identification_allowed: getIdentificationTypeName(data.piece_identification_allowed),
    type_compte_epargne: data.type_compte_epargne || undefined,
    categorie_compte_epargne: data.categorie_compte_epargne || undefined,
    photo_personne_autorisee: data.photo_personne_autorisee || undefined,
    person_allowed: data.person_allowed || undefined,
    nif_cin_allowed: data.nif_cin_allowed || undefined,
    photo_allowed: data.photo_allowed || undefined,
    statut: 'Actif', // Default status, not in Supabase schema
    solde_actuel: data.solde_actuel || 0, // Ensure we have a value
  };
};

const mapCompteCreditToSupabase = (compte: CompteCredit, userId: string): any => {
  // Exclude computed fields that are managed by Supabase triggers/functions
  // and fields that don't exist in Supabase schema
  const { paiement_rembourse, statut, personne, ...compteData } = compte as any;

  return {
    ...compteData,
    ancien_code: compte.ancien_code ? String(compte.ancien_code).trim() : null,
    taux_interet: normalizeRatePercentForSupabase(compte.taux_interet),
    created_by: userId,
    updated_by: userId,
    collecteur: null, // Field not in local schema
    cycle: compte.no_compte || null,
    date_debut: compte.date_debut || compte.date_creation || null,
    date_fin: compte.date_fin || null,
    // Do NOT send paiement_rembourse, montant_final, montant_restant, or statut
    // These are computed/managed by Supabase automatically
  };
};

const deriveCreditStatut = (data: any): CompteCredit['statut'] => {
  // Pas de colonne `statut` cote Supabase. On derive un statut significatif a
  // partir des montants calcules par le trigger:
  //  - "Payé" quand le restant est nul ET qu'un capital final existe (evite le
  //    faux positif quand montant_restant est encore null/0 sur un credit neuf).
  //  - "En retard" quand la date de fin est depassee et qu'il reste a payer.
  //  - "Actif" sinon.
  const restant = data.montant_restant;
  const final = Number(data.montant_final);

  if (restant !== null && restant !== undefined && Number(restant) <= 0 && Number.isFinite(final) && final > 0) {
    return 'Payé';
  }

  if (data.date_fin) {
    const dateFin = new Date(data.date_fin);
    if (!Number.isNaN(dateFin.getTime()) && dateFin.getTime() < Date.now()) {
      return 'En retard';
    }
  }

  return 'Actif';
};

const mapSupabaseToCompteCredit = (data: any): CompteCredit => {
  return {
    id_compte_credit: data.id_compte_credit,
    id_personne: data.id_personne,
    no_compte: data.no_compte || data.cycle,
    ancien_code: data.ancien_code || undefined,
    type_compte_credit: data.type_compte_credit || undefined,
    id_compte_epargne: data.id_compte_epargne,
    montant_prete: data.montant_prete,
    taux_interet: data.taux_interet,
    paiement_journalier: data.paiement_journalier,
    duree_credit_mois: data.duree_credit_mois,
    fonds_garantie: data.fonds_garantie || 0,
    penalites: data.penalites || 0,
    date_creation: data.date_creation || data.created_at,
    date_debut: data.date_debut || undefined,
    date_fin: data.date_fin || undefined,
    created_at: data.created_at,
    created_by: data.created_by || '',
    updated_by: data.updated_by || undefined,
    paiement_rembourse: data.paiement_cumule || 0, // Map from Supabase paiement_cumule
    montant_deja_paye_manuellement: data.montant_deja_paye_manuellement || 0,
    updated_at: data.updated_at || undefined,
    statut: deriveCreditStatut(data), // Derive depuis montant_restant/date_fin (pas de colonne statut Supabase)
  };
};

const mapTransactionEpargneToSupabase = (transaction: TransactionEpargne, userId: string): any => {
  // Exclude solde fields - they are managed by Supabase triggers
  const { solde_apres_transactions, solde_avant_transaction, id_personne, ...transactionData } = transaction as any;

  return {
    ...transactionData,
    created_by: userId,
    solde_avant_transaction_declare: transaction.solde_avant_transaction_declare,
    solde_apres_transaction_declare: transaction.solde_apres_transaction_declare
    // Do NOT send solde_apres_transactions or solde_avant_transaction
    // These are computed by Supabase triggers
  };
};

const mapSupabaseToTransactionEpargne = (data: any): TransactionEpargne => {
  return {
    ...data,
    created_by: data.created_by || '',
    categorie_compte_epargne: data.categorie_compte_epargne || undefined,
    virement_to: data.virement_to || undefined,
    frais_auto: data.frais_auto || 0,
    monnaie_client: data.monnaie_client || undefined,
    remise_client: data.remise_client || 0,
    solde_apres_transactions: data.solde_apres_transactions,
    solde_avant_transaction_declare: data.solde_avant_transaction_declare || 0,
    solde_apres_transaction_declare: data.solde_apres_transaction_declare || 0,
  };
};

const mapTransactionCreditToSupabase = (transaction: TransactionCredit, userId: string): any => {
  // Exclude computed fields - they are managed by Supabase triggers
  const { solde_avant_transaction, solde_credit, id_personne, ...transactionData } = transaction as any;

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
    solde_avant_transaction: data.solde_avant_transaction || data.paiement_cumule || 0,
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

const getIdentificationTypeName = (value: unknown): 'NIF' | 'CIN' | 'Passeport' | '' => {
  if (value === null || value === undefined || value === '') return '';

  const str = String(value).trim();
  if (str === '1' || str.toUpperCase() === 'NIF') return 'NIF';
  if (str === '2' || str.toUpperCase() === 'CIN') return 'CIN';
  if (str === '3' || str.toUpperCase() === 'PASSEPORT') return 'Passeport';
  return '';
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
