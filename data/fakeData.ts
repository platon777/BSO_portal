import { Personne, CompteEpargne, CompteCredit, TransactionEpargne, TransactionCredit } from '../types';

const MOCK_USER_ID = 'test27';

// UUIDs for linking data
const uuidPersonne1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const uuidPersonne2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const uuidCompteEpargne1 = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';
const uuidCompteCredit1 = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8g';
const uuidCompteEpargne2 = 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8g9h';


export const fakePersonnes: Partial<Personne>[] = [
  {
    id_personne: uuidPersonne1,
    code_client: 'C001',
    nom: 'Dupont',
    prenom: 'Jean',
    sexe: 'M',
    statut: 'Actif',
    date_creation: new Date('2023-01-15T09:00:00Z').toISOString(),
    created_at: new Date('2023-01-15T09:00:00Z').toISOString(),
    created_by: MOCK_USER_ID,
    numero_telephone: '123-456-7890',
    unique_id: `C001-${Date.now()}`,
    email: 'jean.dupont@example.com',
    adresse: '123 Rue Principale',
    nif_cin: '001-002-003-4',
    piece_identification: 'NIF'
  },
  {
    id_personne: uuidPersonne2,
    code_client: 'C002',
    nom: 'Martin',
    prenom: 'Marie',
    sexe: 'F',
    statut: 'Actif',
    date_creation: new Date('2023-02-20T14:30:00Z').toISOString(),
    created_at: new Date('2023-02-20T14:30:00Z').toISOString(),
    created_by: MOCK_USER_ID,
    numero_telephone: '123-456-7891',
    unique_id: `C002-${Date.now()}`,
    email: 'marie.martin@example.com',
    adresse: '456 Avenue Secondaire',
    nif_cin: 'AB-123456',
    piece_identification: 'CIN'
  },
];

export const fakeComptesEpargne: Partial<CompteEpargne>[] = [
  {
    id_compte_epargne: uuidCompteEpargne1,
    id_personne: uuidPersonne1,
    no_compte: 'E001',
    solde_actuel: 1500,
    fonds_garantie: 100,
    statut: 'Actif',
    date_creation: new Date('2023-01-15T09:05:00Z').toISOString(),
    created_at: new Date('2023-01-15T09:05:00Z').toISOString(),
    created_by: MOCK_USER_ID,
    succursale: 'Port-au-Prince',
    duree: 12,
  },
  {
    id_compte_epargne: uuidCompteEpargne2,
    id_personne: uuidPersonne2,
    no_compte: 'E002',
    solde_actuel: 3250,
    fonds_garantie: 250,
    statut: 'Actif',
    date_creation: new Date('2023-02-20T14:35:00Z').toISOString(),
    created_at: new Date('2023-02-20T14:35:00Z').toISOString(),
    created_by: MOCK_USER_ID,
    succursale: 'Delmas',
    duree: 24,
  }
];

export const fakeComptesCredit: Partial<CompteCredit>[] = [
  {
    id_compte_credit: uuidCompteCredit1,
    id_personne: uuidPersonne2,
    id_compte_epargne: uuidCompteEpargne2,
    no_compte: 'CR001',
    montant_prete: 5000,
    duree_credit_mois: 12,
    taux_interet: 5,
    paiement_journalier: 15,
    date_creation: new Date('2023-03-01T09:55:00Z').toISOString(),
    paiement_rembourse: 1000,
    fonds_garantie: 500,
    penalites: 50,
    statut: 'Actif',
    created_at: new Date('2023-03-01T09:55:00Z').toISOString(),
    created_by: MOCK_USER_ID,
  },
];

export const fakeTransactionsEpargne: Partial<TransactionEpargne>[] = [
    {
        id_transaction_epargne: 't-ep-1',
        id_compte_epargne: uuidCompteEpargne1,
        no_compte: 'E001',
        type_transaction: 'D',
        montant: 500,
        solde_avant_transaction: 1000,
        solde_apres_transaction: 1500,
        date_transaction: new Date('2023-05-10T10:00:00Z').toISOString(),
        created_at: new Date('2023-05-10T10:00:00Z').toISOString(),
        created_by: MOCK_USER_ID,
    },
];

export const fakeTransactionsCredit: Partial<TransactionCredit>[] = [
    {
        id_transaction_credit: 't-cr-1',
        id_compte_credit: uuidCompteCredit1,
        no_compte: 'CR001',
        type_transaction: 'Paiement',
        montant: 200,
        solde_avant_transaction: 4000,
        montant_pret: 5000,
        solde_credit: 3800,
        date_transaction: new Date('2023-06-15T11:00:00Z').toISOString(),
        created_at: new Date('2023-06-15T11:00:00Z').toISOString(),
        created_by: MOCK_USER_ID,
    }
];