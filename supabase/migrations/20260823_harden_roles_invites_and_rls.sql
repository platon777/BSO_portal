-- Security baseline approved on 2026-08-23.
--
-- Business rules:
--   * roles 1 (Admin), 2 (Manager) and 5 (Finance) may edit business data;
--   * role 3 (Agent) needs an active, resource-scoped grant to edit/delete;
--   * role 4 and anonymous users cannot read or write business data;
--   * active staff may create records, with immutable creator attribution;
--   * invitation validation, consumption and role assignment are server-side.

-- ---------------------------------------------------------------------------
-- 1) Reusable role predicates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN (1, 2, 3, 5)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_edit_without_grant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN (1, 2, 5)
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_active_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_edit_without_grant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_active_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_edit_without_grant() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Access predicates used by application checks and RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_access_to_client(client_id_param text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF public.current_user_can_edit_without_grant() THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.client_id = client_id_param
      AND g.transaction_id IS NULL
      AND g.transaction_credit_id IS NULL
      AND g.expires_at > now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_access_to_compte_epargne(compte_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_id text;
BEGIN
  IF public.current_user_can_edit_without_grant() THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.compte_epargne_id = compte_id
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT ce.id_personne::text
    INTO v_client_id
  FROM public.comptes_epargne ce
  WHERE ce.id_compte_epargne = compte_id
  LIMIT 1;

  RETURN v_client_id IS NOT NULL AND public.has_access_to_client(v_client_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_access_to_compte_credit(compte_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_id text;
BEGIN
  IF public.current_user_can_edit_without_grant() THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.compte_credit_id = compte_id
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT cc.id_personne::text
    INTO v_client_id
  FROM public.comptes_credit cc
  WHERE cc.id_compte_credit = compte_id
  LIMIT 1;

  RETURN v_client_id IS NOT NULL AND public.has_access_to_client(v_client_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_access_to_transaction_epargne(tx_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_id text;
BEGIN
  IF public.current_user_can_edit_without_grant() THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.transaction_id = tx_id
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT ce.id_personne::text
    INTO v_client_id
  FROM public.transactions_epargne te
  JOIN public.comptes_epargne ce
    ON ce.id_compte_epargne = te.id_compte_epargne
  WHERE te.id_transaction_epargne = tx_id
  LIMIT 1;

  RETURN v_client_id IS NOT NULL AND public.has_access_to_client(v_client_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_access_to_transaction_credit(tx_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_client_id text;
BEGIN
  IF public.current_user_can_edit_without_grant() THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.temporary_access_grants g
    WHERE g.agent_id = auth.uid()
      AND g.transaction_credit_id = tx_id
      AND g.expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT cc.id_personne::text
    INTO v_client_id
  FROM public.transactions_credit tc
  JOIN public.comptes_credit cc
    ON cc.id_compte_credit = tc.id_compte_credit
  WHERE tc.id_transaction_credit = tx_id
  LIMIT 1;

  RETURN v_client_id IS NOT NULL AND public.has_access_to_client(v_client_id);
END;
$$;

REVOKE ALL ON FUNCTION public.has_access_to_client(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_access_to_compte_epargne(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_access_to_compte_credit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_access_to_transaction_epargne(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_access_to_transaction_credit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_access_to_client(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_access_to_compte_epargne(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_access_to_compte_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_access_to_transaction_epargne(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_access_to_transaction_credit(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Profiles: readable by active staff, written only by trusted functions
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles policy" ON public.profiles;
DROP POLICY IF EXISTS "Active staff can read profiles" ON public.profiles;
CREATE POLICY "Active staff can read profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.current_user_is_active_staff());

-- ---------------------------------------------------------------------------
-- 4) Atomic invitation consumption during auth.users creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_code text;
  v_invitation public.invitation_codes%ROWTYPE;
BEGIN
  v_code := upper(trim(COALESCE(NEW.raw_user_meta_data->>'invitation_code', '')));
  IF v_code = '' THEN
    -- Transitional compatibility for an already-deployed older frontend: the
    -- profile remains blocked as role 4 until consume_invitation_code() succeeds.
    -- The current frontend sends the code here and uses the atomic path below.
    INSERT INTO public.profiles (user_id, email, firstname, name, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'firstname', ''),
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'lastname', ''),
      4
    );
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_invitation
  FROM public.invitation_codes
  WHERE code = v_code
  FOR UPDATE;

  IF v_invitation.id IS NULL OR v_invitation.is_used OR v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'Code d invitation invalide, expire ou deja utilise.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (user_id, email, firstname, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'firstname', ''),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'lastname', ''),
    v_invitation.role
  );

  UPDATE public.invitation_codes
  SET is_used = true,
      used_by = NEW.id,
      used_at = now()
  WHERE id = v_invitation.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_invitation_code(
  p_role integer DEFAULT 3,
  p_note text DEFAULT NULL,
  p_expires_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_role integer;
  v_new_code text;
  v_record record;
  v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_part1 text := '';
  v_part2 text := '';
  i integer;
BEGIN
  p_role := COALESCE(p_role, 3);
  p_expires_days := COALESCE(p_expires_days, 14);
  SELECT role INTO v_user_role FROM public.profiles WHERE user_id = auth.uid();
  IF v_user_role NOT IN (1, 2) THEN
    RAISE EXCEPTION 'Acces refuse: seuls les administrateurs et managers peuvent generer des codes.' USING ERRCODE = '42501';
  END IF;
  IF p_expires_days NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'La validite doit etre comprise entre 1 et 30 jours.' USING ERRCODE = '23514';
  END IF;
  IF p_role = 1 THEN
    RAISE EXCEPTION 'La creation d un compte administrateur par code d invitation est interdite.' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN (2, 3, 5) THEN
    RAISE EXCEPTION 'Role invitation invalide.' USING ERRCODE = '23514';
  END IF;

  LOOP
    v_part1 := '';
    v_part2 := '';
    FOR i IN 1..4 LOOP
      v_part1 := v_part1 || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
      v_part2 := v_part2 || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
    END LOOP;
    v_new_code := 'BSO-' || v_part1 || '-' || v_part2;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invitation_codes WHERE code = v_new_code);
  END LOOP;

  INSERT INTO public.invitation_codes (code, role, created_by, expires_at, note)
  VALUES (v_new_code, p_role, auth.uid(), now() + make_interval(days => p_expires_days), NULLIF(trim(p_note), ''))
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_record.id,
    'code', v_record.code,
    'role', v_record.role,
    'expires_at', v_record.expires_at,
    'note', v_record.note
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_invitation_code(p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_code text := upper(trim(COALESCE(p_code, '')));
  v_invitation public.invitation_codes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Un code ne peut etre consomme que par son utilisateur authentifie.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invitation
  FROM public.invitation_codes
  WHERE code = v_code
  FOR UPDATE;

  IF v_invitation.id IS NULL OR v_invitation.is_used OR v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'Code d invitation invalide, expire ou deja utilise.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET role = v_invitation.role WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil utilisateur introuvable.' USING ERRCODE = '23503';
  END IF;

  UPDATE public.invitation_codes
  SET is_used = true, used_by = auth.uid(), used_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object('success', true, 'role', v_invitation.role, 'user_id', auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invitation_code(integer, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_invitation_code(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_invitation_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_invitation_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_invitation_code(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invitation_code(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invitation_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invitation_code(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Business-table RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.personnes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptes_epargne ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptes_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions_epargne ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions_credit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agents can SELECT personnes" ON public.personnes;
DROP POLICY IF EXISTS "Agents can INSERT personnes" ON public.personnes;
DROP POLICY IF EXISTS "Agents can UPDATE personnes" ON public.personnes;
DROP POLICY IF EXISTS "Agents can DELETE personnes" ON public.personnes;
CREATE POLICY "Agents can SELECT personnes" ON public.personnes FOR SELECT TO authenticated
  USING (public.current_user_is_active_staff());
CREATE POLICY "Agents can INSERT personnes" ON public.personnes FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_active_staff()
    AND created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
CREATE POLICY "Agents can UPDATE personnes" ON public.personnes FOR UPDATE TO authenticated
  USING (public.has_access_to_client(id_personne::text))
  WITH CHECK (public.has_access_to_client(id_personne::text));
CREATE POLICY "Agents can DELETE personnes" ON public.personnes FOR DELETE TO authenticated
  USING (public.has_access_to_client(id_personne::text));

DROP POLICY IF EXISTS "Agents can SELECT comptes_epargne" ON public.comptes_epargne;
DROP POLICY IF EXISTS "Agents can INSERT comptes_epargne" ON public.comptes_epargne;
DROP POLICY IF EXISTS "Agents can UPDATE comptes_epargne" ON public.comptes_epargne;
DROP POLICY IF EXISTS "Agents can DELETE comptes_epargne" ON public.comptes_epargne;
CREATE POLICY "Agents can SELECT comptes_epargne" ON public.comptes_epargne FOR SELECT TO authenticated
  USING (public.current_user_is_active_staff());
CREATE POLICY "Agents can INSERT comptes_epargne" ON public.comptes_epargne FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active_staff() AND created_by = auth.uid());
CREATE POLICY "Agents can UPDATE comptes_epargne" ON public.comptes_epargne FOR UPDATE TO authenticated
  USING (public.has_access_to_compte_epargne(id_compte_epargne))
  WITH CHECK (public.has_access_to_compte_epargne(id_compte_epargne));
CREATE POLICY "Agents can DELETE comptes_epargne" ON public.comptes_epargne FOR DELETE TO authenticated
  USING (public.has_access_to_compte_epargne(id_compte_epargne));

DROP POLICY IF EXISTS "Agents can SELECT comptes_credit" ON public.comptes_credit;
DROP POLICY IF EXISTS "Agents can INSERT comptes_credit" ON public.comptes_credit;
DROP POLICY IF EXISTS "Agents can UPDATE comptes_credit" ON public.comptes_credit;
DROP POLICY IF EXISTS "Agents can DELETE comptes_credit" ON public.comptes_credit;
CREATE POLICY "Agents can SELECT comptes_credit" ON public.comptes_credit FOR SELECT TO authenticated
  USING (public.current_user_is_active_staff());
CREATE POLICY "Agents can INSERT comptes_credit" ON public.comptes_credit FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active_staff() AND created_by = auth.uid());
CREATE POLICY "Agents can UPDATE comptes_credit" ON public.comptes_credit FOR UPDATE TO authenticated
  USING (public.has_access_to_compte_credit(id_compte_credit))
  WITH CHECK (public.has_access_to_compte_credit(id_compte_credit));
CREATE POLICY "Agents can DELETE comptes_credit" ON public.comptes_credit FOR DELETE TO authenticated
  USING (public.has_access_to_compte_credit(id_compte_credit));

DROP POLICY IF EXISTS "Agents can SELECT transactions_epargne" ON public.transactions_epargne;
DROP POLICY IF EXISTS "Agents can INSERT transactions_epargne" ON public.transactions_epargne;
DROP POLICY IF EXISTS "Agents can UPDATE transactions_epargne" ON public.transactions_epargne;
DROP POLICY IF EXISTS "Agents can DELETE transactions_epargne" ON public.transactions_epargne;
CREATE POLICY "Agents can SELECT transactions_epargne" ON public.transactions_epargne FOR SELECT TO authenticated
  USING (public.current_user_is_active_staff());
CREATE POLICY "Agents can INSERT transactions_epargne" ON public.transactions_epargne FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active_staff() AND created_by = auth.uid());
CREATE POLICY "Agents can UPDATE transactions_epargne" ON public.transactions_epargne FOR UPDATE TO authenticated
  USING (public.has_access_to_transaction_epargne(id_transaction_epargne))
  WITH CHECK (public.has_access_to_transaction_epargne(id_transaction_epargne));
CREATE POLICY "Agents can DELETE transactions_epargne" ON public.transactions_epargne FOR DELETE TO authenticated
  USING (public.has_access_to_transaction_epargne(id_transaction_epargne));

DROP POLICY IF EXISTS "Agents can SELECT transactions_credit" ON public.transactions_credit;
DROP POLICY IF EXISTS "Agents can INSERT transactions_credit" ON public.transactions_credit;
DROP POLICY IF EXISTS "Agents can UPDATE transactions_credit" ON public.transactions_credit;
DROP POLICY IF EXISTS "Agents can DELETE transactions_credit" ON public.transactions_credit;
CREATE POLICY "Agents can SELECT transactions_credit" ON public.transactions_credit FOR SELECT TO authenticated
  USING (public.current_user_is_active_staff());
CREATE POLICY "Agents can INSERT transactions_credit" ON public.transactions_credit FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active_staff() AND created_by = auth.uid());
CREATE POLICY "Agents can UPDATE transactions_credit" ON public.transactions_credit FOR UPDATE TO authenticated
  USING (public.has_access_to_transaction_credit(id_transaction_credit))
  WITH CHECK (public.has_access_to_transaction_credit(id_transaction_credit));
CREATE POLICY "Agents can DELETE transactions_credit" ON public.transactions_credit FOR DELETE TO authenticated
  USING (public.has_access_to_transaction_credit(id_transaction_credit));

-- Creator attribution is immutable after insertion, even through direct API calls.
CREATE OR REPLACE FUNCTION public.preserve_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'personnes', 'comptes_epargne', 'comptes_credit',
    'transactions_epargne', 'transactions_credit'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_preserve_created_by ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_preserve_created_by BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.preserve_created_by()',
      v_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_created_by() FROM PUBLIC, anon, authenticated;
