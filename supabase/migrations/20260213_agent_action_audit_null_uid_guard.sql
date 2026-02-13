-- Prevent audit trigger from blocking server-side maintenance jobs where auth.uid() is NULL.

CREATE OR REPLACE FUNCTION public.log_agent_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_action text := TG_OP;
  v_table text := TG_TABLE_NAME;
  v_target_id text;
  v_scope text;
  v_client_uuid uuid;
  v_client_id_text text;
  v_client_name text;
  v_client_code text;
  v_no_compte text;
  v_tx_type text;
  v_compte_epargne_id uuid;
  v_compte_credit_id uuid;
  v_tx_epargne_id uuid;
  v_tx_credit_id uuid;
  v_grant record;
BEGIN
  IF TG_OP NOT IN ('UPDATE', 'DELETE') THEN
    RETURN NULL;
  END IF;

  -- When auth.uid() is NULL (service role / SQL maintenance), don't block the change.
  IF v_actor_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(trim(coalesce(firstname, '') || ' ' || coalesce(name, '')), '')
    INTO v_actor_name
  FROM public.profiles
  WHERE user_id = v_actor_id;

  -- Resolve target + client
  IF v_table = 'personnes' THEN
    v_scope := 'personne';
    v_target_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_personne::text ELSE NEW.id_personne::text END);
    v_client_uuid := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_personne ELSE NEW.id_personne END);
    v_client_id_text := v_target_id;
  ELSIF v_table = 'comptes_epargne' THEN
    v_scope := 'compte_epargne';
    v_target_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_compte_epargne::text ELSE NEW.id_compte_epargne::text END);
    v_client_uuid := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_personne ELSE NEW.id_personne END);
    v_client_id_text := v_client_uuid::text;
    v_no_compte := (CASE WHEN TG_OP = 'DELETE' THEN OLD.no_compte ELSE NEW.no_compte END);
    v_compte_epargne_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_compte_epargne ELSE NEW.id_compte_epargne END);
  ELSIF v_table = 'comptes_credit' THEN
    v_scope := 'compte_credit';
    v_target_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_compte_credit::text ELSE NEW.id_compte_credit::text END);
    v_client_uuid := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_personne ELSE NEW.id_personne END);
    v_client_id_text := v_client_uuid::text;
    v_no_compte := (CASE WHEN TG_OP = 'DELETE' THEN OLD.no_compte ELSE NEW.no_compte END);
    v_compte_credit_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_compte_credit ELSE NEW.id_compte_credit END);
  ELSIF v_table = 'transactions_epargne' THEN
    v_scope := 'transaction_epargne';
    v_target_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_transaction_epargne::text ELSE NEW.id_transaction_epargne::text END);
    v_tx_epargne_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_transaction_epargne ELSE NEW.id_transaction_epargne END);
    v_no_compte := (CASE WHEN TG_OP = 'DELETE' THEN OLD.no_compte ELSE NEW.no_compte END);
    v_tx_type := (CASE WHEN TG_OP = 'DELETE' THEN OLD.type_transaction::text ELSE NEW.type_transaction::text END);
    SELECT ce.id_personne, ce.id_compte_epargne
      INTO v_client_uuid, v_compte_epargne_id
    FROM public.comptes_epargne ce
    WHERE ce.id_compte_epargne = (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_compte_epargne ELSE NEW.id_compte_epargne END)
    LIMIT 1;
    v_client_id_text := v_client_uuid::text;
  ELSIF v_table = 'transactions_credit' THEN
    v_scope := 'transaction_credit';
    v_target_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_transaction_credit::text ELSE NEW.id_transaction_credit::text END);
    v_tx_credit_id := (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_transaction_credit ELSE NEW.id_transaction_credit END);
    v_no_compte := (CASE WHEN TG_OP = 'DELETE' THEN OLD.no_compte ELSE NEW.no_compte END);
    v_tx_type := (CASE WHEN TG_OP = 'DELETE' THEN OLD.type_transaction::text ELSE NEW.type_transaction::text END);
    SELECT cc.id_personne, cc.id_compte_credit
      INTO v_client_uuid, v_compte_credit_id
    FROM public.comptes_credit cc
    WHERE cc.id_compte_credit = (CASE WHEN TG_OP = 'DELETE' THEN OLD.id_compte_credit ELSE NEW.id_compte_credit END)
    LIMIT 1;
    v_client_id_text := v_client_uuid::text;
  ELSE
    -- Not a tracked table
    RETURN NULL;
  END IF;

  IF v_client_uuid IS NOT NULL THEN
    SELECT
      NULLIF(trim(coalesce(prenom, '') || ' ' || coalesce(nom, '')), ''),
      code_client
    INTO v_client_name, v_client_code
    FROM public.personnes
    WHERE id_personne = v_client_uuid;
  END IF;

  -- Find the grant that enabled this action (best-effort)
  IF v_scope IN ('transaction_epargne', 'transaction_credit') THEN
    SELECT g.*
      INTO v_grant
    FROM public.temporary_access_grants g
    WHERE g.agent_id = v_actor_id
      AND g.expires_at > now()
      AND (
        (v_scope = 'transaction_epargne' AND g.transaction_id = v_tx_epargne_id)
        OR
        (v_scope = 'transaction_credit' AND g.transaction_credit_id = v_tx_credit_id)
      )
    ORDER BY g.created_at DESC
    LIMIT 1;
  ELSE
    -- Prefer account-scoped grant if present, otherwise fallback to client-scoped.
    SELECT g.*
      INTO v_grant
    FROM public.temporary_access_grants g
    WHERE g.agent_id = v_actor_id
      AND g.expires_at > now()
      AND (
        (v_scope = 'compte_epargne' AND g.compte_epargne_id = v_compte_epargne_id)
        OR
        (v_scope = 'compte_credit' AND g.compte_credit_id = v_compte_credit_id)
        OR
        (g.client_id = v_client_id_text AND g.transaction_id IS NULL AND g.transaction_credit_id IS NULL)
      )
    ORDER BY g.created_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.agent_action_audit (
    actor_id,
    actor_full_name,
    action,
    target_table,
    target_id,
    scope_type,
    client_id,
    client_full_name,
    client_code,
    no_compte,
    transaction_type,
    compte_epargne_id,
    compte_credit_id,
    transaction_epargne_id,
    transaction_credit_id,
    grant_id,
    grant_scope_type,
    grant_duration_minutes,
    grant_expires_at,
    admin_id,
    admin_full_name,
    before_data,
    after_data
  ) VALUES (
    v_actor_id,
    v_actor_name,
    v_action,
    v_table,
    v_target_id,
    v_scope,
    v_client_id_text,
    v_client_name,
    v_client_code,
    v_no_compte,
    v_tx_type,
    v_compte_epargne_id,
    v_compte_credit_id,
    v_tx_epargne_id,
    v_tx_credit_id,
    v_grant.id,
    v_grant.scope_type,
    v_grant.duration_minutes,
    v_grant.expires_at,
    v_grant.granted_by,
    v_grant.admin_full_name,
    to_jsonb(OLD),
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN NULL;
END;
$$;

