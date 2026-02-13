-- Allow account-scoped grants to authorize UPDATE/DELETE of account rows,
-- while keeping client-scoped grants working as before.

CREATE OR REPLACE FUNCTION public.has_access_to_compte_epargne(compte_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_id text;
BEGIN
  -- Admin always has access
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 1) THEN
    RETURN TRUE;
  END IF;

  -- Direct account-scoped grant
  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.compte_epargne_id = compte_id
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  -- Fallback: client-scoped grant for the owning client
  SELECT ce.id_personne::text
    INTO v_client_id
  FROM public.comptes_epargne ce
  WHERE ce.id_compte_epargne = compte_id
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.has_access_to_client(v_client_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_access_to_compte_credit(compte_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_id text;
BEGIN
  -- Admin always has access
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 1) THEN
    RETURN TRUE;
  END IF;

  -- Direct account-scoped grant
  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.compte_credit_id = compte_id
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  -- Fallback: client-scoped grant for the owning client
  SELECT cc.id_personne::text
    INTO v_client_id
  FROM public.comptes_credit cc
  WHERE cc.id_compte_credit = compte_id
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.has_access_to_client(v_client_id);
END;
$$;

-- Update RLS policies for account tables
DROP POLICY IF EXISTS "Agents can UPDATE comptes_epargne" ON public.comptes_epargne;
DROP POLICY IF EXISTS "Agents can DELETE comptes_epargne" ON public.comptes_epargne;

CREATE POLICY "Agents can UPDATE comptes_epargne" ON public.comptes_epargne
FOR UPDATE TO public
USING (public.has_access_to_compte_epargne(id_compte_epargne));

CREATE POLICY "Agents can DELETE comptes_epargne" ON public.comptes_epargne
FOR DELETE TO public
USING (public.has_access_to_compte_epargne(id_compte_epargne));

-- Ensure INSERT stays open
DROP POLICY IF EXISTS "Agents can INSERT comptes_epargne" ON public.comptes_epargne;
CREATE POLICY "Agents can INSERT comptes_epargne" ON public.comptes_epargne
FOR INSERT TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Agents can UPDATE comptes_credit" ON public.comptes_credit;
DROP POLICY IF EXISTS "Agents can DELETE comptes_credit" ON public.comptes_credit;

CREATE POLICY "Agents can UPDATE comptes_credit" ON public.comptes_credit
FOR UPDATE TO public
USING (public.has_access_to_compte_credit(id_compte_credit));

CREATE POLICY "Agents can DELETE comptes_credit" ON public.comptes_credit
FOR DELETE TO public
USING (public.has_access_to_compte_credit(id_compte_credit));

-- Ensure INSERT stays open
DROP POLICY IF EXISTS "Agents can INSERT comptes_credit" ON public.comptes_credit;
CREATE POLICY "Agents can INSERT comptes_credit" ON public.comptes_credit
FOR INSERT TO public
WITH CHECK (true);

