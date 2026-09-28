# Tests du Portail BSO

Deux couches automatisées couvrent les workflows critiques : la logique applicative et les règles PostgreSQL.

## 1. Tests applicatifs — Vitest

Les 33 tests vérifient notamment :

- les calculs de crédit;
- les statistiques et le Total Cash;
- l’inclusion des encaissements en attente;
- l’exclusion des transactions rejetées;
- les résumés de synchronisation;
- le mapping entre Dexie et Supabase;
- la conservation de `created_by`;
- la matrice Admin, Manager, Finance, Agent et rôle non défini;
- la purge locale lors de la déconnexion.

```powershell
npm.cmd test
npm.cmd run test:watch
```

Les modules accédant au navigateur, à Dexie ou à Supabase sont isolés avec des mocks lorsque cela est nécessaire.

## 2. Vérification complète du frontend

```powershell
npm.cmd run check
```

Cette commande exécute successivement :

1. le contrôle TypeScript sans génération de fichiers;
2. les tests Vitest;
3. le build PWA de production.

## 3. Tests de base de données — SQL transactionnel

Les 20 scénarios couvrent :

- dépôts et paiements en attente puis validés;
- refus des surpaiements;
- retraits et virements;
- calculs et invariants de crédit;
- détection des irrégularités;
- génération des numéros et détection des doublons;
- matrice des rôles;
- invitations Admin/Manager sans création de rôle Admin;
- accès temporaire des Agents;
- privilèges des fonctions RPC;
- politiques RLS granulaires;
- immutabilité de l’auteur de création.

```powershell
$env:SUPABASE_ACCESS_TOKEN='sbp_xxx'
node supabase/tests/run.mjs
Remove-Item Env:\SUPABASE_ACCESS_TOKEN
```

Le jeton doit être temporaire et ne doit jamais être enregistré dans Git.

La suite `supabase/tests/db_tests.sql` est non destructive : chaque scénario est annulé, puis le rapport final provoque l’annulation de la transaction englobante. Aucun jeu de test n’est conservé dans la base cible.
