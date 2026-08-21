-- Migration: Système de codes d'invitation pour l'inscription restreinte des agents et staff BSO
-- Création de la table invitation_codes et des fonctions RPC associées

CREATE TABLE IF NOT EXISTS public.invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    role INTEGER NOT NULL DEFAULT 3, -- 1: Admin, 2: Manager, 3: Agent, 5: Finance
    created_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
    is_used BOOLEAN NOT NULL DEFAULT false,
    used_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    note TEXT
);

-- Index pour recherche rapide du code
CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON public.invitation_codes(code);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_is_used ON public.invitation_codes(is_used);

-- Activer RLS
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- Politiques RLS : seuls les admins et managers peuvent voir et manipuler les codes d'invitation
DROP POLICY IF EXISTS "Admins and managers can view invitation codes" ON public.invitation_codes;
CREATE POLICY "Admins and managers can view invitation codes"
ON public.invitation_codes
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.role IN (1, 2)
    )
);

DROP POLICY IF EXISTS "Admins and managers can insert invitation codes" ON public.invitation_codes;
CREATE POLICY "Admins and managers can insert invitation codes"
ON public.invitation_codes
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.role IN (1, 2)
    )
);

DROP POLICY IF EXISTS "Admins and managers can update invitation codes" ON public.invitation_codes;
CREATE POLICY "Admins and managers can update invitation codes"
ON public.invitation_codes
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.role IN (1, 2)
    )
);

-- 1. Fonction RPC pour générer un code d'invitation unique (ex: BSO-7A9K-2M4X)
CREATE OR REPLACE FUNCTION public.generate_invitation_code(
    p_role INTEGER DEFAULT 3,
    p_note TEXT DEFAULT NULL,
    p_expires_days INTEGER DEFAULT 14
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role INTEGER;
    v_new_code TEXT;
    v_record RECORD;
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- Pas de 0, 1, I, O pour éviter confusions
    v_part1 TEXT := '';
    v_part2 TEXT := '';
    i INTEGER;
BEGIN
    -- Vérification des permissions de l'appelant (Admin ou Manager)
    SELECT role INTO v_user_role FROM public.profiles WHERE user_id = auth.uid();
    IF v_user_role IS NULL OR v_user_role NOT IN (1, 2) THEN
        RAISE EXCEPTION 'Accès refusé : Seuls les administrateurs et managers peuvent générer des codes d invitation.';
    END IF;

    -- Validation du rôle assigné
    IF p_role NOT IN (1, 2, 3, 5) THEN
        p_role := 3; -- Défaut: Agent
    END IF;

    -- Génération d'un code unique
    LOOP
        v_part1 := '';
        v_part2 := '';
        FOR i IN 1..4 LOOP
            v_part1 := v_part1 || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
            v_part2 := v_part2 || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
        END LOOP;
        v_new_code := 'BSO-' || v_part1 || '-' || v_part2;

        -- Vérifier l'unicité
        IF NOT EXISTS (SELECT 1 FROM public.invitation_codes WHERE code = v_new_code) THEN
            EXIT;
        END IF;
    END LOOP;

    -- Insertion dans la table
    INSERT INTO public.invitation_codes (
        code,
        role,
        created_by,
        expires_at,
        note
    )
    VALUES (
        v_new_code,
        p_role,
        auth.uid(),
        now() + (COALESCE(p_expires_days, 14) || ' days')::INTERVAL,
        p_note
    )
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

-- 2. Fonction RPC pour valider un code d'invitation (accessible publiquement/anonymement lors du signup)
CREATE OR REPLACE FUNCTION public.validate_invitation_code(
    p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_code TEXT;
    v_record RECORD;
    v_role_label TEXT;
BEGIN
    v_clean_code := upper(trim(COALESCE(p_code, '')));

    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Veuillez saisir un code d invitation.');
    END IF;

    SELECT * INTO v_record
    FROM public.invitation_codes
    WHERE code = v_clean_code;

    IF v_record.id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Code d invitation invalide.');
    END IF;

    IF v_record.is_used THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Ce code d invitation a déjà été utilisé.');
    END IF;

    IF v_record.expires_at < now() THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Ce code d invitation a expiré.');
    END IF;

    -- Libellé du rôle
    CASE v_record.role
        WHEN 1 THEN v_role_label := 'Administrateur';
        WHEN 2 THEN v_role_label := 'Manager';
        WHEN 3 THEN v_role_label := 'Agent de terrain';
        WHEN 5 THEN v_role_label := 'Finance';
        ELSE v_role_label := 'Agent';
    END CASE;

    RETURN jsonb_build_object(
        'valid', true,
        'role', v_record.role,
        'role_label', v_role_label,
        'expires_at', v_record.expires_at,
        'message', 'Code valide ! Vous serez inscrit en tant que : ' || v_role_label
    );
END;
$$;

-- 3. Fonction RPC pour consommer un code d'invitation et attribuer le rôle à l'inscription
CREATE OR REPLACE FUNCTION public.consume_invitation_code(
    p_code TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_code TEXT;
    v_record RECORD;
BEGIN
    v_clean_code := upper(trim(COALESCE(p_code, '')));

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'ID utilisateur requis.';
    END IF;

    -- Verrouiller la ligne pour éviter la réutilisation concurrente
    SELECT * INTO v_record
    FROM public.invitation_codes
    WHERE code = v_clean_code
    FOR UPDATE;

    IF v_record.id IS NULL THEN
        RAISE EXCEPTION 'Code d invitation introuvable.';
    END IF;

    IF v_record.is_used THEN
        RAISE EXCEPTION 'Ce code d invitation a déjà été utilisé.';
    END IF;

    IF v_record.expires_at < now() THEN
        RAISE EXCEPTION 'Ce code d invitation a expiré.';
    END IF;

    -- Marquer comme utilisé
    UPDATE public.invitation_codes
    SET
        is_used = true,
        used_by = p_user_id,
        used_at = now()
    WHERE id = v_record.id;

    -- Attribuer le rôle officiel dans le profil de l'utilisateur
    UPDATE public.profiles
    SET role = v_record.role
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'role', v_record.role,
        'user_id', p_user_id
    );
END;
$$;

-- 4. Fonction RPC pour révoquer / supprimer un code d'invitation non utilisé
CREATE OR REPLACE FUNCTION public.revoke_invitation_code(
    p_code_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role INTEGER;
BEGIN
    SELECT role INTO v_user_role FROM public.profiles WHERE user_id = auth.uid();
    IF v_user_role IS NULL OR v_user_role NOT IN (1, 2) THEN
        RAISE EXCEPTION 'Accès refusé : Seuls les administrateurs et managers peuvent révoquer des codes.';
    END IF;

    DELETE FROM public.invitation_codes
    WHERE id = p_code_id AND is_used = false;

    RETURN jsonb_build_object('success', true);
END;
$$;
