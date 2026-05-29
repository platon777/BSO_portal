-- Harden credit payment synchronization.
-- A credit payment must atomically update the transaction snapshot and the account totals.

SET lock_timeout = '5s';

ALTER TABLE public.transactions_credit
  ADD COLUMN IF NOT EXISTS solde_avant_transaction numeric;

CREATE OR REPLACE FUNCTION public.apply_credit_transaction_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_credit record;
  v_paid_before numeric := 0;
  v_paid_after numeric := 0;
  v_final_amount numeric := 0;
  v_remaining_before numeric := 0;
  v_remaining_after numeric := 0;
BEGIN
  IF NEW.montant IS NULL OR NEW.montant <= 0 THEN
    RAISE EXCEPTION 'Montant invalide pour transaction credit: %', NEW.montant
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_credit
  FROM public.comptes_credit
  WHERE id_compte_credit = NEW.id_compte_credit
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte credit introuvable: %', NEW.id_compte_credit
      USING ERRCODE = '23503';
  END IF;

  v_paid_before := COALESCE(v_credit.paiement_cumule, 0);
  v_final_amount := COALESCE(
    v_credit.montant_final,
    v_credit.montant_prete * (1 + (COALESCE(v_credit.taux_interet, 0) / 100) * COALESCE(v_credit.duree_credit_mois, 0))
  );
  v_remaining_before := GREATEST(v_final_amount - v_paid_before, 0);

  NEW.montant_pret := v_credit.montant_prete;
  NEW.solde_avant_transaction := v_remaining_before;

  IF NEW.type_transaction = 'Paiement' THEN
    IF NEW.montant > v_remaining_before THEN
      RAISE EXCEPTION 'Remboursement superieur au montant restant sur le compte credit %. Restant confirme: %, Montant demande: %',
        NEW.no_compte,
        v_remaining_before,
        NEW.montant
        USING ERRCODE = 'P0001';
    END IF;

    v_paid_after := v_paid_before + NEW.montant;
    v_remaining_after := GREATEST(v_final_amount - v_paid_after, 0);

    NEW.paiement_cumule := v_paid_after;
    NEW.montant_restant := v_remaining_after;

    UPDATE public.comptes_credit
    SET
      paiement_cumule = v_paid_after,
      montant_restant = v_remaining_after,
      updated_at = now(),
      updated_by = COALESCE(NEW.created_by, updated_by)
    WHERE id_compte_credit = NEW.id_compte_credit;
  ELSIF NEW.type_transaction = 'Penalite' THEN
    NEW.paiement_cumule := v_paid_before;
    NEW.montant_restant := v_remaining_before;

    UPDATE public.comptes_credit
    SET
      penalites = COALESCE(penalites, 0) + NEW.montant,
      updated_at = now(),
      updated_by = COALESCE(NEW.created_by, updated_by)
    WHERE id_compte_credit = NEW.id_compte_credit;
  ELSE
    RAISE EXCEPTION 'Type transaction credit invalide: %', NEW.type_transaction
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_credit_amounts ON public.transactions_credit;
DROP TRIGGER IF EXISTS trigger_update_compte_after_transaction ON public.transactions_credit;
DROP TRIGGER IF EXISTS trg_apply_credit_transaction_amounts ON public.transactions_credit;

CREATE TRIGGER trg_apply_credit_transaction_amounts
BEFORE INSERT ON public.transactions_credit
FOR EACH ROW
EXECUTE FUNCTION public.apply_credit_transaction_amounts();
