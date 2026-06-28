-- Decision produit (2026-06-28): tout utilisateur authentifie peut modifier/supprimer
-- les donnees. Le modele d'acces granulaire base sur `temporary_access_grants`
-- (fonctions has_access_to_*) bloquait silencieusement les UPDATE/DELETE des
-- non-admins : PostgREST renvoyait error=null mais 0 ligne modifiee, donc la file
-- de synchronisation marquait l'operation "completed" alors que le serveur n'avait
-- rien recu. Resultat: les modifications faites par un manager/agent autorise ne se
-- synchronisaient pas.
--
-- On ouvre donc les policies d'ecriture aux utilisateurs authentifies. Les policies
-- SELECT (true) et INSERT (with_check true) restent inchangees. Les fonctions
-- has_access_to_* et la table temporary_access_grants sont conservees (non
-- supprimees) au cas ou on voudrait revenir a un modele granulaire.
--
-- Pour revenir en arriere: recreer les policies avec USING has_access_to_<table>(...)
-- (voir migrations 20260213_account_scoped_access.sql et
-- 20260213_make_transaction_access_strict.sql).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'personnes',
    'comptes_epargne',
    'comptes_credit',
    'transactions_epargne',
    'transactions_credit'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Agents can UPDATE ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Agents can DELETE ' || t, t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
      'Agents can UPDATE ' || t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)',
      'Agents can DELETE ' || t, t
    );
  END LOOP;
END $$;
