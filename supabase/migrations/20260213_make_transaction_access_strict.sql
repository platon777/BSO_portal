-- Make transaction access strict:
-- Updating/deleting a transaction requires a transaction-scoped grant (or admin),
-- a client-level grant is NOT enough.

CREATE OR REPLACE FUNCTION public.has_access_to_transaction_epargne(tx_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 1) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.transaction_id = tx_id
      AND g.expires_at > now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_access_to_transaction_credit(tx_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 1) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.transaction_credit_id = tx_id
      AND g.expires_at > now()
  );
END;
$$;

