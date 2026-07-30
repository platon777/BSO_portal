import { describe, it, expect } from 'vitest';
import {
  calculateCreditFinalCapital,
  getCreditFinalCapital,
  getCreditTotalRembourse,
  getCreditMontantRestant,
} from '../utils/creditCalculations';

describe('creditCalculations', () => {
  it('capital final = principal * (1 + taux%/100 * duree)', () => {
    expect(calculateCreditFinalCapital(1000, 10, 2)).toBe(1200); // 10%/mois * 2 mois
    expect(getCreditFinalCapital({ montant_prete: 1000, taux_interet: 10, duree_credit_mois: 2 } as any)).toBe(1200);
  });

  it('normalise les taux au format decimal (0.07 -> 7%)', () => {
    expect(calculateCreditFinalCapital(1000, 0.07, 1)).toBeCloseTo(1070, 5);
  });

  it('normalise les taux double-scale (700 -> 7%)', () => {
    expect(calculateCreditFinalCapital(1000, 700, 1)).toBeCloseTo(1070, 5);
  });

  it('total rembourse = paiement + paye manuellement', () => {
    expect(getCreditTotalRembourse({ paiement_rembourse: 200, montant_deja_paye_manuellement: 100 } as any)).toBe(300);
  });

  it('montant restant = final - total rembourse', () => {
    const compte = {
      montant_prete: 1000, taux_interet: 10, duree_credit_mois: 2,
      paiement_rembourse: 200, montant_deja_paye_manuellement: 100,
    } as any;
    expect(getCreditMontantRestant(compte)).toBe(900); // 1200 - 300
  });

  it('tolere les valeurs invalides (NaN -> 0)', () => {
    expect(calculateCreditFinalCapital(NaN as any, NaN as any, NaN as any)).toBe(0);
  });
});
