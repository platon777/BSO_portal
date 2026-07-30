-- Protocole de validation finance (2026-07-30).
--
-- Objectif: les ENTREES d'argent (depot epargne 'D', paiement credit 'Paiement') se
-- synchronisent mais restent EN ATTENTE de verification par la finance. Tant qu'elles
-- ne sont pas validees, elles NE modifient PAS le solde reel (deferred) et ne comptent
-- pas dans les calculs reels. La validation est tracable (validated_by / validated_at)
-- et se fait via set_transaction_validation() par un role habilite (Admin 1, Manager 2,
-- Finance 5). Le portail admin de validation sera developpe plus tard; pour l'instant
-- la validation peut aussi se faire en editant la colonne cote Supabase.
--
-- Non-regression: validation_status DEFAULT 'confirmed' => les lignes existantes et tous
-- les autres types de transaction ne changent pas de comportement.
--
-- Rollback: retirer les colonnes/fonctions/triggers ajoutes ici et restaurer les corps
-- d'origine de apply_savings_transaction_balance / apply_credit_transaction_amounts
-- (voir 20260619_fix_savings_virement_trigger_security.sql et
--  20260529_harden_credit_payment_trigger.sql).

SET lock_timeout = '5s';

-- 1) Colonnes de validation ---------------------------------------------------
ALTER TABLE public.transactions_epargne
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_note text;

ALTER TABLE public.transactions_credit
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_epargne_validation_status_check') THEN
    ALTER TABLE public.transactions_epargne
      ADD CONSTRAINT transactions_epargne_validation_status_check
      CHECK (validation_status IN ('pending','confirmed','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_credit_validation_status_check') THEN
    ALTER TABLE public.transactions_credit
      ADD CONSTRAINT transactions_credit_validation_status_check
      CHECK (validation_status IN ('pending','confirmed','rejected'));
  END IF;
END $$;

-- 2) Role Finance -------------------------------------------------------------
INSERT INTO public.roles (id, nom_role, description)
VALUES (5, 'Finance', 'Valide les entrees d''argent (paiements, depots) avant prise en compte reelle')
ON CONFLICT (id) DO NOTHING;

-- 3) Trigger epargne: differer l'application des depots 'pending' -------------
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

  -- Seuls les depots 'D' sont soumis a validation. Tout le reste est confirme d'office.
  IF NEW.type_transaction <> 'D' OR COALESCE(NEW.is_solde_initial, false) THEN
    NEW.validation_status := 'confirmed';
  END IF;
  v_defer := (NEW.type_transaction = 'D' AND COALESCE(NEW.validation_status,'confirmed') = 'pending');

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
  NEW.solde_apres_transactions := v_new_balance; -- valeur attendue (meme si differee)

  -- Depot en attente de validation: on NE touche PAS le solde reel du compte.
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

-- 4) Trigger credit: differer l'application des paiements 'pending' -----------
CREATE OR REPLACE FUNCTION public.apply_credit_transaction_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_credit record;
  v_paid_before numeric := 0;
  v_paid_after numeric := 0;
  v_final_amount numeric := 0;
  v_remaining_before numeric := 0;
  v_remaining_after numeric := 0;
  v_defer boolean := false;
BEGIN
  IF NEW.montant IS NULL OR NEW.montant <= 0 THEN
    RAISE EXCEPTION 'Montant invalide pour transaction credit: %', NEW.montant USING ERRCODE = '23514';
  END IF;

  IF NEW.type_transaction <> 'Paiement' THEN
    NEW.validation_status := 'confirmed';
  END IF;
  v_defer := (NEW.type_transaction = 'Paiement' AND COALESCE(NEW.validation_status,'confirmed') = 'pending');

  SELECT * INTO v_credit FROM public.comptes_credit WHERE id_compte_credit = NEW.id_compte_credit FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte credit introuvable: %', NEW.id_compte_credit USING ERRCODE = '23503';
  END IF;

  v_paid_before := COALESCE(v_credit.paiement_cumule, 0);
  v_final_amount := COALESCE(v_credit.montant_final,
    v_credit.montant_prete * (1 + (COALESCE(v_credit.taux_interet, 0) / 100) * COALESCE(v_credit.duree_credit_mois, 0)));
  v_remaining_before := GREATEST(v_final_amount - v_paid_before, 0);

  NEW.montant_pret := v_credit.montant_prete;
  NEW.solde_avant_transaction := v_remaining_before;

  IF NEW.type_transaction = 'Paiement' THEN
    IF NEW.montant > v_remaining_before THEN
      RAISE EXCEPTION 'Remboursement superieur au montant restant sur le compte credit %. Restant confirme: %, Montant demande: %',
        NEW.no_compte, v_remaining_before, NEW.montant USING ERRCODE = 'P0001';
    END IF;
    v_paid_after := v_paid_before + NEW.montant;
    v_remaining_after := GREATEST(v_final_amount - v_paid_after, 0);
    NEW.paiement_cumule := v_paid_after;      -- valeur attendue sur la ligne
    NEW.montant_restant := v_remaining_after; -- valeur attendue sur la ligne

    IF NOT v_defer THEN
      UPDATE public.comptes_credit
      SET paiement_cumule = v_paid_after, montant_restant = v_remaining_after, updated_at = now(),
          updated_by = COALESCE(NEW.created_by, updated_by)
      WHERE id_compte_credit = NEW.id_compte_credit;
    END IF;
  ELSIF NEW.type_transaction = 'Penalite' THEN
    NEW.paiement_cumule := v_paid_before;
    NEW.montant_restant := v_remaining_before;
    UPDATE public.comptes_credit
    SET penalites = COALESCE(penalites, 0) + NEW.montant, updated_at = now(), updated_by = COALESCE(NEW.created_by, updated_by)
    WHERE id_compte_credit = NEW.id_compte_credit;
  ELSE
    RAISE EXCEPTION 'Type transaction credit invalide: %', NEW.type_transaction USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

-- 5) Application a la validation (pending -> confirmed) -----------------------
CREATE OR REPLACE FUNCTION public.apply_savings_validation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.validation_status = 'pending' AND NEW.validation_status = 'confirmed'
     AND NEW.type_transaction = 'D' THEN
    UPDATE public.comptes_epargne
    SET solde_actuel = COALESCE(solde_actuel, 0) + NEW.montant, updated_at = now(),
        updated_by = COALESCE(NEW.validated_by, updated_by)
    WHERE id_compte_epargne = NEW.id_compte_epargne;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_credit_validation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_credit record; v_final numeric; v_paid numeric; v_remaining numeric;
BEGIN
  IF OLD.validation_status = 'pending' AND NEW.validation_status = 'confirmed'
     AND NEW.type_transaction = 'Paiement' THEN
    SELECT * INTO v_credit FROM public.comptes_credit WHERE id_compte_credit = NEW.id_compte_credit FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compte credit introuvable a la validation: %', NEW.id_compte_credit USING ERRCODE = '23503';
    END IF;
    v_paid := COALESCE(v_credit.paiement_cumule, 0);
    v_final := COALESCE(v_credit.montant_final,
      v_credit.montant_prete * (1 + (COALESCE(v_credit.taux_interet, 0) / 100) * COALESCE(v_credit.duree_credit_mois, 0)));
    v_remaining := GREATEST(v_final - v_paid, 0);
    IF NEW.montant > v_remaining THEN
      RAISE EXCEPTION 'Validation impossible: paiement % superieur au restant % sur %',
        NEW.montant, v_remaining, NEW.no_compte USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.comptes_credit
    SET paiement_cumule = v_paid + NEW.montant, montant_restant = GREATEST(v_final - (v_paid + NEW.montant), 0),
        updated_at = now(), updated_by = COALESCE(NEW.validated_by, updated_by)
    WHERE id_compte_credit = NEW.id_compte_credit;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_savings_validation ON public.transactions_epargne;
CREATE TRIGGER trg_apply_savings_validation
AFTER UPDATE ON public.transactions_epargne
FOR EACH ROW
WHEN (OLD.validation_status IS DISTINCT FROM NEW.validation_status)
EXECUTE FUNCTION public.apply_savings_validation();

DROP TRIGGER IF EXISTS trg_apply_credit_validation ON public.transactions_credit;
CREATE TRIGGER trg_apply_credit_validation
AFTER UPDATE ON public.transactions_credit
FOR EACH ROW
WHEN (OLD.validation_status IS DISTINCT FROM NEW.validation_status)
EXECUTE FUNCTION public.apply_credit_validation();

-- 6) Point d'entree de validation, tracable et role-gated ---------------------
CREATE OR REPLACE FUNCTION public.set_transaction_validation(
  p_table text, p_id uuid, p_status text, p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_role int; v_count int := 0;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN (1, 2, 5) THEN
    RAISE EXCEPTION 'Non autorise a valider (role %). Reserve Admin/Manager/Finance.', v_role USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Statut de validation invalide: %', p_status USING ERRCODE = '23514';
  END IF;

  IF p_table = 'transactions_epargne' THEN
    UPDATE public.transactions_epargne
    SET validation_status = p_status, validated_by = auth.uid(), validated_at = now(),
        validation_note = p_note, updated_at = now()
    WHERE id_transaction_epargne = p_id AND validation_status = 'pending';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_table = 'transactions_credit' THEN
    UPDATE public.transactions_credit
    SET validation_status = p_status, validated_by = auth.uid(), validated_at = now(),
        validation_note = p_note, updated_at = now()
    WHERE id_transaction_credit = p_id AND validation_status = 'pending';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Table non supportee: %', p_table USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('updated', v_count, 'status', p_status, 'validated_by', auth.uid());
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_transaction_validation(text, uuid, text, text) TO authenticated;
