-- Suite de tests base de donnees (rejouable, NON destructive).
--
-- Chaque test s'execute dans un sous-bloc isole qui est ROLLBACK a la fin (via un
-- RAISE 'OK'), donc aucune donnee n'est modifiee en base. Le rapport final est
-- renvoye via un RAISE EXCEPTION (qui annule aussi la transaction englobante).
--
-- A executer sur la base cible (ex: API Management Supabase). La sortie (le message
-- d'erreur "RESULTATS TESTS ...") liste PASS/FAIL par scenario. Aucun echec attendu.

DO $$
DECLARE
  v_report text := '';
  v_acc uuid; v_acc_no text; v_solde0 numeric;
  v_acc2 uuid; v_acc2_no text; v_solde2 numeric;
  v_cc uuid; v_cc_no text; v_rem numeric; v_final numeric;
  v_pers uuid; v_phone text;
  v_v numeric; v_v2 numeric; v_cnt int; v_ok boolean;
  v_tx uuid; v_txt text;
  v_tx_epargne_fixture uuid; v_tx_client_id text;
  v_admin_uid uuid; v_agent_uid uuid; v_role4_uid uuid; v_finance_uid uuid;
  v_creator_before uuid; v_creator_attempt uuid; v_json jsonb;
BEGIN
  -- Fixtures (comptes existants ; jamais modifies durablement)
  SELECT id_compte_epargne, no_compte, COALESCE(solde_actuel,0)
    INTO v_acc, v_acc_no, v_solde0
  FROM public.comptes_epargne WHERE no_compte IS NOT NULL LIMIT 1;

  SELECT id_compte_credit, no_compte,
         COALESCE(montant_restant, GREATEST(COALESCE(montant_final,0)-COALESCE(paiement_cumule,0),0))
    INTO v_cc, v_cc_no, v_rem
  FROM public.comptes_credit
  WHERE COALESCE(montant_restant, GREATEST(COALESCE(montant_final,0)-COALESCE(paiement_cumule,0),0)) > 2
  LIMIT 1;

  -- Second compte epargne (beneficiaire de virement)
  SELECT id_compte_epargne, no_compte, COALESCE(solde_actuel,0)
    INTO v_acc2, v_acc2_no, v_solde2
  FROM public.comptes_epargne WHERE no_compte IS NOT NULL AND id_compte_epargne <> v_acc LIMIT 1;

  -- Une personne existante avec code_client et telephone (fixtures no_compte / anti-doublon)
  SELECT id_personne, numero_telephone INTO v_pers, v_phone
  FROM public.personnes
  WHERE code_client IS NOT NULL AND numero_telephone IS NOT NULL AND numero_telephone <> '' LIMIT 1;

  SELECT user_id INTO v_admin_uid FROM public.profiles WHERE role = 1 LIMIT 1;
  SELECT user_id INTO v_agent_uid FROM public.profiles WHERE role = 3 LIMIT 1;
  SELECT user_id INTO v_role4_uid FROM public.profiles WHERE role = 4 LIMIT 1;
  SELECT user_id INTO v_finance_uid FROM public.profiles WHERE role = 5 LIMIT 1;

  SELECT te.id_transaction_epargne, ce.id_personne::text
    INTO v_tx_epargne_fixture, v_tx_client_id
  FROM public.transactions_epargne te
  JOIN public.comptes_epargne ce ON ce.id_compte_epargne = te.id_compte_epargne
  LIMIT 1;

  -- TEST 1 : depot 'pending' ne bouge PAS le solde reel (differe) ---------------
  BEGIN
    INSERT INTO public.transactions_epargne (id_transaction_epargne, id_compte_epargne, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (gen_random_uuid(), v_acc, 'D', 0.01, 'pending', now(), now(), v_acc_no);
    SELECT COALESCE(solde_actuel,0) INTO v_v FROM public.comptes_epargne WHERE id_compte_epargne = v_acc;
    ASSERT v_v = v_solde0, format('depot pending a change le solde: %s -> %s', v_solde0, v_v);
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T1 depot differe' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 2 : validation d'un depot applique le montant ---------------------------
  BEGIN
    v_tx := gen_random_uuid();
    INSERT INTO public.transactions_epargne (id_transaction_epargne, id_compte_epargne, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (v_tx, v_acc, 'D', 0.01, 'pending', now(), now(), v_acc_no);
    UPDATE public.transactions_epargne SET validation_status='confirmed' WHERE id_transaction_epargne = v_tx;
    SELECT COALESCE(solde_actuel,0) INTO v_v FROM public.comptes_epargne WHERE id_compte_epargne = v_acc;
    ASSERT v_v = v_solde0 + 0.01, format('validation depot: attendu %s, obtenu %s', v_solde0+0.01, v_v);
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T2 validation depot applique' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 3 : retrait applique immediatement + force 'confirmed' -------------------
  BEGIN
    -- pose un solde via un depot confirme, puis retire
    INSERT INTO public.transactions_epargne (id_transaction_epargne, id_compte_epargne, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (gen_random_uuid(), v_acc, 'D', 5, 'confirmed', now(), now(), v_acc_no);
    v_tx := gen_random_uuid();
    INSERT INTO public.transactions_epargne (id_transaction_epargne, id_compte_epargne, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (v_tx, v_acc, 'R', 2, 'pending', now(), now(), v_acc_no); -- 'pending' envoye mais R n'est pas soumis a validation
    SELECT COALESCE(solde_actuel,0) INTO v_v FROM public.comptes_epargne WHERE id_compte_epargne=v_acc;
    ASSERT v_v = v_solde0 + 3, format('retrait: attendu %s, obtenu %s', v_solde0+3, v_v);
    ASSERT (SELECT validation_status FROM public.transactions_epargne WHERE id_transaction_epargne=v_tx) = 'confirmed', 'R aurait du etre force confirmed';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T3 retrait immediat + confirmed' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 4 : paiement credit 'pending' differe puis applique a la validation ------
  BEGIN
    SELECT COALESCE(paiement_cumule,0) INTO v_v FROM public.comptes_credit WHERE id_compte_credit = v_cc;
    v_tx := gen_random_uuid();
    INSERT INTO public.transactions_credit (id_transaction_credit, id_compte_credit, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (v_tx, v_cc, 'Paiement', 1, 'pending', now(), now(), v_cc_no);
    SELECT COALESCE(paiement_cumule,0) INTO v_v2 FROM public.comptes_credit WHERE id_compte_credit = v_cc;
    ASSERT v_v2 = v_v, 'paiement pending a change paiement_cumule';
    UPDATE public.transactions_credit SET validation_status='confirmed' WHERE id_transaction_credit = v_tx;
    SELECT COALESCE(paiement_cumule,0) INTO v_v2 FROM public.comptes_credit WHERE id_compte_credit = v_cc;
    ASSERT v_v2 = v_v + 1, format('validation paiement: attendu %s, obtenu %s', v_v+1, v_v2);
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T4 paiement differe + validation' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 5 : trop-paye refuse a l'insertion --------------------------------------
  BEGIN
    v_ok := false;
    BEGIN
      INSERT INTO public.transactions_credit (id_transaction_credit, id_compte_credit, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
      VALUES (gen_random_uuid(), v_cc, 'Paiement', v_rem + 1000000, 'confirmed', now(), now(), v_cc_no);
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE='P0001' OR SQLERRM ILIKE '%restant%' THEN v_ok := true; END IF;
    END;
    ASSERT v_ok, 'un paiement > restant aurait du etre refuse';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T5 trop-paye refuse (insert)' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 6 : detection d'ecart declare vs reel -----------------------------------
  BEGIN
    v_tx := gen_random_uuid();
    INSERT INTO public.transactions_epargne (id_transaction_epargne, id_compte_epargne, type_transaction, montant, validation_status, created_at, date_transaction, no_compte, solde_apres_transaction_declare)
    VALUES (v_tx, v_acc, 'D', 5, 'confirmed', now(), now(), v_acc_no, 999999);
    SELECT count(*) INTO v_cnt FROM public.historique_irregularites WHERE id_transaction_epargne = v_tx;
    ASSERT v_cnt = 1, format('irregularite attendue = 1, obtenu %s', v_cnt);
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T6 detection ecart declare/reel' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 7 : trop-paye refuse a la VALIDATION (le restant a baisse entre-temps) ---
  BEGIN
    v_ok := false;
    v_tx := gen_random_uuid();
    -- P1 en attente pour le restant complet (autorise a l'insert car <= restant)
    INSERT INTO public.transactions_credit (id_transaction_credit, id_compte_credit, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (v_tx, v_cc, 'Paiement', v_rem, 'pending', now(), now(), v_cc_no);
    -- P2 confirme consomme tout le restant
    INSERT INTO public.transactions_credit (id_transaction_credit, id_compte_credit, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (gen_random_uuid(), v_cc, 'Paiement', v_rem, 'confirmed', now(), now(), v_cc_no);
    -- Valider P1 doit echouer (restant = 0)
    BEGIN
      UPDATE public.transactions_credit SET validation_status='confirmed' WHERE id_transaction_credit = v_tx;
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE='P0001' OR SQLERRM ILIKE '%restant%' THEN v_ok := true; END IF;
    END;
    ASSERT v_ok, 'la validation d un paiement devenu > restant aurait du echouer';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T7 trop-paye refuse (validation)' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 8 : virement epargne conserve la masse (source -X, beneficiaire +X) -----
  BEGIN
    INSERT INTO public.transactions_epargne (id_transaction_epargne, id_compte_epargne, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (gen_random_uuid(), v_acc, 'D', 10, 'confirmed', now(), now(), v_acc_no); -- source +10
    INSERT INTO public.transactions_epargne (id_transaction_epargne, id_compte_epargne, type_transaction, montant, validation_status, created_at, date_transaction, no_compte, virement_from, virement_to)
    VALUES (gen_random_uuid(), v_acc, 'V', 4, 'confirmed', now(), now(), v_acc_no, v_acc_no, v_acc2_no); -- vers v_acc2
    SELECT COALESCE(solde_actuel,0) INTO v_v  FROM public.comptes_epargne WHERE id_compte_epargne = v_acc;
    SELECT COALESCE(solde_actuel,0) INTO v_v2 FROM public.comptes_epargne WHERE id_compte_epargne = v_acc2;
    ASSERT v_v = v_solde0 + 6,  format('virement source: attendu %s, obtenu %s', v_solde0+6, v_v);
    ASSERT v_v2 = v_solde2 + 4, format('virement beneficiaire: attendu %s, obtenu %s', v_solde2+4, v_v2);
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T8 virement conservation' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 9 : retrait > solde refuse (solde insuffisant) --------------------------
  BEGIN
    v_ok := false;
    BEGIN
      INSERT INTO public.transactions_epargne (id_transaction_epargne, id_compte_epargne, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
      VALUES (gen_random_uuid(), v_acc, 'R', v_solde0 + 1000000, 'confirmed', now(), now(), v_acc_no);
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE='P0001' OR SQLERRM ILIKE '%insuffisant%' THEN v_ok := true; END IF;
    END;
    ASSERT v_ok, 'un retrait > solde aurait du etre refuse';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T9 retrait solde insuffisant refuse' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 10 : creation credit calcule montant_final = prete*(1 + taux%/100 * duree)
  BEGIN
    v_tx := gen_random_uuid();
    INSERT INTO public.comptes_credit (id_compte_credit, montant_prete, taux_interet, duree_credit_mois, paiement_journalier, created_at)
    VALUES (v_tx, 1000, 10, 2, 10, now());
    SELECT montant_final, montant_restant INTO v_v, v_v2 FROM public.comptes_credit WHERE id_compte_credit = v_tx;
    ASSERT v_v = 1200,  format('montant_final: attendu 1200, obtenu %s', v_v);
    ASSERT v_v2 = 1200, format('montant_restant initial: attendu 1200, obtenu %s', v_v2);
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T10 calcul montant_final credit' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 11 : invariant coherence apres paiement : cumule + restant = final ------
  BEGIN
    SELECT COALESCE(montant_final, montant_prete*(1 + (COALESCE(taux_interet,0)/100.0)*COALESCE(duree_credit_mois,0)))
      INTO v_final FROM public.comptes_credit WHERE id_compte_credit = v_cc;
    INSERT INTO public.transactions_credit (id_transaction_credit, id_compte_credit, type_transaction, montant, validation_status, created_at, date_transaction, no_compte)
    VALUES (gen_random_uuid(), v_cc, 'Paiement', 1, 'confirmed', now(), now(), v_cc_no);
    SELECT COALESCE(paiement_cumule,0), COALESCE(montant_restant,0) INTO v_v, v_v2 FROM public.comptes_credit WHERE id_compte_credit = v_cc;
    ASSERT abs((v_v + v_v2) - v_final) < 0.01, format('invariant cumule+restant=final rompu: %s + %s <> %s', v_v, v_v2, v_final);
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T11 invariant cumule+restant=final' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 12 : generation automatique du no_compte epargne -------------------------
  BEGIN
    v_tx := gen_random_uuid();
    INSERT INTO public.comptes_epargne (id_compte_epargne, id_personne, created_at)
    VALUES (v_tx, v_pers, now());
    SELECT no_compte INTO v_txt FROM public.comptes_epargne WHERE id_compte_epargne = v_tx;
    ASSERT v_txt IS NOT NULL AND v_txt <> '', 'no_compte aurait du etre genere automatiquement';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T12 generation auto no_compte' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 13 : anti-doublon client (telephone deja utilise refuse) ----------------
  BEGIN
    v_ok := false;
    BEGIN
      INSERT INTO public.personnes (id_personne, prenom, nom, numero_telephone)
      VALUES (gen_random_uuid(), 'TESTDUP', 'TESTDUP', v_phone);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%existe%' THEN v_ok := true; END IF;
    END;
    ASSERT v_ok, 'un client avec un telephone deja utilise aurait du etre refuse';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T13 anti-doublon client (telephone)' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 14 : role 4 bloque, roles actifs reconnus -------------------------------
  BEGIN
    ASSERT v_role4_uid IS NOT NULL, 'fixture role 4 manquante';
    PERFORM set_config('request.jwt.claim.sub', v_role4_uid::text, true);
    ASSERT NOT public.current_user_is_active_staff(), 'role 4 ne doit pas etre actif';
    ASSERT NOT public.current_user_can_edit_without_grant(), 'role 4 ne doit pas modifier';

    PERFORM set_config('request.jwt.claim.sub', v_finance_uid::text, true);
    ASSERT public.current_user_is_active_staff(), 'finance doit etre actif';
    ASSERT public.current_user_can_edit_without_grant(), 'finance doit pouvoir modifier';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T14 matrice roles active' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 15 : Admin et Manager invitent le staff, jamais un Admin ----------------
  BEGIN
    ASSERT v_role4_uid IS NOT NULL, 'fixture temporaire manager manquante';
    UPDATE public.profiles SET role = 2 WHERE user_id = v_role4_uid;
    PERFORM set_config('request.jwt.claim.sub', v_role4_uid::text, true);

    v_json := public.generate_invitation_code(5, 'test manager finance', 1);
    ASSERT (v_json->>'role')::int = 5, 'manager devrait pouvoir inviter Finance';

    v_ok := false;
    BEGIN
      PERFORM public.generate_invitation_code(1, 'interdit', 1);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN v_ok := true; END IF;
    END;
    ASSERT v_ok, 'manager ne doit jamais pouvoir generer un code Admin';

    PERFORM set_config('request.jwt.claim.sub', v_admin_uid::text, true);
    v_json := public.generate_invitation_code(2, 'test admin manager', 1);
    ASSERT (v_json->>'role')::int = 2, 'admin devrait pouvoir inviter un Manager';

    v_ok := false;
    BEGIN
      PERFORM public.generate_invitation_code(1, 'interdit admin aussi', 1);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN v_ok := true; END IF;
    END;
    ASSERT v_ok, 'admin ne doit jamais pouvoir generer un code Admin';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T15 invitations admin/manager sans escalade' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 16 : Agent refuse sans grant, autorise avec grant actif -----------------
  BEGIN
    ASSERT v_agent_uid IS NOT NULL AND v_admin_uid IS NOT NULL, 'fixtures agent/admin manquantes';
    DELETE FROM public.temporary_access_grants
    WHERE agent_id = v_agent_uid AND client_id = v_pers::text;
    PERFORM set_config('request.jwt.claim.sub', v_agent_uid::text, true);
    ASSERT NOT public.has_access_to_client(v_pers::text), 'agent sans grant ne doit pas modifier';

    INSERT INTO public.temporary_access_grants(agent_id, client_id, granted_by, expires_at, scope_type)
    VALUES (v_agent_uid, v_pers::text, v_admin_uid, now() + interval '10 minutes', 'client');
    ASSERT public.has_access_to_client(v_pers::text), 'grant actif devrait autoriser agent';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T16 agent avec grant actif' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 17 : RPC sensibles interdites au role anon ------------------------------
  BEGIN
    ASSERT NOT has_function_privilege('anon', 'public.generate_invitation_code(integer,text,integer)', 'EXECUTE'), 'anon execute generate invitation';
    ASSERT NOT has_function_privilege('anon', 'public.consume_invitation_code(text,uuid)', 'EXECUTE'), 'anon execute consume invitation';
    ASSERT NOT has_function_privilege('anon', 'public.revoke_invitation_code(uuid)', 'EXECUTE'), 'anon execute revoke invitation';
    ASSERT has_function_privilege('anon', 'public.validate_invitation_code(text)', 'EXECUTE'), 'anon doit pouvoir valider un code avant signup';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T17 privileges RPC invitation' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 18 : policies d ecriture utilisent les controles granulaires ------------
  BEGIN
    SELECT count(*) INTO v_cnt
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('personnes','comptes_epargne','comptes_credit','transactions_epargne','transactions_credit')
      AND cmd IN ('UPDATE','DELETE')
      AND roles @> ARRAY['authenticated']::name[]
      AND qual ILIKE '%has_access_to_%';
    ASSERT v_cnt = 10, format('10 policies granulaires attendues, obtenu %s', v_cnt);

    SELECT count(*) INTO v_cnt
    FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND (qual = 'true' OR with_check = 'true');
    ASSERT v_cnt = 0, 'profiles ne doit plus avoir une policy publique true';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T18 policies RLS granulaires' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 19 : created_by reste immuable lors d une modification ------------------
  BEGIN
    ASSERT v_admin_uid IS NOT NULL AND v_finance_uid IS NOT NULL,
           'fixtures admin/finance manquantes';
    v_tx := gen_random_uuid();
    v_creator_before := v_admin_uid;
    v_creator_attempt := v_finance_uid;
    INSERT INTO public.comptes_credit (
      id_compte_credit, montant_prete, taux_interet, duree_credit_mois,
      paiement_journalier, created_at, created_by
    ) VALUES (v_tx, 1000, 10, 2, 10, now(), v_creator_before);
    UPDATE public.comptes_credit
    SET created_by = v_creator_attempt
    WHERE id_compte_credit = v_tx;
    ASSERT (SELECT created_by FROM public.comptes_credit WHERE id_compte_credit=v_tx) IS NOT DISTINCT FROM v_creator_before,
           'created_by ne doit pas changer';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T19 createur immuable' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- TEST 20 : un grant client couvre les transactions de ce client --------------
  BEGIN
    ASSERT v_agent_uid IS NOT NULL AND v_admin_uid IS NOT NULL,
           'fixtures agent/admin manquantes';
    ASSERT v_tx_epargne_fixture IS NOT NULL AND v_tx_client_id IS NOT NULL,
           'fixture transaction epargne manquante';
    DELETE FROM public.temporary_access_grants
    WHERE agent_id = v_agent_uid
      AND (client_id = v_tx_client_id OR transaction_id = v_tx_epargne_fixture);
    PERFORM set_config('request.jwt.claim.sub', v_agent_uid::text, true);
    ASSERT NOT public.has_access_to_transaction_epargne(v_tx_epargne_fixture),
           'agent sans grant ne doit pas modifier la transaction';

    INSERT INTO public.temporary_access_grants(agent_id, client_id, granted_by, expires_at, scope_type)
    VALUES (v_agent_uid, v_tx_client_id, v_admin_uid, now() + interval '10 minutes', 'client');
    ASSERT public.has_access_to_transaction_epargne(v_tx_epargne_fixture),
           'grant client devrait couvrir ses transactions';
    RAISE EXCEPTION 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'\n' || CASE WHEN SQLERRM='OK' THEN 'PASS' ELSE 'FAIL' END || ' T20 grant client couvre transaction' || CASE WHEN SQLERRM='OK' THEN '' ELSE ' -> '||SQLERRM END;
  END;

  -- Rapport final (le RAISE annule toute la transaction : rien n'est persiste)
  RAISE EXCEPTION E'RESULTATS TESTS DB :%', v_report;
END $$;
