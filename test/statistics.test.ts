import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de la base locale (Dexie) pour tester la logique pure de getAgentStats.
vi.mock('../services/database', () => ({
  db: {
    comptes_credit: { toArray: vi.fn() },
    comptes_epargne: { toArray: vi.fn() },
    transactions_epargne: { toArray: vi.fn() },
    transactions_credit: { toArray: vi.fn() },
  },
}));

import { getAgentStats } from '../services/statistics';
import { db } from '../services/database';

const U = 'u1';
const setDb = (data: {
  comptesCredit?: any[];
  comptesEpargne?: any[];
  txEpargne?: any[];
  txCredit?: any[];
}) => {
  (db.comptes_credit.toArray as any).mockResolvedValue(data.comptesCredit ?? []);
  (db.comptes_epargne.toArray as any).mockResolvedValue(data.comptesEpargne ?? []);
  (db.transactions_epargne.toArray as any).mockResolvedValue(data.txEpargne ?? []);
  (db.transactions_credit.toArray as any).mockResolvedValue(data.txCredit ?? []);
};

beforeEach(() => vi.clearAllMocks());

describe('getAgentStats — rapport agent temps réel dès la collecte', () => {
  it('sépare les dépôts par catégorie, exclut solde initial, gère les retraits et soldes cumulés', async () => {
    setDb({
      comptesEpargne: [{ id_compte_epargne: 'a1', created_by: U, solde_actuel: 300 }],
      txEpargne: [
        { created_by: U, type_transaction: 'D', montant: 100, categorie_compte_epargne: 'Epargne', validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'D', montant: 50, categorie_compte_epargne: 'Fonds Garantie', validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'D', montant: 20, categorie_compte_epargne: 'Grandon', validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'D', montant: 999, is_solde_initial: true, validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'R', montant: 30, categorie_compte_epargne: 'Epargne', validation_status: 'confirmed' },
      ],
    });
    const s = await getAgentStats(U, { type: 'all' });
    expect(s.montant_transactions_epargne_depot).toBe(100);
    expect(s.montant_depot_fonds_garantie).toBe(50);
    expect(s.montant_depot_grandon).toBe(20);
    expect(s.montant_transactions_epargne_retrait).toBe(30);
    expect(s.solde_cumule).toBe(300);
  });

  it('intègre immédiatement toute transaction collectée (en attente ou confirmée) dans le rapport et Total Cash, tout en ignorant les rejets', async () => {
    setDb({
      txEpargne: [
        { created_by: U, type_transaction: 'D', montant: 100, categorie_compte_epargne: 'Epargne', validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'D', montant: 200, categorie_compte_epargne: 'Epargne', validation_status: 'pending' },
        { created_by: U, type_transaction: 'D', montant: 500, categorie_compte_epargne: 'Epargne', validation_status: 'rejected' },
      ],
      txCredit: [
        { created_by: U, type_transaction: 'Paiement', montant: 40, validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'Paiement', montant: 70, validation_status: 'pending' },
      ],
    });
    const s = await getAgentStats(U, { type: 'all' });
    // Total dépôts = 100 (validé) + 200 (en attente) = 300 (le rejet 500 est exclu)
    expect(s.montant_transactions_epargne_depot).toBe(300);
    expect(s.transactions_epargne_depot).toBe(2);

    // Total paiements crédit = 40 (validé) + 70 (en attente) = 110
    expect(s.montant_transactions_credit_paiement).toBe(110);
    expect(s.transactions_credit_paiement).toBe(2);
    expect(s.versement_cumule).toBe(110);

    // Les sous-totaux en attente sont également suivis
    expect(s.montant_depot_en_attente).toBe(200);
    expect(s.transactions_depot_en_attente).toBe(1);
    expect(s.montant_paiement_en_attente).toBe(70);
    expect(s.transactions_paiement_en_attente).toBe(1);

    // Total Cash Collecté physique = 300 + 110 = 410
    expect(s.total_cash).toBe(410);
  });

  it('ventile les paiements de crédit par catégorie de produit (Cash, Konfyans, Électroménager)', async () => {
    setDb({
      comptesCredit: [
        { id_compte_credit: 'c1', type_compte_credit: 'Credit Cash' },
        { id_compte_credit: 'c2', type_compte_credit: 'Konfyans' },
        { id_compte_credit: 'c3', type_compte_credit: 'Electromenager' },
      ],
      txCredit: [
        { created_by: U, id_compte_credit: 'c1', type_transaction: 'Paiement', montant: 150, validation_status: 'confirmed' },
        { created_by: U, id_compte_credit: 'c2', type_transaction: 'Paiement', montant: 250, validation_status: 'confirmed' },
        { created_by: U, id_compte_credit: 'c3', type_transaction: 'Paiement', montant: 350, validation_status: 'confirmed' },
      ],
    });
    const s = await getAgentStats(U, { type: 'all' });
    expect(s.transactions_paiement_credit_cash).toBe(1);
    expect(s.montant_paiement_credit_cash).toBe(150);

    expect(s.transactions_paiement_credit_konfyans).toBe(1);
    expect(s.montant_paiement_credit_konfyans).toBe(250);

    expect(s.transactions_paiement_credit_electromenager).toBe(1);
    expect(s.montant_paiement_credit_electromenager).toBe(350);

    expect(s.transactions_credit_paiement).toBe(3);
    expect(s.montant_transactions_credit_paiement).toBe(750);
  });

  it('gère les transactions de virement et les frais', async () => {
    setDb({
      txEpargne: [
        { created_by: U, type_transaction: 'V', montant: 500, validation_status: 'pending' },
        { created_by: U, type_transaction: 'FL', montant: 50, validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'FA', montant: 25, validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'S', montant: 10, validation_status: 'confirmed' },
      ],
    });
    const s = await getAgentStats(U, { type: 'all' });
    expect(s.transactions_virement).toBe(1);
    expect(s.montant_transactions_virement).toBe(500);
    expect(s.montant_transactions_frais_livret).toBe(50);
    expect(s.montant_transactions_frais_auto).toBe(25);
    expect(s.montant_transactions_epargne_frais_service).toBe(10);
  });

  it('décaissement crédit par type + Total Cash physique complet', async () => {
    setDb({
      comptesCredit: [
        { created_by: U, type_compte_credit: 'Credit Cash', montant_prete: 1000 },
        { created_by: U, type_compte_credit: 'Konfyans', montant_prete: 500 },
      ],
      txEpargne: [
        { created_by: U, type_transaction: 'D', montant: 100, categorie_compte_epargne: 'Epargne', validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'D', montant: 50, categorie_compte_epargne: 'Fonds Garantie', validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'D', montant: 20, categorie_compte_epargne: 'Grandon', validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'R', montant: 30, categorie_compte_epargne: 'Epargne', validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'D', montant: 200, categorie_compte_epargne: 'Epargne', validation_status: 'pending' },
      ],
      txCredit: [
        { created_by: U, type_transaction: 'Paiement', montant: 40, validation_status: 'confirmed' },
        { created_by: U, type_transaction: 'Penalite', montant: 10, validation_status: 'confirmed' },
      ],
    });
    const s = await getAgentStats(U, { type: 'all' });
    expect(s.montant_credit_cash).toBe(1000);
    expect(s.montant_credit_konfyans).toBe(500);
    // Total Cash Collecté physique = (100 + 50 + 20 + 200) - 30 + 40 + 10 = 390
    expect(s.total_cash).toBe(390);
  });

  it('ignore les transactions d un autre agent', async () => {
    setDb({
      txEpargne: [
        { created_by: 'autre', type_transaction: 'D', montant: 100, categorie_compte_epargne: 'Epargne', validation_status: 'confirmed' },
      ],
    });
    const s = await getAgentStats(U, { type: 'all' });
    expect(s.montant_transactions_epargne_depot).toBe(0);
  });
});
