-- Make the savings transaction trigger the authoritative writer for balances.
--
-- Context:
-- INSERT on transactions_epargne is intentionally allowed for agents, but the
-- trigger updates comptes_epargne. With SECURITY INVOKER, those account updates
-- are evaluated through the caller's RLS policies and virements can fail when
-- the caller has no direct access to the beneficiary account.

CREATE OR REPLACE FUNCTION public.apply_savings_transaction_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id uuid := NEW.id_compte_epargne;
  v_source_no_compte text;
  v_source_no_compte_ancien text;
  v_current_balance numeric := 0;
  v_new_balance numeric := 0;
  v_beneficiary_id uuid;
  v_beneficiary_no_compte text;
  v_beneficiary_balance numeric := 0;
  v_beneficiary_lookup text;
  v_beneficiary_lookup_uuid uuid;
  v_delta numeric := 0;
  v_locked record;
BEGIN
  IF NEW.montant IS NULL OR NEW.montant <= 0 THEN
    RAISE EXCEPTION 'Montant invalide pour transaction epargne: %', NEW.montant
      USING ERRCODE = '23514';
  END IF;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Compte epargne manquant pour transaction epargne'
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

  IF NEW.type_transaction = 'V' THEN
    v_beneficiary_lookup := NULLIF(BTRIM(COALESCE(NEW.virement_to, '')), '');

    IF v_beneficiary_lookup IS NULL THEN
      RAISE EXCEPTION 'Compte beneficiaire manquant pour virement epargne'
        USING ERRCODE = '23514';
    END IF;

    BEGIN
      v_beneficiary_lookup_uuid := v_beneficiary_lookup::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_beneficiary_lookup_uuid := NULL;
    END;

    SELECT ce.id_compte_epargne, ce.no_compte
      INTO v_beneficiary_id, v_beneficiary_no_compte
    FROM public.comptes_epargne ce
    WHERE ce.no_compte = v_beneficiary_lookup
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT ce.id_compte_epargne, ce.no_compte
        INTO v_beneficiary_id, v_beneficiary_no_compte
      FROM public.comptes_epargne ce
      WHERE ce.no_compte_ancien = v_beneficiary_lookup
      LIMIT 1;
    END IF;

    IF NOT FOUND AND v_beneficiary_lookup_uuid IS NOT NULL THEN
      SELECT ce.id_compte_epargne, ce.no_compte
        INTO v_beneficiary_id, v_beneficiary_no_compte
      FROM public.comptes_epargne ce
      WHERE ce.id_compte_epargne = v_beneficiary_lookup_uuid
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compte beneficiaire introuvable: %', NEW.virement_to
        USING ERRCODE = '23503';
    END IF;

    IF NULLIF(BTRIM(COALESCE(v_beneficiary_no_compte, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Compte beneficiaire sans no_compte canonique: %', NEW.virement_to
        USING ERRCODE = '23514';
    END IF;

    IF v_beneficiary_id = v_source_id THEN
      RAISE EXCEPTION 'Virement impossible vers le meme compte epargne: %', NEW.virement_to
        USING ERRCODE = '23514';
    END IF;

    -- Lock both accounts in deterministic order to avoid cross-transfer deadlocks.
    FOR v_locked IN
      SELECT
        ce.id_compte_epargne,
        ce.no_compte,
        ce.no_compte_ancien,
        COALESCE(ce.solde_actuel, 0) AS solde_actuel
      FROM public.comptes_epargne ce
      WHERE ce.id_compte_epargne IN (v_source_id, v_beneficiary_id)
      ORDER BY ce.id_compte_epargne
      FOR UPDATE
    LOOP
      IF v_locked.id_compte_epargne = v_source_id THEN
        v_source_no_compte := v_locked.no_compte;
        v_source_no_compte_ancien := v_locked.no_compte_ancien;
        v_current_balance := v_locked.solde_actuel;
      ELSIF v_locked.id_compte_epargne = v_beneficiary_id THEN
        v_beneficiary_balance := v_locked.solde_actuel;
      END IF;
    END LOOP;

    IF v_source_no_compte IS NULL THEN
      RAISE EXCEPTION 'Compte epargne introuvable: %', v_source_id
        USING ERRCODE = '23503';
    END IF;

    IF NULLIF(BTRIM(COALESCE(v_source_no_compte, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Compte emetteur sans no_compte canonique: %', v_source_id
        USING ERRCODE = '23514';
    END IF;

    -- Canonical values stored on transactions_epargne.
    IF NULLIF(BTRIM(COALESCE(NEW.virement_from, '')), '') IS NULL
      OR NEW.virement_from = v_source_no_compte
      OR NEW.virement_from = v_source_no_compte_ancien
      OR NEW.virement_from = v_source_id::text
    THEN
      NEW.virement_from := v_source_no_compte;
    ELSE
      RAISE EXCEPTION 'Compte emetteur invalide pour virement epargne: %', NEW.virement_from
        USING ERRCODE = '23514';
    END IF;

    NEW.virement_to := v_beneficiary_no_compte;
  ELSE
    SELECT ce.no_compte, ce.no_compte_ancien, COALESCE(ce.solde_actuel, 0)
      INTO v_source_no_compte, v_source_no_compte_ancien, v_current_balance
    FROM public.comptes_epargne ce
    WHERE ce.id_compte_epargne = v_source_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compte epargne introuvable: %', v_source_id
        USING ERRCODE = '23503';
    END IF;

    IF NULLIF(BTRIM(COALESCE(v_source_no_compte, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Compte epargne sans no_compte canonique: %', v_source_id
        USING ERRCODE = '23514';
    END IF;

    NEW.virement_from := NULL;
    NEW.virement_to := NULL;
  END IF;

  v_new_balance := v_current_balance + v_delta;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Solde insuffisant sur le compte %. Solde disponible: %, Montant demande: %',
      COALESCE(v_source_no_compte, NEW.no_compte),
      v_current_balance,
      NEW.montant
      USING ERRCODE = 'P0001';
  END IF;

  NEW.no_compte := COALESCE(NULLIF(BTRIM(COALESCE(NEW.no_compte, '')), ''), v_source_no_compte);
  NEW.solde_avant_transaction := v_current_balance;
  NEW.solde_apres_transactions := v_new_balance;

  UPDATE public.comptes_epargne
  SET
    solde_actuel = v_new_balance,
    updated_at = now(),
    updated_by = COALESCE(NEW.created_by, updated_by)
  WHERE id_compte_epargne = v_source_id;

  IF NEW.type_transaction = 'V' THEN
    UPDATE public.comptes_epargne
    SET
      solde_actuel = v_beneficiary_balance + NEW.montant,
      updated_at = now(),
      updated_by = COALESCE(NEW.created_by, updated_by)
    WHERE id_compte_epargne = v_beneficiary_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_savings_transaction_balance() FROM PUBLIC;
