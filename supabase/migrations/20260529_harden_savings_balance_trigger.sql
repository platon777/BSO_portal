-- Harden savings balance updates so the database remains the final source of truth.
-- The trigger locks the savings account row before computing debit/credit balances.

CREATE OR REPLACE FUNCTION public.apply_savings_transaction_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_balance numeric := 0;
  v_new_balance numeric := 0;
  v_beneficiary_balance numeric := 0;
  v_delta numeric := 0;
BEGIN
  IF NEW.montant IS NULL OR NEW.montant <= 0 THEN
    RAISE EXCEPTION 'Montant invalide pour transaction epargne: %', NEW.montant
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(solde_actuel, 0)
    INTO v_current_balance
  FROM public.comptes_epargne
  WHERE id_compte_epargne = NEW.id_compte_epargne
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte epargne introuvable: %', NEW.id_compte_epargne
      USING ERRCODE = '23503';
  END IF;

  IF NEW.type_transaction = 'D' THEN
    v_delta := NEW.montant;
  ELSIF NEW.type_transaction IN ('R', 'FL', 'S', 'FA', 'V') THEN
    v_delta := -NEW.montant;
  ELSE
    RAISE EXCEPTION 'Type transaction epargne invalide: %', NEW.type_transaction
      USING ERRCODE = '23514';
  END IF;

  v_new_balance := v_current_balance + v_delta;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Solde insuffisant sur le compte %. Solde disponible: %, Montant demande: %',
      NEW.no_compte,
      v_current_balance,
      NEW.montant
      USING ERRCODE = 'P0001';
  END IF;

  NEW.solde_avant_transaction := v_current_balance;
  NEW.solde_apres_transactions := v_new_balance;

  UPDATE public.comptes_epargne
  SET
    solde_actuel = v_new_balance,
    updated_at = now(),
    updated_by = COALESCE(NEW.created_by, updated_by)
  WHERE id_compte_epargne = NEW.id_compte_epargne;

  IF NEW.type_transaction = 'V' THEN
    IF NULLIF(BTRIM(COALESCE(NEW.virement_to, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Compte beneficiaire manquant pour virement epargne'
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(solde_actuel, 0)
      INTO v_beneficiary_balance
    FROM public.comptes_epargne
    WHERE no_compte = NEW.virement_to
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compte beneficiaire introuvable: %', NEW.virement_to
        USING ERRCODE = '23503';
    END IF;

    UPDATE public.comptes_epargne
    SET
      solde_actuel = v_beneficiary_balance + NEW.montant,
      updated_at = now(),
      updated_by = COALESCE(NEW.created_by, updated_by)
    WHERE no_compte = NEW.virement_to;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_transaction_insert ON public.transactions_epargne;
DROP TRIGGER IF EXISTS trigger_update_savings_balance ON public.transactions_epargne;
DROP TRIGGER IF EXISTS update_savings_balance_trigger ON public.transactions_epargne;
DROP TRIGGER IF EXISTS trg_apply_savings_transaction_balance ON public.transactions_epargne;

CREATE TRIGGER trg_apply_savings_transaction_balance
BEFORE INSERT ON public.transactions_epargne
FOR EACH ROW
EXECUTE FUNCTION public.apply_savings_transaction_balance();
