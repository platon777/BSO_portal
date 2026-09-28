# Guide de prise en main par rôle — Portail BSO

**Public :** Admin, Manager, Finance et Agents de terrain

**Objet :** utiliser le portail de manière correcte et sécurisée

**Révision :** 23 août 2026

## 1. Avant de commencer

Le Portail BSO est une application interne. Chaque utilisateur doit disposer :

- de son propre compte;
- d’un rôle actif;
- d’un appareil protégé par code ou biométrie;
- d’une connexion Internet lors de la première connexion et du téléchargement initial;
- d’un mot de passe qui ne doit jamais être partagé.

Les données clients et les opérations doivent être traitées uniquement dans le portail interne prévu à cet effet.

## 2. Rôles et permissions

| Action | Admin | Manager | Finance | Agent | Non défini |
|---|:---:|:---:|:---:|:---:|:---:|
| Ouvrir le portail | Oui | Oui | Oui | Oui | Non |
| Consulter les données métier | Oui | Oui | Oui | Oui | Non |
| Créer une opération de terrain | Oui | Oui | Oui | Oui | Non |
| Modifier ou supprimer une ressource existante | Oui | Oui | Oui | Avec accès temporaire | Non |
| Voir les soldes et rapports globaux | Oui | Oui | Oui | Limité par l’interface | Non |
| Valider les encaissements | Oui | Oui | Oui | Non | Non |
| Générer un code Manager, Agent ou Finance | Oui | Oui | Non | Non | Non |
| Générer un code Admin | Non | Non | Non | Non | Non |
| Accorder un accès temporaire à un Agent | Oui | Non | Non | Non | Non |

### À retenir

- Admin, Manager et Finance disposent d’un droit global de modification des données métier.
- L’Agent est principalement un opérateur de terrain. Il peut créer ses nouvelles opérations, mais doit recevoir une autorisation temporaire d’un Admin pour corriger ou supprimer une donnée existante protégée.
- Le rôle 4 « Non défini » est un état bloqué, pas un rôle de travail.

## 3. Créer un compte par invitation

### Générer le code

Cette opération est disponible pour Admin et Manager.

1. Ouvrir la section des codes d’invitation.
2. Choisir le rôle : Manager, Agent de terrain ou Finance.
3. Choisir une durée de validité entre 1 et 30 jours.
4. Ajouter une note permettant d’identifier le destinataire.
5. Générer le code.
6. Transmettre le code au destinataire par un canal privé.

Le code est à usage unique. Il ne doit pas être publié dans un groupe public ni réutilisé pour plusieurs personnes.

Le rôle Admin n’est jamais proposé. Une tentative directe par API est également refusée.

### Utiliser le code

1. Ouvrir la page d’inscription.
2. Saisir le code reçu.
3. Compléter le prénom, le nom, l’adresse électronique et le mot de passe.
4. Valider l’inscription.
5. Vérifier que le rôle affiché correspond au rôle annoncé.

Le serveur vérifie et consomme le code pendant la création du compte. Un code expiré, utilisé ou invalide doit être remplacé par un nouveau code.

## 4. Première connexion sur un appareil

1. Se connecter avec Internet.
2. Vérifier le nom et le rôle affichés.
3. Ouvrir les paramètres de synchronisation.
4. Télécharger les données autorisées.
5. Attendre la confirmation de fin de téléchargement.
6. Vérifier que les clients et comptes nécessaires sont visibles.
7. Seulement après ces contrôles, utiliser le portail hors ligne.

Une autre personne ne doit pas réutiliser l’appareil sans déconnexion du premier utilisateur.

## 5. Journée type de l’Agent

### Avant le départ

- connecter l’appareil à Internet;
- ouvrir le portail;
- contrôler la date de la dernière synchronisation;
- télécharger les données si nécessaire;
- vérifier qu’il n’existe pas d’élément en échec dans la file de synchronisation;
- vérifier que l’appareil est suffisamment chargé.

### Sur le terrain

L’Agent peut notamment :

- créer un client;
- ouvrir un compte d’épargne selon les produits disponibles;
- enregistrer un dépôt, un retrait, un virement ou des frais;
- enregistrer un paiement ou une pénalité de crédit;
- consulter son rapport et le Total Cash attendu.

#### Dépôt d’épargne

1. Rechercher le client et ouvrir son compte.
2. Sélectionner « Dépôt ».
3. Saisir le montant réellement reçu.
4. Saisir les informations déclarées demandées par le formulaire.
5. Vérifier le compte, la catégorie et le montant.
6. Enregistrer.

Le dépôt est compté immédiatement dans le cash physique de l’Agent, même s’il reste en attente de validation Finance. Il ne met pas encore à jour le solde comptable officiel tant qu’il n’est pas confirmé.

#### Paiement de crédit

1. Ouvrir le dossier de crédit.
2. Sélectionner « Paiement ».
3. Saisir le montant reçu et le versement déclaré.
4. Vérifier que le paiement ne dépasse pas le restant dû.
5. Enregistrer.

Le paiement apparaît dans le cash physique et reste `pending` jusqu’au contrôle.

#### Retrait

Le retrait diminue le cash détenu par l’Agent. Un retrait supérieur au solde disponible est refusé par les règles serveur.

#### Erreur après saisie

- Si la donnée n’est pas encore synchronisée et que l’interface permet la correction, corriger puis vérifier la file.
- Si la donnée est synchronisée ou protégée, demander un accès temporaire à un Admin.
- Ne jamais contourner la procédure en créant une opération opposée sans justification.

### Retour au bureau

1. Reconnecter l’appareil à Internet.
2. Lancer la synchronisation.
3. Attendre que les éléments `pending` de la file locale soient transmis.
4. Traiter tout élément `failed` avant la remise de caisse.
5. Consulter le rapport de la période.
6. Compter le cash physique.
7. Remettre le cash avec le détail nécessaire à Finance ou au responsable.

## 6. Comprendre le rapport de l’Agent

Le rapport distingue notamment :

- les dépôts Épargne;
- les dépôts Fonds Garantie;
- les dépôts GranDon;
- les retraits;
- les paiements de crédit par produit;
- les pénalités et frais inclus;
- les opérations en attente;
- le Total Cash physique.

Le Total Cash inclut les encaissements `pending` et `confirmed`. Il ne faut pas soustraire une deuxième fois les opérations en attente lors du comptage. Les opérations rejetées sont exclues.

## 7. Validation par Finance, Manager ou Admin

### Préparer le rapprochement

1. Ouvrir la page Validation.
2. Filtrer sur l’Agent concerné.
3. Choisir la période exacte.
4. Vérifier le nombre de dépôts et paiements en attente.
5. Lire le cash physique attendu.
6. Compter le cash remis.

### Si les montants correspondent

- vérifier rapidement les lignes;
- confirmer individuellement ou utiliser la validation en lot;
- vérifier ensuite que le nombre d’opérations en attente a diminué;
- contrôler les soldes et rapports concernés.

### En cas d’écart

- ne pas valider automatiquement le lot;
- identifier la ou les opérations en cause;
- comparer carnet, montant déclaré, montant reçu et compte client;
- documenter le motif;
- confirmer les lignes correctes et rejeter seulement les lignes incorrectes;
- conserver les preuves selon la procédure interne de BSO.

Une opération rejetée ne doit pas modifier le solde officiel et ne doit plus apparaître dans le Total Cash collecté.

## 8. Accès temporaire d’un Agent

Seul un Admin accorde une dérogation temporaire.

L’accès doit préciser :

- l’Agent bénéficiaire;
- le client, compte ou transaction concerné;
- le motif;
- la durée;
- le responsable ayant autorisé l’accès.

Un accès client permet de travailler sur les ressources rattachées à ce client conformément aux contrôles serveur. Un accès limité à une transaction ne doit pas être utilisé pour une autre transaction.

À l’expiration, l’Agent perd automatiquement le droit de modification.

## 9. Déconnexion

La déconnexion efface les données métier et utilisateur conservées localement sur l’appareil.

### Sans opération non synchronisée

1. Cliquer sur « Déconnexion ».
2. Attendre le retour à la page de connexion.
3. Vérifier qu’aucune donnée client n’est accessible sans nouvelle connexion.

### Avec opérations non synchronisées

Le portail affiche un avertissement. Deux choix existent :

- **Annuler** : rester connecté, synchroniser, puis se déconnecter;
- **Continuer** : accepter la suppression définitive des opérations locales non transmises.

La procédure normale est d’annuler, de synchroniser et de vérifier avant de se déconnecter.

## 10. Réflexes essentiels

- Ne jamais partager son compte ou son code d’invitation.
- Ne jamais vider les données locales avant une synchronisation réussie.
- Ne pas confondre Total Cash physique et solde comptable validé.
- Vérifier le client, le compte, le type et le montant avant chaque enregistrement.
- Signaler immédiatement un appareil perdu ou volé.
- Utiliser une dérogation temporaire pour toute correction exceptionnelle d’un Agent.
- Ne jamais promettre qu’une opération est validée uniquement parce qu’elle apparaît dans le rapport.
