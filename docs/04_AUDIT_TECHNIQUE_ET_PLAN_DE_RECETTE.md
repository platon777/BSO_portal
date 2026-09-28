# Audit technique et plan de recette — Portail BSO

**Date de référence :** 23 août 2026

**Périmètre :** dépôt applicatif local et projet Supabase BSO

**Nature des contrôles :** lecture du code, compilation, tests unitaires, tests SQL transactionnels, inspection des politiques et audit des dépendances

## 1. Résumé exécutif

L’audit initial a identifié des écarts importants entre la documentation, l’interface et les protections réellement actives dans Supabase. Les points les plus critiques concernaient des politiques RLS trop ouvertes, les privilèges des fonctions d’invitation, l’accès du rôle non défini, la conservation de données locales après déconnexion et l’attribution du rôle pendant l’inscription.

Les corrections prioritaires ont été développées, testées puis appliquées atomiquement sur Supabase. La logique frontend correspondante existe dans le workspace et passe la chaîne de vérification, mais elle n’est ni commitée ni déployée au moment de cette révision.

### Conclusion

- **Base Supabase :** durcissement appliqué et tests serveur réussis.
- **Code frontend local :** tests, typage et build réussis.
- **Dépendances de production :** aucune vulnérabilité connue signalée par `npm audit --omit=dev`.
- **Mise en production frontend :** conditionnée à une recette humaine et à un déploiement contrôlé.
- **Documents Word :** non générés; validation préalable des Markdown requise.

## 2. Règles validées avec le responsable du projet

1. Le Total Cash inclut tout cash physiquement collecté, même si la transaction attend encore la validation Finance.
2. Admin, Manager et Finance peuvent modifier les données métier sans accès temporaire.
3. Un Agent peut modifier une donnée existante uniquement si un Admin lui a accordé un accès temporaire actif couvrant la ressource.
4. L’Agent peut consulter les données nécessaires au fonctionnement actuel du portail.
5. Le rôle 4 « Non défini » ne peut pas accéder au portail.
6. Admin et Manager peuvent générer des codes d’invitation.
7. Les codes peuvent attribuer Manager, Agent ou Finance, jamais Admin.
8. La déconnexion supprime les données utilisateur et métier locales.
9. Si la déconnexion entraîne la perte d’opérations non synchronisées, l’utilisateur doit confirmer explicitement.

## 3. Constats et traitements

| Réf. | Constat initial | Risque | Traitement | État |
|---|---|---|---|---|
| SEC-01 | Politiques métier accessibles à `public` ou trop permissives | Lecture ou écriture non autorisée | Politiques recréées pour `authenticated`, rôles actifs et accès granulaires | Corrigé sur Supabase |
| SEC-02 | Politique `profiles` de type `ALL ... true` | Exposition ou modification des profils | Remplacée par une lecture limitée au personnel actif | Corrigé sur Supabase |
| SEC-03 | Rôle 4 non bloqué de bout en bout | Compte sans rôle opérationnel utilisable | Blocage dans l’application et les fonctions RLS | Corrigé |
| SEC-04 | RPC d’invitation exécutables par des rôles trop larges | Création ou consommation abusive de codes | Privilèges anonymes révoqués sur les RPC sensibles | Corrigé sur Supabase |
| SEC-05 | Attribution du profil et consommation du code en plusieurs opérations | Compte partiellement créé ou mauvais rôle | Consommation atomique dans le trigger d’inscription | Corrigé sur Supabase |
| SEC-06 | Possibilité de code donnant le rôle Admin | Escalade de privilèges | Rôle Admin retiré de l’interface et refusé côté serveur pour Admin et Manager | Corrigé sur Supabase |
| SEC-07 | `created_by` pouvait être remplacé lors d’une correction | Perte de traçabilité | Mapper conservant l’auteur et triggers d’immutabilité sur cinq tables | Corrigé |
| SEC-08 | Données métier et session conservées après logout | Exposition sur appareil partagé | Purge Dexie, journal, stockage local et caches sensibles | Corrigé localement |
| SEC-09 | Jeton Supabase écrit dans un document du dépôt | Compromission du projet | Jeton retiré du fichier courant | Partiel : rotation et historique Git à traiter |
| QUAL-01 | Erreurs TypeScript | Défauts masqués et build fragile | Types React ajoutés et erreurs corrigées | Corrigé |
| QUAL-02 | Tests absents sur rôles, purge et sécurité DB | Régression silencieuse | Tests applicatifs et scénarios SQL ajoutés | Corrigé |
| QUAL-03 | Vulnérabilité haute dans une dépendance de production | Déni de service ou fuite potentielle | Mise à jour compatible des dépendances | Corrigé |
| DOC-01 | Documentation indiquant React 18, 25 tests et « Production-Ready » | Décision client basée sur des informations fausses | Documentation réécrite à partir de l’état vérifié | Corrigé |

## 4. État Supabase vérifié

Après application de la migration de durcissement :

| Contrôle | Résultat |
|---|---:|
| Politiques sur les cinq tables métier | 20 |
| Politiques métier attribuées à `public` | 0 |
| Politiques granulaires `UPDATE` et `DELETE` | 10 |
| Politiques `profiles` ouvertes avec `true` | 0 |
| Triggers protégeant `created_by` | 5 |
| `anon` peut générer un code | Non |
| `anon` peut consommer un code | Non |
| `anon` peut valider un code avant inscription | Oui, volontairement |

Migration de référence : `supabase/migrations/20260823_harden_roles_invites_and_rls.sql`.

## 5. Preuves automatisées

### Chaîne applicative

Commande :

```powershell
npm.cmd run check
```

Cette commande exécute :

1. `tsc --noEmit`;
2. `vitest run`;
3. `vite build`.

Résultats :

- 6 fichiers de tests réussis;
- 33 tests applicatifs réussis;
- aucune erreur TypeScript;
- build PWA réussi.

### Tests Supabase

Commande prévue :

```powershell
$env:SUPABASE_ACCESS_TOKEN='jeton-temporaire'
node supabase/tests/run.mjs
Remove-Item Env:\SUPABASE_ACCESS_TOKEN
```

Le jeton ne doit jamais être écrit dans le dépôt.

Les 20 scénarios réussis couvrent :

- dépôt en attente sans effet prématuré sur le solde;
- application du dépôt lors de la validation;
- retrait immédiat et solde insuffisant;
- paiement crédit en attente puis confirmé;
- refus du surpaiement à l’insertion et à la validation;
- détection d’écart déclaré/réel;
- conservation du montant lors d’un virement;
- calcul du montant final du crédit;
- invariant `paiement_cumule + montant_restant = montant_final`;
- génération du numéro de compte;
- détection des doublons client;
- matrice des rôles actifs;
- invitations Admin/Manager sans création d’Admin;
- Agent refusé sans dérogation puis autorisé avec dérogation;
- privilèges des RPC;
- présence des politiques RLS granulaires;
- immutabilité de `created_by`;
- couverture des transactions par une dérogation client.

Chaque scénario serveur s’exécute dans une transaction annulée. Les données de production ne sont pas conservées après le test.

### Dépendances

```powershell
npm.cmd audit --omit=dev
```

Résultat : 0 vulnérabilité connue dans les dépendances de production.

Les vulnérabilités restantes de l’audit complet sont liées aux outils de développement. Leur correction demanderait des versions majeures de Vitest ou Happy DOM; elle doit être menée dans une branche séparée et non avec `npm audit fix --force` sur la branche de livraison.

## 6. Plan de recette fonctionnelle

Les scénarios suivants doivent être réalisés sur une instance de recette ou avec des données de test clairement identifiées.

### R01 — Connexion par rôle

Tester un compte Admin, Manager, Finance, Agent et rôle 4.

Attendus :

- rôles 1, 2, 3 et 5 ouvrent le portail;
- le rôle 4 voit un écran d’accès non activé;
- les menus correspondent au rôle;
- aucune donnée n’est visible après déconnexion.

### R02 — Invitations

Pour Admin puis Manager :

1. générer un code Agent;
2. générer un code Manager;
3. générer un code Finance;
4. vérifier l’absence du choix Admin;
5. inscrire un compte avec un code;
6. tenter de réutiliser le même code;
7. tester un code expiré ou révoqué.

Attendus : les trois rôles autorisés fonctionnent; Admin est impossible; un code utilisé ou invalide est refusé.

### R03 — Agent hors ligne

1. se connecter avec réseau;
2. télécharger les données;
3. couper le réseau;
4. créer un client, un compte et une opération de test;
5. corriger l’opération avant synchronisation si le parcours le permet;
6. rétablir le réseau;
7. synchroniser;
8. vérifier Supabase et le rapport.

Attendus : aucune donnée perdue, aucune duplication, dernière version transmise.

### R04 — Total Cash

Créer sur une période contrôlée :

- un dépôt Épargne `pending`;
- un dépôt Fonds Garantie;
- un dépôt GranDon;
- un paiement de crédit `pending`;
- un retrait;
- une remise et de la monnaie client;
- une opération rejetée;
- un solde initial.

Attendus : le Total Cash correspond à la formule documentée; les `pending` sont inclus; le rejet et le solde initial sont exclus.

### R05 — Validation Finance

1. filtrer par Agent et période;
2. comparer le cash physique attendu;
3. confirmer une opération;
4. rejeter une autre avec motif;
5. valider un lot contrôlé;
6. actualiser les rapports et soldes.

Attendus : les soldes sont modifiés une seule fois; le rejet n’a pas d’effet; les compteurs d’attente diminuent.

### R06 — Dérogation Agent

1. tenter de modifier une donnée existante sans accès;
2. accorder une dérogation client de courte durée;
3. modifier une ressource du client;
4. tenter une ressource non couverte;
5. attendre ou provoquer l’expiration;
6. réessayer.

Attendus : refus sans accès, autorisation dans le périmètre, refus hors périmètre et après expiration.

### R07 — Déconnexion

Cas A : aucune opération non synchronisée.

Attendu : déconnexion directe et données locales supprimées.

Cas B : une opération non synchronisée.

Attendu : avertissement. « Annuler » conserve les données; « Continuer » les supprime et termine la déconnexion.

Après chaque cas, vérifier IndexedDB, stockage local, caches sensibles et accès à l’écran précédent.

### R08 — Régression multi-appareils

1. se connecter sur un appareil A;
2. se connecter avec le même compte sur un appareil B;
3. vérifier le comportement de la session A;
4. confirmer qu’aucune session invalide ne continue à synchroniser.

## 7. Contrôles avant déploiement frontend

- [ ] Les scénarios R01 à R08 sont signés.
- [ ] Un backup Supabase récent est disponible.
- [ ] Le jeton découvert dans l’ancien document est révoqué.
- [ ] Le jeton temporaire utilisé pour l’audit est révoqué.
- [ ] Les variables d’environnement du déploiement sont vérifiées.
- [ ] Aucun secret réel n’apparaît dans Git.
- [ ] Le diff applicatif est relu.
- [ ] Le build exact à déployer passe `npm run check`.
- [ ] Un responsable métier valide la formule du Total Cash.
- [ ] Finance valide le parcours de rapprochement et de rejet.
- [ ] Le plan de retour arrière est communiqué.
- [ ] Une fenêtre de surveillance après déploiement est planifiée.

## 8. Ordre de déploiement recommandé

La migration serveur est déjà active et comporte une compatibilité transitoire avec l’ancien parcours d’inscription. Pour la suite :

1. créer un commit de livraison après revue;
2. déployer sur un environnement de recette;
3. exécuter R01 à R08;
4. corriger tout écart;
5. sauvegarder Supabase;
6. déployer le frontend progressivement;
7. contrôler connexion, synchronisation, validation et rapports;
8. surveiller les erreurs pendant la fenêtre convenue;
9. seulement après validation, qualifier la version de livrable de production.

## 9. Réserves

- Aucun test automatisé ne remplace le comptage réel du cash et la validation par Finance.
- Les tests SQL confirment les règles ciblées, pas l’intégralité de toutes les fonctions historiques de la base.
- Les pages ou fonctions encore non finalisées, notamment Dashboard ou Recouvrement si elles font partie du contrat client, doivent être acceptées séparément.
- Le bundle principal dépasse actuellement 500 kB; il s’agit d’un point de performance, pas d’un échec fonctionnel.
- La création exceptionnelle d’un compte Admin nécessite encore une procédure opérationnelle écrite hors du mécanisme d’invitation.

## 10. Décision attendue

Avant la génération des Word, le responsable du projet doit valider :

- la matrice des rôles;
- la formule et la présentation du Total Cash;
- la procédure d’invitation;
- la procédure de déconnexion avec purge locale;
- les risques résiduels;
- la liste des scénarios de recette.
