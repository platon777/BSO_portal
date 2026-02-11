import { CompteCredit } from '../types';

const toSafeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateCreditFinalCapital = (
  montantPrete: number,
  tauxInteretMensuel: number,
  dureeMois: number
): number => {
  const principal = toSafeNumber(montantPrete);
  const taux = toSafeNumber(tauxInteretMensuel);
  const duree = toSafeNumber(dureeMois);
  return principal * (1 + taux * duree);
};

export const getCreditFinalCapital = (
  compte: Pick<CompteCredit, 'montant_prete' | 'taux_interet' | 'duree_credit_mois'>
): number => {
  return calculateCreditFinalCapital(compte.montant_prete, compte.taux_interet, compte.duree_credit_mois);
};

export const getCreditTotalRembourse = (
  compte: Pick<CompteCredit, 'paiement_rembourse' | 'montant_deja_paye_manuellement'>
): number => {
  return toSafeNumber(compte.paiement_rembourse) + toSafeNumber(compte.montant_deja_paye_manuellement);
};

export const getCreditMontantRestant = (
  compte: Pick<CompteCredit, 'montant_prete' | 'taux_interet' | 'duree_credit_mois' | 'paiement_rembourse' | 'montant_deja_paye_manuellement'>
): number => {
  return getCreditFinalCapital(compte) - getCreditTotalRembourse(compte);
};
