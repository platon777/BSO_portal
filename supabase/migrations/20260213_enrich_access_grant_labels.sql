-- Improve resource_label clarity for transaction-scoped grants by including transaction type.

CREATE OR REPLACE FUNCTION public.enrich_temporary_access_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_uuid uuid;
  v_agent_name text;
  v_admin_name text;
  v_client_name text;
  v_client_code text;
  v_no_compte text;
  v_tx_type text;
BEGIN
  -- Names from profiles
  SELECT NULLIF(trim(coalesce(firstname, '') || ' ' || coalesce(name, '')), '')
    INTO v_agent_name
  FROM public.profiles
  WHERE user_id = NEW.agent_id;

  SELECT NULLIF(trim(coalesce(firstname, '') || ' ' || coalesce(name, '')), '')
    INTO v_admin_name
  FROM public.profiles
  WHERE user_id = NEW.granted_by;

  NEW.agent_full_name := COALESCE(NEW.agent_full_name, v_agent_name);
  NEW.admin_full_name := COALESCE(NEW.admin_full_name, v_admin_name);

  -- Client info from personnes
  BEGIN
    v_client_uuid := NEW.client_id::uuid;
  EXCEPTION WHEN others THEN
    v_client_uuid := NULL;
  END;

  IF v_client_uuid IS NOT NULL THEN
    SELECT
      NULLIF(trim(coalesce(prenom, '') || ' ' || coalesce(nom, '')), ''),
      code_client
    INTO v_client_name, v_client_code
    FROM public.personnes
    WHERE id_personne = v_client_uuid;
  END IF;

  NEW.client_full_name := COALESCE(NEW.client_full_name, v_client_name);
  NEW.client_code := COALESCE(NEW.client_code, v_client_code);

  -- Duration (store requested duration for traceability)
  IF NEW.duration_minutes IS NULL THEN
    NEW.duration_minutes :=
      GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (NEW.expires_at - now())) / 60.0)::int
      );
  END IF;

  -- Scope type
  NEW.scope_type := COALESCE(
    NEW.scope_type,
    CASE
      WHEN NEW.transaction_credit_id IS NOT NULL THEN 'transaction_credit'
      WHEN NEW.transaction_id IS NOT NULL THEN 'transaction_epargne'
      WHEN NEW.compte_credit_id IS NOT NULL THEN 'compte_credit'
      WHEN NEW.compte_epargne_id IS NOT NULL THEN 'compte_epargne'
      ELSE 'client'
    END
  );

  -- Resource label
  IF NEW.resource_label IS NULL OR NEW.resource_label = '' THEN
    IF NEW.transaction_id IS NOT NULL THEN
      SELECT ce.no_compte, te.type_transaction::text
        INTO v_no_compte, v_tx_type
      FROM public.transactions_epargne te
      JOIN public.comptes_epargne ce ON ce.id_compte_epargne = te.id_compte_epargne
      WHERE te.id_transaction_epargne = NEW.transaction_id
      LIMIT 1;

      NEW.resource_label :=
        'Transaction épargne' ||
        COALESCE(' [' || v_tx_type || ']', '') ||
        COALESCE(' (compte ' || v_no_compte || ')', '');
    ELSIF NEW.transaction_credit_id IS NOT NULL THEN
      SELECT cc.no_compte, tc.type_transaction::text
        INTO v_no_compte, v_tx_type
      FROM public.transactions_credit tc
      JOIN public.comptes_credit cc ON cc.id_compte_credit = tc.id_compte_credit
      WHERE tc.id_transaction_credit = NEW.transaction_credit_id
      LIMIT 1;

      NEW.resource_label :=
        'Transaction crédit' ||
        COALESCE(' [' || v_tx_type || ']', '') ||
        COALESCE(' (compte ' || v_no_compte || ')', '');
    ELSIF NEW.compte_epargne_id IS NOT NULL THEN
      SELECT ce.no_compte INTO v_no_compte
      FROM public.comptes_epargne ce
      WHERE ce.id_compte_epargne = NEW.compte_epargne_id
      LIMIT 1;
      NEW.resource_label := 'Compte épargne' || COALESCE(' ' || v_no_compte, '');
    ELSIF NEW.compte_credit_id IS NOT NULL THEN
      SELECT cc.no_compte INTO v_no_compte
      FROM public.comptes_credit cc
      WHERE cc.id_compte_credit = NEW.compte_credit_id
      LIMIT 1;
      NEW.resource_label := 'Compte crédit' || COALESCE(' ' || v_no_compte, '');
    ELSE
      NEW.resource_label := COALESCE(NEW.client_full_name, 'Client');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

