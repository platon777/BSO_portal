export type CreditAccountType =
  | 'Credit Cash'
  | 'Konfyans'
  | 'Electromenager'
  | 'Lekol Ptit'
  | 'Loyer';

export const CREDIT_ACCOUNT_TYPE_OPTIONS: Array<{ value: CreditAccountType; label: string }> = [
  { value: 'Credit Cash', label: 'Crédit Cash' },
  { value: 'Konfyans', label: 'Konfyans' },
  { value: 'Electromenager', label: 'Électroménager' },
  { value: 'Lekol Ptit', label: 'Lekol Ptit' },
  { value: 'Loyer', label: 'Loyer' },
];

export const CREDIT_ACCOUNT_TYPE_VALUES = CREDIT_ACCOUNT_TYPE_OPTIONS.map((option) => option.value);

export const formatCreditAccountType = (value?: string | null): string => {
  if (!value) return '-';
  return CREDIT_ACCOUNT_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
};
