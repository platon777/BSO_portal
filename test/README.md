# Tests

Deux couches de tests couvrent les workflows critiques de la plateforme.

## 1. Tests frontend (logique métier) — Vitest

Testent la logique pure : calcul du rapport agent (confirmé vs en attente de
validation, catégories, Total Cash), résumés de synchro (confirmé vs en attente),
mapping Supabase ↔ local, statut crédit dérivé, calculs de crédit.

```bash
npm test          # exécution unique
npm run test:watch
```

Fichiers : `test/*.test.ts`. Les modules qui touchent Dexie/Supabase sont mockés ;
aucune vraie base n'est requise.

## 2. Tests base de données (triggers & workflows) — script SQL rejouable

Testent la logique serveur (triggers) directement sur PostgreSQL — 13 scénarios du
cœur métier :

- report des entrées d'argent (dépôt / paiement) en attente de validation ;
- application du montant à la validation ;
- refus du trop-payé **à l'insertion et à la validation** ;
- retrait immédiat + statut forcé `confirmed` ;
- **virement** épargne (conservation de la masse : source −X, bénéficiaire +X) ;
- **retrait > solde** refusé (solde insuffisant) ;
- calcul du **capital final** crédit à la création ;
- **invariant de cohérence** : `paiement_cumulé + montant_restant = montant_final` ;
- **génération automatique** du n° de compte ;
- **anti-doublon** client (téléphone déjà utilisé) ;
- détection d'écart déclaré / réel.

**Non destructif** : chaque test s'isole et est annulé (rollback) — rien n'est
persisté (vérifié : aucun résidu en base).

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxx node supabase/tests/run.mjs
```

Le script (`supabase/tests/db_tests.sql`) affiche `PASS`/`FAIL` par scénario et
sort en code ≠ 0 si un test échoue. Le jeton n'est jamais committé (lu via l'env).
