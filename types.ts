// Fix: Moved type definitions to a dedicated types file to resolve circular dependencies and improve organization.

export interface Personne {
  id_personne: string;
  code_client: string;
  pseudo?: string;
  lieu_de_travail?: string;
  occupation?: string;
  geocode?: string;
  prenom: string;
  nom: string;
  piece_identification?: 'NIF' | 'CIN' | 'Passeport' | '';
  email?: string;
  numero_telephone: string;
  adresse?: string;
  sexe: 'M' | 'F';
  date_naissance?: string;
  nif_cin?: string;
  photo_identification?: string;
  date_creation: string;
  statut: 'Actif' | 'Inactif';
  created_at: string;
  unique_id: string;
  id_plan?: number;
  montant?: number;
  created_by: string;
  updated_by?: string;
  updated_at?: string;
}

export interface CompteEpargne {
  id_compte_epargne: string;
  id_personne: string;
  no_compte: string;
  id_plan?: number;
  solde_actuel: number;
  fonds_garantie: number;
  statut?: 'Actif' | 'Inactif' | 'Fermé';
  date_creation: string;
  succursale?: string;
  duree?: number;
  person_allowed?: string;
  piece_identification_allowed?: string;
  nif_cin_allowed?: string;
  photo_allowed?: string;
  created_at: string;
  created_by: string;
  updated_by?: string;
  updated_at?: string;
}

export interface CompteCredit {
  id_compte_credit: string;
  id_personne: string;
  no_compte: string;
  id_compte_epargne: string;
  montant_prete: number;
  taux_interet: number;
  paiement_journalier: number;
  duree_credit_mois: number;
  fonds_garantie: number;
  penalites: number;
  date_creation: string;
  created_at: string;
  created_by: string;
  updated_by?: string;
  paiement_rembourse: number;
  updated_at?: string;
  statut?: 'Actif' | 'Payé' | 'En retard' | 'Fermé';
}

export interface TransactionCredit {
  id_transaction_credit: string;
  id_compte_credit: string;
  no_compte: string;
  type_transaction: 'Paiement' | 'Penalite' | 'Garantie';
  montant: number;
  solde_avant_transaction: number;
  date_transaction: string;
  montant_pret?: number;
  solde_credit?: number;
  created_at: string;
  created_by: string;
  versement_declare?: number;
  updated_at?: string;
}

export interface TransactionEpargne {
  id_transaction_epargne: string;
  id_compte_epargne: string;
  no_compte: string;
  type_transaction: 'D' | 'R' | 'FL' | 'S'; // Dépôt, Retrait, Frais Livret, Frais Service
  montant: number;
  solde_declare?: number;
  virement_from?: string;
  type_frais_livret?: string;
  solde_avant_transaction: number;
  date_transaction: string;
  solde_apres_transaction: number;
  created_at: string;
  created_by: string;
  updated_at?: string;
}

export interface SyncQueueItem {
  id?: number;
  table: 'personnes' | 'comptes_epargne' | 'comptes_credit' | 'transactions_epargne' | 'transactions_credit';
  action: 'add' | 'update' | 'delete';
  pk: string;
  data: any;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
  retry_count: number;
  updated_at: number;
  error?: string;
}

// For enriched data queries
export interface CompteEpargneAvecPersonne extends CompteEpargne {
  personne?: Personne;
}

export interface CompteCreditEnriched extends CompteCredit {
  personne?: Personne;
}

// Enriched transactions with client ID for access control
export interface TransactionEpargneEnriched extends TransactionEpargne {
  id_personne?: string;
}

export interface TransactionCreditEnriched extends TransactionCredit {
  id_personne?: string;
}
