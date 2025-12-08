-- Table active_sessions pour l'application de la connexion single-device
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_active timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

-- Créer un index unique partiel pour n'autoriser qu'une seule session active par utilisateur
CREATE UNIQUE INDEX unique_active_session_per_user
  ON public.active_sessions(user_id)
  WHERE is_active = true;

-- Index pour la performance
CREATE INDEX idx_active_sessions_user_id ON public.active_sessions(user_id);
CREATE INDEX idx_active_sessions_fingerprint ON public.active_sessions(device_fingerprint);
CREATE INDEX idx_active_sessions_is_active ON public.active_sessions(is_active);

-- Activer RLS
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

-- Politiques RLS
CREATE POLICY "Users can view their own sessions"
  ON public.active_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions"
  ON public.active_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON public.active_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions"
  ON public.active_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update last_active lors d'UPDATE
CREATE OR REPLACE FUNCTION update_session_last_active()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.last_active = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_session_last_active
  BEFORE UPDATE ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION update_session_last_active();
