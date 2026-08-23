# 👥 Guide de Prise en Main par Rôle — BSO Portal

Ce guide décrit le fonctionnement pas-à-pas du portail BSO pour chaque profil d'utilisateur, de l'inscription jusqu'à la clôture journalière de la caisse.

---

## 1. 🛡️ Matrice des Rôles & Permissions

| Rôle | Code Rôle | Inscription | Accès Terrain & Offline | Validation Caisse (Finance) | Génération Codes d'Invitation | Rapports Tous Agents |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Administrateur** | `1` | Code BSO | ✅ Oui | ✅ Oui | ✅ Oui (Tous rôles) | ✅ Oui |
| **Manager** | `2` | Code BSO | ✅ Oui | ✅ Oui | ✅ Oui (Agent, Manager, Finance) | ✅ Oui |
| **Finance** | `5` | Code BSO | ✅ Oui | ✅ Oui | ❌ Non | ✅ Oui |
| **Agent de terrain** | `3` | Code BSO | ✅ Oui | ❌ Non | ❌ Non | ❌ Uniquement ses données |
| **Non défini** | `4` | Sans code | ❌ Bloqué | ❌ Bloqué | ❌ Bloqué | ❌ Bloqué |

---

## 2. 🎟️ Inscription & Activation des Comptes

Pour garantir qu'aucun intrus ne puisse créer de compte sur le portail en production, **l'inscription est strictement conditionnée à un code d'invitation**.

### Étape 1 : Génération du code par le Manager ou l'Admin
1. Connectez-vous sur votre compte Admin ou Manager.
2. Allez dans le menu **Paramètres** > Section **« Codes d'Invitation des Agents & Staff »**.
3. Choisissez le rôle attribué (ex : `Agent de terrain`), la durée (ex : `14 jours`) et une note (ex : *"Pour Marc - Agent Cap-Haïtien"*).
4. Cliquez sur **« ⚡ Créer le code d'invitation »**.
5. Cliquez sur **« 📲 Copier le message WhatsApp »** pour envoyer le code directement à l'agent.

### Étape 2 : Inscription de l'Agent
1. L'agent ouvre l'application sur son téléphone ou son ordinateur.
2. Sur l'écran de connexion, il clique sur **« Créer un compte »**.
3. Il colle son code d'invitation (ex : `BSO-7A4K-9M2X`).
   * Le système valide instantanément le code avec un badge vert : *« ✔ Code valide ! Vous serez inscrit en tant que : Agent de terrain »*.
4. L'agent renseigne son Prénom, Nom, Email et Mot de passe.
5. Son compte est immédiatement opérationnel avec le bon niveau d'accès.

---

## 3. 📱 Parcours Journalier de l'Agent de Terrain

### 3.1. En début de journée (Avant de partir en collecte)
1. Ouvrez l'application avec connexion internet.
2. Allez dans **Paramètres** et vérifiez que votre base locale est à jour.
3. Si nécessaire, cliquez sur **« Télécharger les données »** pour récupérer les derniers clients et dossiers de crédit.

### 3.2. Sur le terrain (100% Fonctionnel Hors-Ligne)
L'agent peut effectuer toutes les opérations sans aucune connexion :
* **Nouveau Client** : Créer une fiche client complète (Prénom, Nom, Téléphone, Adresse, CIN/NIF).
* **Nouveau Compte Épargne** : Ouvrir un compte *Épargne Standard*, *Fonds de Garantie* ou *Grandon*.
* **Dépôt d'Épargne** :
  1. Sélectionner le compte du client.
  2. Cliquer sur **« Transaction »** > Type `Dépôt`.
  3. Saisir le **Montant** remis en liquide par le client.
  4. Saisir le **Solde Après Déclaré** (inscrit sur le carnet physique du client).
  5. Enregistrer : Le solde local est mis à jour et le montant est ajouté au Total Cash.
* **Remboursement de Crédit** :
  1. Ouvrir le dossier crédit du client.
  2. Cliquer sur **« Transaction »** > Type `Paiement`.
  3. Saisir le **Montant** et le **Versement Déclaré**.
  4. Enregistrer : L'opération est immédiatement consignée dans Dexie avec le statut `pending`.
* **Retrait & Virement** : Enregistrer les retraits d'épargne ou virements de compte à compte.

### 3.3. Contrôle en direct dans l'onglet « Rapports »
* L'agent consulte sa fiche de rapport :
  * **Dépôt (Épargne)**, **Fonds Garantie**, **Grandon** (ventilés par catégorie).
  * **Paiement Crédit Cash**, **Konfyans**, **Électroménager** (ventilés par produit).
  * **Solde Cumulé** (somme des soldes après déclarés).
  * **Versement Cumulé** (somme des versements déclarés).
  * **Total Cash Collecté (Physique)** : Montant exact en gourdes que l'agent doit avoir dans sa sacoche.

### 3.4. En fin de journée (Retour au bureau)
1. Dès que l'appareil retrouve une connexion Internet :
2. Allez dans **Paramètres** > Cliquez sur **« Synchroniser maintenant »**.
3. Toutes les opérations hors-ligne sont transmises à Supabase.
4. L'agent remet son cash physique au bureau de contrôle.

---

## 4. 🛡️ Parcours de Contrôle & Validation (Finance / Manager / Admin)

La page **Validation** ([Validation.tsx](file:///c:/Users/Lenovo/Documents/GitHub/BSO_portal/pages/Validation.tsx)) est le centre de contrôle où le cash physique est rapproché des données numériques.

### 4.1. Filtrer et Isoler les Opérations d'un Agent
1. Rendez-vous dans le menu **Validation**.
2. Dans le sélecteur **Filtrer par Agent**, recherchez le nom ou l'ID de l'agent qui dépose son cash.
3. Dans le sélecteur **Période**, choisissez **Aujourd'hui** (ou **Hier**).
4. La bannière verte affiche immédiatement la **Synthèse de Caisse** de l'agent :
   * *Cash Physique Attendu : ex. 15 500.00 HTG*
   * *Détail : Dépôts (8) : 10 000.00 HTG | Paiements Crédit (3) : 5 500.00 HTG*

### 4.2. Rapprochement & Validation
1. **Comptage physique** : Comptez les billets remis par l'agent.
2. **Si le cash correspond** :
   * Cliquez sur le bouton vert : **« ⚡ Valider tout pour [Nom Agent] (X opérations) »**.
   * Le système valide l'ensemble du lot instantanément via RPC Supabase et met à jour la base locale Dexie.
   * Dans le rapport de l'agent, le compteur *Dépôts en attente ⏳* passe immédiatement à **0**.
3. **En cas d'anomalie sur une ligne spécifique** :
   * Vous pouvez valider ou rejeter ligne par ligne.
   * En cliquant sur **« Rejeter »**, un motif peut être saisi (ex : *"Billet manquant"*). L'opération est écartée et ne modifie pas les soldes officiels.
