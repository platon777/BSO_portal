-- Decision produit (2026-06-28): la SYNCHRONISATION ne doit pas etre bloquee par
-- les policies RLS.
--
-- Probleme: le modele d'acces granulaire (has_access_to_*) appliquait l'autorisation
-- au niveau base. Quand un agent autorise (grant temporaire) modifiait une donnee
-- puis synchronisait apres expiration du grant, PostgREST renvoyait error=null mais
-- 0 ligne modifiee, et la file marquait l'operation "completed" alors que le serveur
-- n'avait rien recu (perte silencieuse).
--
-- IMPORTANT: le controle d'acces (l'admin qui accorde a un agent le droit de modifier
-- ou supprimer) RESTE EN PLACE, mais cote APPLICATION (services/accessService.ts +
-- modal AccessGrantModal). Il decide QUI peut initier une edition. La base, elle, ne
-- doit plus rejeter la synchronisation d'une edition deja autorisee dans l'app.
--
-- On ouvre donc les policies d'ecriture aux utilisateurs authentifies. SELECT (true)
-- et INSERT (with_check true) restent inchangees. Les fonctions has_access_to_* et la
-- table temporary_access_grants sont conservees (toujours utilisees par l'app).
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
