ALTER TABLE public.comptes_credit
  ADD COLUMN IF NOT EXISTS type_compte_credit text;

ALTER TABLE public.comptes_credit
  DROP CONSTRAINT IF EXISTS comptes_credit_type_compte_credit_check;

ALTER TABLE public.comptes_credit
  ADD CONSTRAINT comptes_credit_type_compte_credit_check
  CHECK (
    type_compte_credit IS NULL
    OR type_compte_credit IN (
      'Credit Cash',
      'Konfyans',
      'Electromenager',
      'Lekol Ptit',
      'Loyer'
    )
  ) NOT VALID;

ALTER TABLE public.comptes_credit
  VALIDATE CONSTRAINT comptes_credit_type_compte_credit_check;

CREATE INDEX IF NOT EXISTS idx_comptes_credit_type_compte_credit
  ON public.comptes_credit(type_compte_credit);
