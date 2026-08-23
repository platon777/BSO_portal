# ⚠️ Points de Vigilance, Sécurité & Gestion des Risques — BSO Portal

Ce document répertorie les règles critiques de sécurité, les risques opérationnels liés au mode hors-ligne et les procédures d'intégrité financière à respecter impérativement en production.

---

## 1. 🚨 Règles d'Or Opérationnelles (À Ne Jamais Transgresser)

### 🔴 RÈGLE N°1 : Ne JAMAIS « Vider la base » avec des opérations en attente
* **Le Risque** : Si un agent clique sur *« Vider la base de données »* dans les Paramètres alors qu'il a des opérations collectées non encore synchronisées (`syncQueue` > 0), ces opérations et l'historique local seront **irrémédiablement effacés** de l'appareil avant d'avoir atteint Supabase.
* **Procédure de sécurité** :
  1. Toujours vérifier la section **« État de la synchronisation »** dans les Paramètres.
  2. Si des éléments sont en attente ou en échec, effectuer une synchronisation réussie avant toute maintenance.
  3. L'action de suppression est protégée par un modal de confirmation à double verrouillage.

### 🔴 RÈGLE N°2 : Distinction stricte entre « Solde Déclaré » et « Solde Réel Validé »
* **Principe** :
  * **Solde Déclaré (`solde_declare` / `solde_apres_transaction_declare`)** : C'est le montant inscrit manuellement sur le livret papier du client par l'agent sur le terrain.
  * **Solde Réel (`solde_actuel`)** : C'est le solde comptable officiel calculé par les **triggers PostgreSQL** de Supabase une fois l'opération validée par la Finance.
* **Vigilance** : Un dépôt reste en statut `pending` tant que la Finance n'a pas validé le cash physique. Les soldes réels ne sont incrémentés sur le serveur qu'après validation.

---

## 2. 🛡️ Architecture de Sécurité & Contrôle d'Accès

```
                               ┌────────────────────────┐
                               │  Tentative d'Accès     │
                               └───────────┬────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ Code d'Invitation Valide Requis ?   │
                        └──────────────────┬──────────────────┘
                                           │
                         OUI ──────────────┴────────────── NON
                          ▼                                 ▼
              ┌────────────────────────┐       ┌────────────────────────┐
              │  Compte Créé avec      │       │ Inscription Rejetée    │
              │  Rôle Officiel Assigné │       │ (Accès Bloqué)         │
              └───────────┬────────────┘       └────────────────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │ Politiques RLS actives │
              │ (PostgreSQL Supabase)  │
              └───────────┬────────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────┐
│ Rôle Actif (1, 2, 3, 5)│   │ Rôle Inactif / 4      │
│  Écriture & Sync OK   │   │  Écriture Interdite   │
└───────────────────────┘   └───────────────────────┘
```

### 2.1. Protection contre les Inscriptions Intrusives (Codes d'Invitation)
* En production, l'accès au portail est totalement verrouillé.
* Seuls les codes générés par un Administrateur ou Manager (`generate_invitation_code`) permettent de créer un compte.
* Les codes sont à **usage unique** (`is_used: true` dès validation) et expirent automatiquement après leur délai de validité (7 à 30 jours).

### 2.2. Row Level Security (RLS) sur PostgreSQL
* Toutes les tables de la base de données (`personnes`, `comptes_epargne`, `comptes_credit`, `transactions_epargne`, `transactions_credit`, `invitation_codes`) ont la sécurité RLS activée (`ENABLE ROW LEVEL SECURITY`).
* Les utilisateurs dont le profil est inactif ou non défini (`role = 4`) voient leurs requêtes `INSERT`, `UPDATE` et `DELETE` **rejetées au niveau du moteur de base de données**.

### 2.3. Assainissement du Schéma Client / Serveur (`schemaMapper.ts`)
* Pour éviter toute injection de champs non prévus ou l'erreur de cache PostgREST `PGRST204` (*"Could not find column 'client_name' in schema cache"*), toutes les données transmises à Supabase passent par un **whitelisting strict** dans [services/schemaMapper.ts](file:///c:/Users/Lenovo/Documents/GitHub/BSO_portal/services/schemaMapper.ts).
* Les champs d'affichage locaux (`client_name`, `nom_client`, `client_code`, etc.) sont systématiquement purgés avant transmission.

---

## 3. 🔄 Gestion des Conflits & Résilience Hors-Ligne

### 3.1. Modification d'une Transaction avant Synchronisation
* **Scénario** : L'agent enregistre un dépôt de 1 000 HTG hors-ligne. Quelques minutes plus tard, il se rend compte de son erreur et modifie le montant à 500 HTG, toujours hors-ligne.
* **Comportement garanti** :
  * La fonction `addToSyncQueue` fusionne la mise à jour directement dans l'élément d'ajout initial.
  * Au moment de la synchronisation, `uploadSyncItem` relit la version locale fraîche dans Dexie (`db.table(name).get(pk)`).
  * **Résultat** : C'est le montant corrigé de 500 HTG qui est transmis à Supabase.

### 3.2. Téléchargement Forcé vs Données Locales Non Synchronisées
* Si un utilisateur clique sur **« Télécharger les données »** alors qu'il a des opérations en attente dans `syncQueue` :
  * Le système affiche un avertissement bloquant : *"Vous avez X élément(s) en attente de synchronisation. Le téléchargement forcé pourrait écraser vos modifications locales"*.
  * L'utilisateur doit d'abord synchroniser ses opérations locales avant d'écraser son cache.

### 3.3. Dérogations Temporaires & Journal d'Audit (`AccessGrants`)
* Les modifications exceptionnelles de dossiers clients ou de transactions nécessitent une dérogation d'accès temporaire accordée par un Administrateur ([AccessGrantsPanel.tsx](file:///c:/Users/Lenovo/Documents/GitHub/BSO_portal/components/admin/AccessGrantsPanel.tsx)).
* Chaque action sensible (mise à jour, suppression, modification de montant) est enregistrée dans la table d'audit immuable `agent_action_audits` avec l'identifiant de l'auteur, l'horodatage, les données avant et les données après modification.

---

## 4. 🛠️ Guide de Dépannage Rapide (Troubleshooting)

| Symptôme | Cause Probable | Solution |
| :--- | :--- | :--- |
| **Erreur de synchronisation `PGRST204`** | Un champ virtuel local a été envoyé à Supabase | Vérifier que [schemaMapper.ts](file:///c:/Users/Lenovo/Documents/GitHub/BSO_portal/services/schemaMapper.ts) est à jour avec la dernière version whitelistée. |
| **Opération reste « en attente » dans le rapport** | L'opération n'a pas encore été validée par la Finance | Aller sur la page **Validation**, filtrer par agent et cliquer sur **« Valider tout »**. |
| **Code d'invitation refusé à l'inscription** | Code expiré, mal tapé ou déjà utilisé | Générer un nouveau code depuis **Paramètres > Codes d'Invitation**. |
| **Données lentes à charger sur mobile** | Cache local trop volumineux ou corrompu | Aller dans **Paramètres > Forcer le téléchargement** pour recharger un instantané propre depuis Supabase. |
