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
  comptesCredit?: any[]; comptesEpargne?: any[]; txEpargne?: any[]; txCredit?: any[];
}) => {
  (db.comptes_credit.toArray as any).mockResolvedValue(data.comptesCredit ?? []);
  (db.comptes_epargne.toArray as any).mockResolvedValue(data.comptesEpargne ?? []);
  (db.transactions_epargne.toArray as any).mockResolvedValue(data.txEpargne ?? []);
  (db.transactions_credit.toArray as any).mockResolvedValue(data.txCredit ?? []);
};

beforeEach(() => vi.clearAllMocks());

describe('getAgentStats — rapport agent', () => {
  it('separe les depots par categorie, exclut solde initial, retrait Epargne', async () => {
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

  it('met les ENTREES en attente de validation hors des totaux reels', async () => {
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
    // Confirme -> compte
    expect(s.montant_transactions_epargne_depot).toBe(100);
    expect(s.montant_transactions_credit_paiement).toBe(40);
    expect(s.versement_cumule).toBe(40);
    // En attente -> bloc separe, PAS dans le reel
    expect(s.montant_depot_en_attente).toBe(200);
    expect(s.transactions_depot_en_attente).toBe(1);
    expect(s.montant_paiement_en_attente).toBe(70);
    expect(s.transactions_paiement_en_attente).toBe(1);
    // Refuse -> nulle part
    // (rien a asserter de plus : 500 n'apparait dans aucun total)
  });

  it('legacy (validation_status absent) est traite comme confirme', async () => {
    setDb({
      txEpargne: [{ created_by: U, type_transaction: 'D', montant: 80, categorie_compte_epargne: 'Epargne' }],
    });
    const s = await getAgentStats(U, { type: 'all' });
    expect(s.montant_transactions_epargne_depot).toBe(80);
    expect(s.montant_depot_en_attente).toBe(0);
  });

  it('decaissement credit par type + Total Cash valide (hors en attente)', async () => {
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
    // Total Cash = 100 + 50 + 20 - 30 + 40 + 10 = 190 (le depot en attente 200 est exclu)
    expect(s.total_cash).toBe(190);
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
