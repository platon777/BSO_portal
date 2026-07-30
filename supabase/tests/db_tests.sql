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
  v_cc uuid; v_cc_no text; v_rem numeric;
  v_v numeric; v_v2 numeric; v_cnt int; v_ok boolean;
  v_tx uuid;
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
    SELECT COALESCE(solde_actuel,0), validation_status INTO v_v, v_acc_no
    FROM public.comptes_epargne c, public.transactions_epargne t WHERE c.id_compte_epargne=v_acc AND t.id_transaction_epargne=v_tx;
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

  -- Rapport final (le RAISE annule toute la transaction : rien n'est persiste)
  RAISE EXCEPTION E'RESULTATS TESTS DB :%', v_report;
END $$;
