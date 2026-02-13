-- Access grants: add metadata fields for display and auditing.
-- Agent actions: add a separate audit log that links agent modifications/deletions to the grant used.

-- 1) Extend temporary_access_grants with metadata
ALTER TABLE public.temporary_access_grants
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS agent_full_name text,
  ADD COLUMN IF NOT EXISTS admin_full_name text,
  ADD COLUMN IF NOT EXISTS client_full_name text,
  ADD COLUMN IF NOT EXISTS client_code text,
  ADD COLUMN IF NOT EXISTS resource_label text,
  ADD COLUMN IF NOT EXISTS compte_epargne_id uuid REFERENCES public.comptes_epargne(id_compte_epargne) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS compte_credit_id uuid REFERENCES public.comptes_credit(id_compte_credit) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_temporary_access_grants_scope_type
  ON public.temporary_access_grants(scope_type);

CREATE INDEX IF NOT EXISTS idx_temporary_access_grants_compte_epargne_id
  ON public.temporary_access_grants(compte_epargne_id);

CREATE INDEX IF NOT EXISTS idx_temporary_access_grants_compte_credit_id
  ON public.temporary_access_grants(compte_credit_id);

-- 2) Enrichment trigger: populate names/scope/duration/labels automatically on insert.
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
      SELECT ce.no_compte
        INTO v_no_compte
      FROM public.transactions_epargne te
      JOIN public.comptes_epargne ce ON ce.id_compte_epargne = te.id_compte_epargne
      WHERE te.id_transaction_epargne = NEW.transaction_id
      LIMIT 1;
      NEW.resource_label := 'Transaction épargne' || COALESCE(' (compte ' || v_no_compte || ')', '');
    ELSIF NEW.transaction_credit_id IS NOT NULL THEN
      SELECT cc.no_compte
        INTO v_no_compte
      FROM public.transactions_credit tc
      JOIN public.comptes_credit cc ON cc.id_compte_credit = tc.id_compte_credit
      WHERE tc.id_transaction_credit = NEW.transaction_credit_id
      LIMIT 1;
      NEW.resource_label := 'Transaction crédit' || COALESCE(' (compte ' || v_no_compte || ')', '');
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

DROP TRIGGER IF EXISTS trg_enrich_temporary_access_grant ON public.temporary_access_grants;
CREATE TRIGGER trg_enrich_temporary_access_grant
BEFORE INSERT ON public.temporary_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.enrich_temporary_access_grant();

-- Backfill metadata for existing rows (best-effort)
UPDATE public.temporary_access_grants g
SET
  agent_full_name = COALESCE(g.agent_full_name, (SELECT NULLIF(trim(coalesce(p.firstname,'') || ' ' || coalesce(p.name,'')), '') FROM public.profiles p WHERE p.user_id = g.agent_id)),
  admin_full_name = COALESCE(g.admin_full_name, (SELECT NULLIF(trim(coalesce(p.firstname,'') || ' ' || coalesce(p.name,'')), '') FROM public.profiles p WHERE p.user_id = g.granted_by)),
  scope_type = COALESCE(
    g.scope_type,
    CASE
      WHEN g.transaction_credit_id IS NOT NULL THEN 'transaction_credit'
      WHEN g.transaction_id IS NOT NULL THEN 'transaction_epargne'
      WHEN g.compte_credit_id IS NOT NULL THEN 'compte_credit'
      WHEN g.compte_epargne_id IS NOT NULL THEN 'compte_epargne'
      ELSE 'client'
    END
  ),
  duration_minutes = COALESCE(g.duration_minutes, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (g.expires_at - COALESCE(g.created_at, now()))) / 60.0)::int))
WHERE TRUE;

-- 3) Extend access_grant_audit with snapshot fields for display
ALTER TABLE public.access_grant_audit
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS agent_full_name text,
  ADD COLUMN IF NOT EXISTS admin_full_name text,
  ADD COLUMN IF NOT EXISTS client_full_name text,
  ADD COLUMN IF NOT EXISTS client_code text,
  ADD COLUMN IF NOT EXISTS resource_label text,
  ADD COLUMN IF NOT EXISTS compte_epargne_id uuid,
  ADD COLUMN IF NOT EXISTS compte_credit_id uuid;

-- 4) Update access grant audit trigger function to copy metadata
CREATE OR REPLACE FUNCTION public.log_access_grant_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.access_grant_audit (
      grant_id,
      event_type,
      agent_id,
      client_id,
      transaction_epargne_id,
      transaction_credit_id,
      granted_by,
      reason,
      scope_type,
      duration_minutes,
      expires_at,
      agent_full_name,
      admin_full_name,
      client_full_name,
      client_code,
      resource_label,
      compte_epargne_id,
      compte_credit_id
    ) VALUES (
      NEW.id,
      'GRANT',
      NEW.agent_id,
      NEW.client_id,
      NEW.transaction_id,
      NEW.transaction_credit_id,
      NEW.granted_by,
      NEW.reason,
      NEW.scope_type,
      NEW.duration_minutes,
      NEW.expires_at,
      NEW.agent_full_name,
      NEW.admin_full_name,
      NEW.client_full_name,
      NEW.client_code,
      NEW.resource_label,
      NEW.compte_epargne_id,
      NEW.compte_credit_id
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.access_grant_audit (
      grant_id,
      event_type,
      agent_id,
      client_id,
      transaction_epargne_id,
      transaction_credit_id,
      granted_by,
      reason,
      scope_type,
      duration_minutes,
      expires_at,
      agent_full_name,
      admin_full_name,
      client_full_name,
      client_code,
      resource_label,
      compte_epargne_id,
      compte_credit_id
    ) VALUES (
      OLD.id,
      'REVOKE',
      OLD.agent_id,
      OLD.client_id,
      OLD.transaction_id,
      OLD.transaction_credit_id,
      OLD.granted_by,
      OLD.reason,
      OLD.scope_type,
      OLD.duration_minutes,
      OLD.expires_at,
      OLD.agent_full_name,
      OLD.admin_full_name,
      OLD.client_full_name,
      OLD.client_code,
      OLD.resource_label,
      OLD.compte_epargne_id,
      OLD.compte_credit_id
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- 5) Agent action audit table
CREATE TABLE IF NOT EXISTS public.agent_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL,
  actor_full_name text,
  action text NOT NULL CHECK (action IN ('UPDATE', 'DELETE')),
  target_table text NOT NULL,
  target_id text NOT NULL,
  scope_type text NOT NULL,
  client_id text,
  client_full_name text,
  client_code text,
  no_compte text,
  transaction_type text,
  compte_epargne_id uuid,
  compte_credit_id uuid,
  transaction_epargne_id uuid,
  transaction_credit_id uuid,
  grant_id uuid,
  grant_scope_type text,
  grant_duration_minutes integer,
  grant_expires_at timestamp with time zone,
  admin_id uuid,
  admin_full_name text,
  before_data jsonb,
  after_data jsonb
);

CREATE INDEX IF NOT EXISTS idx_agent_action_audit_occurred_at
  ON public.agent_action_audit(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_action_audit_actor
  ON public.agent_action_audit(actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_action_audit_client
  ON public.agent_action_audit(client_id, occurred_at DESC);

ALTER TABLE public.agent_action_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view agent action audit" ON public.agent_action_audit;
CREATE POLICY "Admins can view agent action audit" ON public.agent_action_audit
FOR SELECT TO public
USING (auth.uid() IN (SELECT p.user_id FROM public.profiles p WHERE p.role = 1));

-- 6) Trigger function to log UPDATE/DELETE on key tables
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
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN NULL;
END;
$$;

-- Triggers per table (AFTER so we log only successful changes)
DROP TRIGGER IF EXISTS trg_log_agent_action_personnes_u ON public.personnes;
CREATE TRIGGER trg_log_agent_action_personnes_u
AFTER UPDATE ON public.personnes
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_personnes_d ON public.personnes;
CREATE TRIGGER trg_log_agent_action_personnes_d
AFTER DELETE ON public.personnes
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_comptes_epargne_u ON public.comptes_epargne;
CREATE TRIGGER trg_log_agent_action_comptes_epargne_u
AFTER UPDATE ON public.comptes_epargne
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_comptes_epargne_d ON public.comptes_epargne;
CREATE TRIGGER trg_log_agent_action_comptes_epargne_d
AFTER DELETE ON public.comptes_epargne
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_comptes_credit_u ON public.comptes_credit;
CREATE TRIGGER trg_log_agent_action_comptes_credit_u
AFTER UPDATE ON public.comptes_credit
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_comptes_credit_d ON public.comptes_credit;
CREATE TRIGGER trg_log_agent_action_comptes_credit_d
AFTER DELETE ON public.comptes_credit
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_transactions_epargne_u ON public.transactions_epargne;
CREATE TRIGGER trg_log_agent_action_transactions_epargne_u
AFTER UPDATE ON public.transactions_epargne
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_transactions_epargne_d ON public.transactions_epargne;
CREATE TRIGGER trg_log_agent_action_transactions_epargne_d
AFTER DELETE ON public.transactions_epargne
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_transactions_credit_u ON public.transactions_credit;
CREATE TRIGGER trg_log_agent_action_transactions_credit_u
AFTER UPDATE ON public.transactions_credit
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

DROP TRIGGER IF EXISTS trg_log_agent_action_transactions_credit_d ON public.transactions_credit;
CREATE TRIGGER trg_log_agent_action_transactions_credit_d
AFTER DELETE ON public.transactions_credit
FOR EACH ROW EXECUTE FUNCTION public.log_agent_action();

