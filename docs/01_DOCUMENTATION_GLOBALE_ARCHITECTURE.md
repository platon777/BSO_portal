# Documentation globale et architecture — Portail BSO

**Organisation :** Bwat Sekrem Online

**Application :** Portail BSO

**Type :** application web progressive (PWA) avec fonctionnement hors ligne

**Révision auditée :** 23 août 2026

## 1. Présentation

Le Portail BSO est l’outil opérationnel interne de Bwat Sekrem Online utilisé pour :

- enregistrer et retrouver les clients;
- gérer les comptes d’épargne et de crédit;
- saisir les opérations réalisées sur le terrain;
- travailler temporairement sans connexion Internet;
- synchroniser les opérations avec Supabase;
- rapprocher les opérations numériques du cash physique;
- valider ou rejeter les encaissements;
- produire des rapports par agent et par période;
- contrôler les accès et conserver une piste d’audit.

## 2. Architecture générale

```text
Utilisateur BSO
      |
      v
Frontend PWA React + TypeScript
      |
      +-- IndexedDB / Dexie
      |     Données locales et file de synchronisation
      |
      +-- Service Worker / Workbox
      |     Application et ressources disponibles hors ligne
      |
      +-- Service de synchronisation
            |
            v
Supabase
  - Authentification
  - PostgreSQL
  - Row Level Security (RLS)
  - Fonctions RPC
  - Triggers de calcul et d’audit
```

### Composants vérifiés

| Couche | Technologie | Utilité |
|---|---|---|
| Interface | React 19.2, TypeScript, Tailwind CSS | Écrans, formulaires et navigation responsive |
| Construction | Vite 6.4 | Compilation et livraison du frontend |
| Mode PWA | Workbox, `vite-plugin-pwa` | Cache applicatif et fonctionnement déconnecté |
| Base locale | Dexie sur IndexedDB | Données métier locales et file d’attente |
| État applicatif | Zustand | Session et profil actif |
| Backend | Supabase | Auth, PostgreSQL, API, RPC et RLS |
| Tests | Vitest et tests SQL transactionnels | Régression applicative et base de données |

## 3. Données principales

### `profiles`

Associe un utilisateur Supabase à son rôle BSO.

Champs structurants : `user_id`, `email`, `firstname`, `name`, `role`.

Rôles :

- `1` : Admin;
- `2` : Manager;
- `3` : Agent;
- `4` : Non défini, accès bloqué;
- `5` : Finance.

### `personnes`

Fiches clients : identité, coordonnées, identification, activité, statut et auteur de création. La clé métier est `id_personne`; `code_client` sert de référence opérationnelle.

### `comptes_epargne`

Comptes associés aux clients. Ils peuvent représenter l’épargne, le fonds de garantie ou GranDon. Les principaux champs sont `id_compte_epargne`, `id_personne`, `no_compte`, `categorie_compte_epargne`, `solde_actuel`, `statut` et `created_by`.

### `transactions_epargne`

Opérations possibles :

- `D` : dépôt;
- `R` : retrait;
- `V` : virement;
- `FL` : frais de livret;
- `FA` : frais auto;
- `S` : frais de service.

Les entrées de cash soumises au contrôle Finance utilisent `validation_status` : `pending`, `confirmed` ou `rejected`.

### `comptes_credit`

Dossiers de crédit associés aux clients : principal prêté, taux, durée, paiement prévu, montant final, paiements cumulés, montant restant et type de produit.

Le montant final attendu suit la règle actuellement testée :

```text
montant_final = montant_prete × (1 + taux_interet / 100 × duree_credit_mois)
```

### `transactions_credit`

Enregistre notamment les paiements, pénalités et garanties. Les paiements collectés suivent le même protocole de validation Finance que les dépôts.

### Accès et contrôle

- `invitation_codes` : codes d’inscription à usage unique;
- `temporary_access_grants` : dérogations temporaires attribuées aux Agents;
- tables et vues d’audit : historique des accès et actions sensibles;
- `active_sessions` ou mécanisme équivalent : suivi de la session active par appareil.

## 4. Fonctionnement hors ligne

### Téléchargement

Quand une connexion est disponible, l’application télécharge les données autorisées depuis Supabase et les conserve dans IndexedDB. L’Agent doit effectuer cette opération avant de partir dans une zone sans réseau.

### Saisie locale

Une création, modification ou suppression réalisée hors ligne met à jour Dexie et ajoute une instruction dans `syncQueue`.

Chaque élément de la file contient notamment :

- la table concernée;
- l’action `add`, `update` ou `delete`;
- l’identifiant de la ressource;
- les données à transmettre;
- le statut `pending`, `failed` ou `completed`;
- le nombre de nouvelles tentatives.

### Fusion avant envoi

Si une donnée nouvellement créée est corrigée avant sa première synchronisation, la correction est fusionnée dans l’ajout initial. Avant l’envoi, le service relit aussi la version locale la plus récente.

### Synchronisation

Lorsque le réseau revient :

1. les éléments sont ordonnés selon leurs dépendances;
2. les champs locaux non reconnus par Supabase sont retirés;
3. les opérations sont envoyées;
4. les erreurs sont conservées pour une nouvelle tentative;
5. les données serveur peuvent être téléchargées pour actualiser le poste.

Une synchronisation réussie ne signifie pas nécessairement qu’un dépôt ou paiement est comptablement validé. Une opération peut être présente sur Supabase tout en restant `pending`.

## 5. Validation financière

### Cash physique collecté

Le Total Cash sert au rapprochement avec l’argent physiquement remis par l’Agent. Il inclut les transactions `pending` et `confirmed`, car le cash a déjà été collecté sur le terrain. Une transaction `rejected` est exclue.

La formule actuellement implémentée est :

```text
Total Cash =
  dépôts Épargne
  + dépôts Fonds Garantie
  + dépôts GranDon
  - retraits Épargne
  - retraits des autres catégories
  + frais de livret
  + paiements de crédit
  + pénalités de crédit
  + monnaie client
  - remises client
  + frais de dossier
```

Précisions :

- le report du solde initial d’un ancien carnet n’est pas un encaissement du jour;
- les frais de service `S` ne sont pas inclus dans cette formule;
- le décaissement d’un nouveau crédit est affiché à titre informatif et n’est pas soustrait du Total Cash historique;
- les montants en attente sont présentés séparément afin que Finance sache ce qui reste à rapprocher.

### Solde comptable officiel

Le Total Cash et le solde d’un compte ne représentent pas la même chose :

- le Total Cash suit l’argent physiquement collecté;
- le solde officiel est calculé et protégé côté PostgreSQL;
- un dépôt ou paiement `pending` ne modifie pas encore le solde officiel;
- sa validation applique le montant;
- son rejet l’écarte;
- un retrait d’épargne est traité immédiatement selon les règles serveur.

## 6. Contrôle d’accès

| Rôle | Lecture des données métier | Modification | Invitations | Validation et rapports globaux |
|---|---|---|---|---|
| Admin | Oui | Toutes les ressources | Manager, Agent, Finance | Oui |
| Manager | Oui | Toutes les ressources | Manager, Agent, Finance | Oui |
| Finance | Oui | Toutes les ressources | Non | Oui |
| Agent | Oui | Seulement avec un accès temporaire actif | Non | Données autorisées par l’interface |
| Non défini | Non | Non | Non | Non |

Aucun code d’invitation ne peut créer un Admin. La création ou promotion d’un Admin doit passer par une procédure technique exceptionnelle, contrôlée et auditée.

Les contrôles existent à deux niveaux :

- l’interface masque ou désactive les actions non autorisées;
- les politiques RLS et fonctions PostgreSQL refusent les appels directs non autorisés.

La base ne dépend donc pas uniquement des boutons visibles dans l’application.

## 7. Inscription

Admin et Manager peuvent générer des codes pour les rôles Manager, Agent et Finance. Le code :

- suit le format `BSO-XXXX-XXXX`;
- expire après 1 à 30 jours;
- est utilisable une seule fois;
- est consommé côté serveur pendant la création du compte;
- attribue automatiquement le rôle prévu.

Le rôle Admin est interdit dans cette fonction, y compris si quelqu’un tente d’appeler directement l’API.

## 8. Déconnexion et confidentialité locale

À la déconnexion, le portail supprime :

- la base métier Dexie;
- la file d’attente de synchronisation;
- l’historique local de synchronisation;
- les informations d’authentification hors ligne;
- les jetons de session Supabase;
- les caches d’API et d’images pouvant contenir des données utilisateur.

Les ressources statiques nécessaires au chargement de la PWA et les références non sensibles peuvent rester en cache.

Si des opérations ne sont pas synchronisées, une confirmation avertit l’utilisateur qu’elles seront perdues. Annuler la confirmation conserve la session et les données.

## 9. État vérifié

Au 23 août 2026 :

- TypeScript compile sans erreur;
- 33 tests applicatifs passent;
- 20 scénarios SQL passent dans des transactions annulées;
- le build PWA de production réussit;
- l’audit des dépendances de production indique 0 vulnérabilité connue;
- les tables métier n’ont plus de politique publique;
- les écritures sont protégées par les rôles et les accès temporaires;
- les RPC sensibles d’invitation sont interdites au rôle anonyme.

Le frontend modifié doit encore faire l’objet d’une recette humaine puis d’un déploiement contrôlé. Le terme « prêt pour production » ne doit être utilisé qu’après cette recette.
