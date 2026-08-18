-- Migration: 20260818_virement_and_bulk_validation.sql
-- Objectif:
-- 1. Permettre la validation différée des virements 'V' (validation_status = 'pending' -> 'confirmed'/'rejected')
-- 2. Fonction RPC set_bulk_transaction_validation pour validation haute performance par lot

SET lock_timeout = '5s';

-- 1) Trigger epargne: supporter validation différée pour 'D' et 'V'
CREATE OR REPLACE FUNCTION public.apply_savings_transaction_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_defer boolean := false;
BEGIN
  IF NEW.montant IS NULL OR NEW.montant <= 0 THEN
    RAISE EXCEPTION 'Montant invalide pour transaction epargne: %', NEW.montant USING ERRCODE = '23514';
  END IF;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Compte epargne manquant pour transaction epargne' USING ERRCODE = '23503';
  END IF;

  -- Les dépôts 'D' et virements 'V' sont soumis à validation si créés avec statut 'pending'
  IF NEW.type_transaction NOT IN ('D', 'V') OR COALESCE(NEW.is_solde_initial, false) THEN
    NEW.validation_status := 'confirmed';
  END IF;
  v_defer := (NEW.type_transaction IN ('D', 'V') AND COALESCE(NEW.validation_status, 'confirmed') = 'pending' AND NOT COALESCE(NEW.is_solde_initial, false));

  IF NEW.type_transaction = 'D' THEN
    v_delta := NEW.montant;
  ELSIF NEW.type_transaction IN ('R', 'FL', 'S', 'FA', 'V') THEN
    v_delta := -NEW.montant;
  ELSE
    RAISE EXCEPTION 'Type transaction epargne invalide: %', NEW.type_transaction USING ERRCODE = '23514';
  END IF;

  IF NEW.type_transaction = 'V' THEN
    v_beneficiary_lookup := NULLIF(BTRIM(COALESCE(NEW.virement_to, '')), '');
    IF v_beneficiary_lookup IS NULL THEN
      RAISE EXCEPTION 'Compte beneficiaire manquant pour virement epargne' USING ERRCODE = '23514';
    END IF;
    BEGIN
      v_beneficiary_lookup_uuid := v_beneficiary_lookup::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_beneficiary_lookup_uuid := NULL;
    END;

    SELECT ce.id_compte_epargne, ce.no_compte INTO v_beneficiary_id, v_beneficiary_no_compte
    FROM public.comptes_epargne ce WHERE ce.no_compte = v_beneficiary_lookup LIMIT 1;
    IF NOT FOUND THEN
      SELECT ce.id_compte_epargne, ce.no_compte INTO v_beneficiary_id, v_beneficiary_no_compte
      FROM public.comptes_epargne ce WHERE ce.no_compte_ancien = v_beneficiary_lookup LIMIT 1;
    END IF;
    IF NOT FOUND AND v_beneficiary_lookup_uuid IS NOT NULL THEN
      SELECT ce.id_compte_epargne, ce.no_compte INTO v_beneficiary_id, v_beneficiary_no_compte
      FROM public.comptes_epargne ce WHERE ce.id_compte_epargne = v_beneficiary_lookup_uuid LIMIT 1;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compte beneficiaire introuvable: %', NEW.virement_to USING ERRCODE = '23503';
    END IF;

    IF NULLIF(BTRIM(COALESCE(v_beneficiary_no_compte, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Compte beneficiaire sans no_compte canonique: %', NEW.virement_to USING ERRCODE = '23514';
    END IF;
    IF v_beneficiary_id = v_source_id THEN
      RAISE EXCEPTION 'Virement impossible vers le meme compte epargne: %', NEW.virement_to USING ERRCODE = '23514';
    END IF;

    FOR v_locked IN
      SELECT ce.id_compte_epargne, ce.no_compte, ce.no_compte_ancien, COALESCE(ce.solde_actuel, 0) AS solde_actuel
      FROM public.comptes_epargne ce
      WHERE ce.id_compte_epargne IN (v_source_id, v_beneficiary_id)
      ORDER BY ce.id_compte_epargne FOR UPDATE
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
      RAISE EXCEPTION 'Compte epargne introuvable: %', v_source_id USING ERRCODE = '23503';
    END IF;
    IF NULLIF(BTRIM(COALESCE(v_source_no_compte, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Compte emetteur sans no_compte canonique: %', v_source_id USING ERRCODE = '23514';
    END IF;

    IF NULLIF(BTRIM(COALESCE(NEW.virement_from, '')), '') IS NULL
      OR NEW.virement_from = v_source_no_compte
      OR NEW.virement_from = v_source_no_compte_ancien
      OR NEW.virement_from = v_source_id::text
    THEN
      NEW.virement_from := v_source_no_compte;
    ELSE
      RAISE EXCEPTION 'Compte emetteur invalide pour virement epargne: %', NEW.virement_from USING ERRCODE = '23514';
    END IF;
    NEW.virement_to := v_beneficiary_no_compte;
  ELSE
    SELECT ce.no_compte, ce.no_compte_ancien, COALESCE(ce.solde_actuel, 0)
      INTO v_source_no_compte, v_source_no_compte_ancien, v_current_balance
    FROM public.comptes_epargne ce WHERE ce.id_compte_epargne = v_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compte epargne introuvable: %', v_source_id USING ERRCODE = '23503';
    END IF;
    IF NULLIF(BTRIM(COALESCE(v_source_no_compte, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Compte epargne sans no_compte canonique: %', v_source_id USING ERRCODE = '23514';
    END IF;
    NEW.virement_from := NULL;
    NEW.virement_to := NULL;
  END IF;

  v_new_balance := v_current_balance + v_delta;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Solde insuffisant sur le compte %. Solde disponible: %, Montant demande: %',
      COALESCE(v_source_no_compte, NEW.no_compte), v_current_balance, NEW.montant USING ERRCODE = 'P0001';
  END IF;

  NEW.no_compte := COALESCE(NULLIF(BTRIM(COALESCE(NEW.no_compte, '')), ''), v_source_no_compte);
  NEW.solde_avant_transaction := v_current_balance;
  NEW.solde_apres_transactions := v_new_balance;

  -- Si non différé (confirmé immédiatement) : mettre à jour le solde serveur
  IF NOT v_defer THEN
    UPDATE public.comptes_epargne
    SET solde_actuel = v_new_balance, updated_at = now(), updated_by = COALESCE(NEW.created_by, updated_by)
    WHERE id_compte_epargne = v_source_id;

    IF NEW.type_transaction = 'V' THEN
      UPDATE public.comptes_epargne
      SET solde_actuel = v_beneficiary_balance + NEW.montant, updated_at = now(), updated_by = COALESCE(NEW.created_by, updated_by)
      WHERE id_compte_epargne = v_beneficiary_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Application à la validation pour 'D' et 'V'
CREATE OR REPLACE FUNCTION public.apply_savings_validation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_beneficiary_id uuid;
BEGIN
  IF OLD.validation_status = 'pending' AND NEW.validation_status = 'confirmed' THEN
    IF NEW.type_transaction = 'D' THEN
      UPDATE public.comptes_epargne
      SET solde_actuel = COALESCE(solde_actuel, 0) + NEW.montant, updated_at = now(),
          updated_by = COALESCE(NEW.validated_by, updated_by)
      WHERE id_compte_epargne = NEW.id_compte_epargne;
    ELSIF NEW.type_transaction = 'V' THEN
      -- Débit compte émetteur
      UPDATE public.comptes_epargne
      SET solde_actuel = COALESCE(solde_actuel, 0) - NEW.montant, updated_at = now(),
          updated_by = COALESCE(NEW.validated_by, updated_by)
      WHERE id_compte_epargne = NEW.id_compte_epargne;

      -- Crédit compte bénéficiaire
      SELECT id_compte_epargne INTO v_beneficiary_id
      FROM public.comptes_epargne
      WHERE no_compte = NEW.virement_to OR no_compte_ancien = NEW.virement_to
      LIMIT 1;

      IF v_beneficiary_id IS NOT NULL THEN
        UPDATE public.comptes_epargne
        SET solde_actuel = COALESCE(solde_actuel, 0) + NEW.montant, updated_at = now(),
            updated_by = COALESCE(NEW.validated_by, updated_by)
        WHERE id_compte_epargne = v_beneficiary_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Validation par lot haute performance (RPC)
CREATE OR REPLACE FUNCTION public.set_bulk_transaction_validation(
  p_items jsonb,
  p_status text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_role int;
  v_item jsonb;
  v_table text;
  v_id uuid;
  v_updated_count int := 0;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN (1, 2, 5) THEN
    RAISE EXCEPTION 'Non autorise a valider (role %). Reserve Admin/Manager/Finance.', v_role USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Statut de validation invalide: %', p_status USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_table := v_item->>'table';
    v_id := (v_item->>'id')::uuid;

    IF v_table = 'transactions_epargne' THEN
      UPDATE public.transactions_epargne
      SET validation_status = p_status, validated_by = auth.uid(), validated_at = now(),
          validation_note = p_note, updated_at = now()
      WHERE id_transaction_epargne = v_id AND validation_status = 'pending';
      IF FOUND THEN
        v_updated_count := v_updated_count + 1;
      END IF;
    ELSIF v_table = 'transactions_credit' THEN
      UPDATE public.transactions_credit
      SET validation_status = p_status, validated_by = auth.uid(), validated_at = now(),
          validation_note = p_note, updated_at = now()
      WHERE id_transaction_credit = v_id AND validation_status = 'pending';
      IF FOUND THEN
        v_updated_count := v_updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated_count, 'status', p_status, 'validated_by', auth.uid());
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_bulk_transaction_validation(jsonb, text, text) TO authenticated;
