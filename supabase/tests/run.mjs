// Runner de la suite de tests base de donnees (supabase/tests/db_tests.sql).
// La suite est NON destructive (tout est rollback). Elle rapporte PASS/FAIL par test.
//
// Usage :
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node supabase/tests/run.mjs
//   (optionnel) SUPABASE_PROJECT_REF=<ref>   defaut: cdfqltezhcssutyjtyjb
//
// Le token n'est JAMAIS committe : il est lu depuis l'environnement.

import fs from 'fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || 'cdfqltezhcssutyjtyjb';

if (!token) {
  console.error('Erreur: definir SUPABASE_ACCESS_TOKEN (jeton API Management Supabase).');
  process.exit(2);
}

const sql = fs.readFileSync(new URL('./db_tests.sql', import.meta.url), 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});

const txt = await res.text();
// La suite renvoie son rapport via un RAISE (annule la transaction). On l'affiche.
console.log(txt);

const passed = /RESULTATS TESTS DB/.test(txt) && !/FAIL /.test(txt);
console.log(passed ? '\n==> TOUS LES TESTS DB PASSENT' : '\n==> ECHEC : au moins un test DB a echoue');
// process.exitCode (et non process.exit) pour laisser Node se fermer proprement
// (evite un crash de teardown libuv sur Windows).
process.exitCode = passed ? 0 : 1;
