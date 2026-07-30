-- Controle anti-fraude (2026-07-30) : le "solde declare" (epargne) et le "versement
-- declare" (credit) sont saisis par l'agent et servent uniquement au controle manager.
-- Ils sont deja separes du solde reel (les triggers de solde ne les lisent jamais).
-- Ici on CABLE la detection : a chaque transaction, si la valeur declaree par l'agent
-- differe de la valeur reelle calculee, on enregistre l'ecart dans historique_irregularites
-- pour que les managers/finance puissent reperer les fraudeurs.
--
-- Rollback : supprimer les triggers/fonction ci-dessous et, si souhaite, les colonnes ajoutees.

-- 1) Enrichir la table de controle (tracabilite) ------------------------------
ALTER TABLE public.historique_irregularites
  ADD COLUMN IF NOT EXISTS id_transaction_epargne uuid,
  ADD COLUMN IF NOT EXISTS id_transaction_credit uuid,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- 2) RLS : lecture pour les utilisateurs connectes, ecriture reservee au trigger
ALTER TABLE public.historique_irregularites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read irregularites" ON public.historique_irregularites;
CREATE POLICY "Read irregularites" ON public.historique_irregularites
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- 3) Fonction de detection d'ecart declare vs reel ----------------------------
CREATE OR REPLACE FUNCTION public.flag_declared_irregularite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_declare numeric;
  v_reel numeric;
BEGIN
  IF TG_TABLE_NAME = 'transactions_epargne' THEN
    -- L'agent declare le solde APRES; on le compare au solde reel calcule par le trigger.
    v_declare := NEW.solde_apres_transaction_declare;
    v_reel := NEW.solde_apres_transactions;
    IF v_declare IS NOT NULL AND v_reel IS NOT NULL AND abs(v_declare - v_reel) > 0.01 THEN
      INSERT INTO public.historique_irregularites
        (no_compte, date_transaction, solde_declare, solde_calcule, ecart, statut_controle,
         id_transaction_epargne, source, created_by)
      VALUES
        (NEW.no_compte, COALESCE(NEW.date_transaction::date, now()::date),
         v_declare, v_reel, v_declare - v_reel, 'a_verifier',
         NEW.id_transaction_epargne, 'epargne', NEW.created_by);
    END IF;

  ELSIF TG_TABLE_NAME = 'transactions_credit' THEN
    -- Pour un paiement, l'agent declare le versement; on le compare au montant reel.
    IF NEW.type_transaction = 'Paiement' AND NEW.versement_declare IS NOT NULL
       AND abs(NEW.versement_declare - NEW.montant) > 0.01 THEN
      INSERT INTO public.historique_irregularites
        (no_compte, date_transaction, solde_declare, solde_calcule, ecart, statut_controle,
         id_transaction_credit, source, created_by)
      VALUES
        (NEW.no_compte, COALESCE(NEW.date_transaction::date, now()::date),
         NEW.versement_declare, NEW.montant, NEW.versement_declare - NEW.montant, 'a_verifier',
         NEW.id_transaction_credit, 'credit', NEW.created_by);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_flag_irregularite_epargne ON public.transactions_epargne;
CREATE TRIGGER trg_flag_irregularite_epargne
AFTER INSERT ON public.transactions_epargne
FOR EACH ROW EXECUTE FUNCTION public.flag_declared_irregularite();

DROP TRIGGER IF EXISTS trg_flag_irregularite_credit ON public.transactions_credit;
CREATE TRIGGER trg_flag_irregularite_credit
AFTER INSERT ON public.transactions_credit
FOR EACH ROW EXECUTE FUNCTION public.flag_declared_irregularite();
