-- Extend temporary_access_grants to support credit-transaction scoped grants,
-- and add an audit trail + improved access check logic.

-- 1) Schema extensions (safe / idempotent)
ALTER TABLE public.temporary_access_grants
  ADD COLUMN IF NOT EXISTS transaction_credit_id uuid
    REFERENCES public.transactions_credit(id_transaction_credit) ON DELETE CASCADE;

ALTER TABLE public.temporary_access_grants
  ADD COLUMN IF NOT EXISTS reason text;

-- Ensure created_at is always set (older rows can be NULL)
UPDATE public.temporary_access_grants
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

ALTER TABLE public.temporary_access_grants
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.temporary_access_grants
  ALTER COLUMN created_at SET NOT NULL;

-- Helpful indexes for lookups and expiry filtering
CREATE INDEX IF NOT EXISTS idx_temporary_access_grants_agent_expires
  ON public.temporary_access_grants(agent_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_temporary_access_grants_client_expires
  ON public.temporary_access_grants(client_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_temporary_access_grants_tx_credit
  ON public.temporary_access_grants(transaction_credit_id);

-- 2) Audit table (immutable-ish log)
CREATE TABLE IF NOT EXISTS public.access_grant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('GRANT', 'REVOKE')),
  agent_id uuid,
  client_id text,
  transaction_epargne_id uuid,
  transaction_credit_id uuid,
  granted_by uuid,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS: only admins can read; inserts come from SECURITY DEFINER trigger function.
ALTER TABLE public.access_grant_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view access grant audit" ON public.access_grant_audit;
CREATE POLICY "Admins can view access grant audit" ON public.access_grant_audit
FOR SELECT TO public
USING (auth.uid() IN (SELECT p.user_id FROM public.profiles p WHERE p.role = 1));

-- 3) Trigger to log GRANT/REVOKE events
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
      reason
    ) VALUES (
      NEW.id,
      'GRANT',
      NEW.agent_id,
      NEW.client_id,
      NEW.transaction_id,
      NEW.transaction_credit_id,
      NEW.granted_by,
      NEW.reason
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
      reason
    ) VALUES (
      OLD.id,
      'REVOKE',
      OLD.agent_id,
      OLD.client_id,
      OLD.transaction_id,
      OLD.transaction_credit_id,
      OLD.granted_by,
      OLD.reason
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_access_grant_audit_insert ON public.temporary_access_grants;
CREATE TRIGGER trg_access_grant_audit_insert
AFTER INSERT ON public.temporary_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.log_access_grant_event();

DROP TRIGGER IF EXISTS trg_access_grant_audit_delete ON public.temporary_access_grants;
CREATE TRIGGER trg_access_grant_audit_delete
AFTER DELETE ON public.temporary_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.log_access_grant_event();

-- 4) Fix/upgrade access check: include transaction-scoped grants
-- Note: client_id is stored as text (uuid string), so compare as text.
CREATE OR REPLACE FUNCTION public.has_access_to_client(client_id_param text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Admin always has access
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 1) THEN
    RETURN TRUE;
  END IF;

  -- Client-level grant
  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.client_id = client_id_param
      AND g.transaction_id IS NULL
      AND g.transaction_credit_id IS NULL
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  -- Savings transaction-level grants that belong to this client
  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    JOIN public.transactions_epargne te ON te.id_transaction_epargne = g.transaction_id
    JOIN public.comptes_epargne ce ON ce.id_compte_epargne = te.id_compte_epargne
    WHERE g.agent_id = auth.uid()
      AND g.transaction_id IS NOT NULL
      AND g.expires_at > now()
      AND ce.id_personne::text = client_id_param
  ) THEN
    RETURN TRUE;
  END IF;

  -- Credit transaction-level grants that belong to this client
  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    JOIN public.transactions_credit tc ON tc.id_transaction_credit = g.transaction_credit_id
    JOIN public.comptes_credit cc ON cc.id_compte_credit = tc.id_compte_credit
    WHERE g.agent_id = auth.uid()
      AND g.transaction_credit_id IS NOT NULL
      AND g.expires_at > now()
      AND cc.id_personne::text = client_id_param
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

