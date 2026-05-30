-- Imported or Supabase-created accounts may legitimately have no legacy code.
-- Keep uniqueness when a legacy code exists, but normalize blanks to NULL.

UPDATE public.comptes_epargne
SET no_compte_ancien = NULL
WHERE BTRIM(COALESCE(no_compte_ancien, '')) = '';

UPDATE public.comptes_credit
SET ancien_code = NULL
WHERE BTRIM(COALESCE(ancien_code, '')) = '';

ALTER TABLE public.comptes_epargne
  ALTER COLUMN no_compte_ancien DROP NOT NULL;

ALTER TABLE public.comptes_credit
  ALTER COLUMN ancien_code DROP NOT NULL;
