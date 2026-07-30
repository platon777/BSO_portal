import { describe, it, expect } from 'vitest';
import {
  buildSavingsAccountSyncSummary,
  getSavingsTransactionDelta,
} from '../services/savingsAccountService';
import {
  buildCreditAccountSyncSummary,
  getCreditTransactionPaidDelta,
} from '../services/creditAccountService';

const q = (over: any) => ({
  id: 1, table: 'transactions_epargne', action: 'add', pk: 't1',
  status: 'pending', timestamp: 0, retry_count: 0, updated_at: 0, ...over,
});

describe('savings sync summary', () => {
  it('delta: depot positif, retrait/virement negatif', () => {
    expect(getSavingsTransactionDelta({ type_transaction: 'D', montant: 50 })).toBe(50);
    expect(getSavingsTransactionDelta({ type_transaction: 'R', montant: 50 })).toBe(-50);
    expect(getSavingsTransactionDelta({ type_transaction: 'V', montant: 10 })).toBe(-10);
    expect(getSavingsTransactionDelta({ type_transaction: 'D', montant: 0 })).toBe(0);
  });

  it('solde confirme = solde local - deltas en attente', () => {
    const compte = { id_compte_epargne: 'a1', solde_actuel: 100 } as any;
    const items = [q({ table: 'transactions_epargne', status: 'pending', data: { id_compte_epargne: 'a1', type_transaction: 'D', montant: 20 } })];
    const s = buildSavingsAccountSyncSummary(compte, items as any);
    expect(s.pendingDelta).toBe(20);
    expect(s.confirmedBalanceEstimate).toBe(80); // 100 - 20
    expect(s.projectedBalance).toBe(100);
    expect(s.pendingCount).toBe(1);
    expect(s.hasBlockingIssue).toBe(false);
  });

  it('un item en echec est un probleme bloquant', () => {
    const compte = { id_compte_epargne: 'a1', solde_actuel: 100 } as any;
    const items = [q({ table: 'transactions_epargne', status: 'failed', data: { id_compte_epargne: 'a1', type_transaction: 'R', montant: 10 } })];
    const s = buildSavingsAccountSyncSummary(compte, items as any);
    expect(s.failedCount).toBe(1);
    expect(s.hasBlockingIssue).toBe(true);
  });
});

describe('credit sync summary', () => {
  it('delta paye = montant pour Paiement, 0 pour Penalite', () => {
    expect(getCreditTransactionPaidDelta({ type_transaction: 'Paiement', montant: 50 })).toBe(50);
    expect(getCreditTransactionPaidDelta({ type_transaction: 'Penalite', montant: 50 })).toBe(0);
  });

  it('paye/restant confirmes = valeurs locales moins paiements en attente', () => {
    const compte = {
      id_compte_credit: 'c1', montant_prete: 1000, taux_interet: 0, duree_credit_mois: 1,
      paiement_rembourse: 200, montant_deja_paye_manuellement: 0,
    } as any;
    const items = [q({ table: 'transactions_credit', status: 'pending', data: { id_compte_credit: 'c1', type_transaction: 'Paiement', montant: 50 } })];
    const s = buildCreditAccountSyncSummary(compte, items as any);
    expect(s.pendingPaidDelta).toBe(50);
    expect(s.confirmedPaidEstimate).toBe(150); // 200 - 50
    expect(s.confirmedRemainingEstimate).toBe(850); // 1000 - 150
    expect(s.projectedPaid).toBe(200);
    expect(s.projectedRemaining).toBe(800);
  });
});
