-- Make transaction-scoped grants truly transaction-scoped.
-- Client-level grants remain required to UPDATE/DELETE personnes + comptes_*.

-- 1) Client-level check: ONLY client-level grants (no transaction grants).
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

  RETURN FALSE;
END;
$$;

-- 2) Transaction-level checks (accept either a direct tx-grant OR a client-grant for the owner client)
CREATE OR REPLACE FUNCTION public.has_access_to_transaction_epargne(tx_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 1) THEN
    RETURN TRUE;
  END IF;

  -- Direct tx grant
  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.transaction_id = tx_id
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  -- Client-level grant for the owning client
  SELECT ce.id_personne::text
  INTO v_client_id
  FROM public.transactions_epargne te
  JOIN public.comptes_epargne ce ON ce.id_compte_epargne = te.id_compte_epargne
  WHERE te.id_transaction_epargne = tx_id
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.has_access_to_client(v_client_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_access_to_transaction_credit(tx_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 1) THEN
    RETURN TRUE;
  END IF;

  -- Direct tx grant
  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.transaction_credit_id = tx_id
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  -- Client-level grant for the owning client
  SELECT cc.id_personne::text
  INTO v_client_id
  FROM public.transactions_credit tc
  JOIN public.comptes_credit cc ON cc.id_compte_credit = tc.id_compte_credit
  WHERE tc.id_transaction_credit = tx_id
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.has_access_to_client(v_client_id);
END;
$$;

-- 3) Update RLS policies on transaction tables
-- Transactions Epargne
DROP POLICY IF EXISTS "Agents can UPDATE transactions_epargne" ON public.transactions_epargne;
DROP POLICY IF EXISTS "Agents can DELETE transactions_epargne" ON public.transactions_epargne;

CREATE POLICY "Agents can UPDATE transactions_epargne" ON public.transactions_epargne
FOR UPDATE TO public
USING (public.has_access_to_transaction_epargne(id_transaction_epargne));

CREATE POLICY "Agents can DELETE transactions_epargne" ON public.transactions_epargne
FOR DELETE TO public
USING (public.has_access_to_transaction_epargne(id_transaction_epargne));

-- Ensure INSERT stays open
DROP POLICY IF EXISTS "Agents can INSERT transactions_epargne" ON public.transactions_epargne;
CREATE POLICY "Agents can INSERT transactions_epargne" ON public.transactions_epargne
FOR INSERT TO public
WITH CHECK (true);

-- Transactions Credit
DROP POLICY IF EXISTS "Agents can UPDATE transactions_credit" ON public.transactions_credit;
DROP POLICY IF EXISTS "Agents can DELETE transactions_credit" ON public.transactions_credit;

CREATE POLICY "Agents can UPDATE transactions_credit" ON public.transactions_credit
FOR UPDATE TO public
USING (public.has_access_to_transaction_credit(id_transaction_credit));

CREATE POLICY "Agents can DELETE transactions_credit" ON public.transactions_credit
FOR DELETE TO public
USING (public.has_access_to_transaction_credit(id_transaction_credit));

-- Ensure INSERT stays open
DROP POLICY IF EXISTS "Agents can INSERT transactions_credit" ON public.transactions_credit;
CREATE POLICY "Agents can INSERT transactions_credit" ON public.transactions_credit
FOR INSERT TO public
WITH CHECK (true);

