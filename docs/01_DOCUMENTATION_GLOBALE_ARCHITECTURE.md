# 🏛️ Documentation Globale & Architecture — BSO Portal

> **Version** : 2.0.0 (Production-Ready)  
> **Type d'Application** : Progressive Web App (PWA) Offline-First  
> **Secteur** : Microfinance & Gestion de Collecte de Terrain  
> **Dépôt GitHub** : `platon777/BSO_portal`

---

## 1. 🎯 Présentation Générale & Objectifs Métier

**BSO Portal** est une solution numérique de microfinance conçue pour automatiser, fiabiliser et sécuriser l'ensemble des opérations de collecte d'épargne et de remboursement de crédit effectuées par les agents de terrain en Haïti.

### 🔑 Problématique résolue
Sur le terrain, les agents de collecte opèrent fréquemment dans des zones à connectivité internet instable ou inexistante. L'application permet à l'agent d'effectuer toutes ses opérations hors-ligne en toute fluidité, puis de synchroniser ses données dès qu'une connexion est disponible. Au bureau, l'équipe Finance/Management rapproche le cash physique collecté avec les opérations enregistrées avant de les valider officiellement.

---

## 2. 🧱 Architecture Technique Globale

L'architecture repose sur un modèle hybride **Offline-First** avec stockage local persistant et synchronisation bidirectionnelle vers le cloud Supabase.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BSO Portal Frontend PWA                         │
│   (React 18 + TypeScript + Vite + TailwindCSS + Service Worker PWA)    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                   ┌───────────────┴───────────────┐
                   ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │     Base Locale        │      │    Service Worker      │
       │     Dexie.js           │      │    (Workbox Offline)   │
       │   (IndexedDB Local)    │      │ Cache des assets & UI  │
       └───────────┬────────────┘      └────────────────────────┘
                   │
                   │  syncService.ts (Queue & Diff Sync)
                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Backend Cloud Supabase                          │
│   - PostgreSQL 15 + Row Level Security (RLS)                           │
│   - Supabase Auth (Gestion des sessions & identifiants)                │
│   - Triggers SQL (Calculs officiels des soldes & intégrité)            │
│   - RPC Stored Procedures (Validation de masse, audit, invitations)    │
└────────────────────────────────────────────────────────────────────────┘
```

### 💻 Stack Technologique
* **Frontend Framework** : React 18 avec TypeScript
* **Build Tool & Bundler** : Vite 6 (avec Rollup chunking optimisé)
* **PWA & Offline Assets** : `vite-plugin-pwa` avec Workbox (Cache-First pour les assets, Network-First pour les données)
* **Base de Données Locale** : `Dexie.js` (IndexedDB Wrapper réactif via `dexie-react-hooks`)
* **State Management** : Zustand (`authStore.ts`) + Dexie Live Queries
* **Design & UI** : TailwindCSS + Vanilla CSS fluide (responsive Mobile & Desktop)
* **Backend BaaS** : Supabase (PostgreSQL, Auth, Functions RPC, Policies RLS)
* **Tests Unitaires** : Vitest (25 tests unitaires automatisés)

---

## 3. 🗄️ Modèle de Données (Schéma des Tables)

### 3.1. `personnes` (Clients)
Représente les clients et bénéficiaires de la microfinance.
* `id_personne` (UUID, PK)
* `code_client` (Text, Unique, ex: `CLI-001`)
* `prenom` / `nom` (Text)
* `telephone` / `adresse` / `sexe` (Text)
* `cin` / `nif` (Text, Optionnels)
* `statut` (Text : 'Actif' | 'Inactif')
* `created_by` (UUID, Référence agent créateur)

### 3.2. `comptes_epargne` (Comptes Épargne & Plans)
* `id_compte_epargne` (UUID, PK)
* `id_personne` (UUID, FK -> `personnes`)
* `no_compte` (Text, Unique, ex: `EP-00123`)
* `categorie_compte_epargne` (Text : `'Epargne'` | `'Fonds Garantie'` | `'Grandon'`)
* `solde_actuel` (Numeric, calculé et protégé par triggers serveur)
* `fonds_garantie` (Numeric)
* `statut` (Text : 'Actif' | 'Fermé' | 'Bloqué')
* `created_by` (UUID)

### 3.3. `comptes_credit` (Dossiers de Crédit)
* `id_compte_credit` (UUID, PK)
* `id_personne` (UUID, FK -> `personnes`)
* `no_compte` (Text, Unique, ex: `CR-00456`)
* `type_compte_credit` (Text : `'Credit Cash'` | `'Konfyans'` | `'Electromenager'`)
* `montant_prete` (Numeric, Principal prêté)
* `taux_interet` (Numeric, Taux mensuel en % ou décimal)
* `duree_credit_mois` (Integer, Durée en mois)
* `montant_final` (Numeric, Capital Final = `Principal * (1 + Taux * Durée)`)
* `paiement_journalier` (Numeric, Mensualité/Versement théorique)
* `paiement_cumule` / `paiement_rembourse` (Numeric, Somme des remboursements)
* `montant_restant` (Numeric, Reste à rembourser)
* `statut` (Text : `'Actif'` | `'Payé'` | `'En retard'`)

### 3.4. `transactions_epargne` (Opérations Épargne)
* `id_transaction_epargne` (UUID, PK)
* `id_compte_epargne` (UUID, FK)
* `no_compte` (Text)
* `type_transaction` (Text : `'D'` (Dépôt), `'R'` (Retrait), `'FL'` (Frais Livret), `'S'` (Frais Service), `'V'` (Virement), `'FA'` (Frais Auto))
* `montant` (Numeric)
* `solde_avant_transaction_declare` (Numeric, Saisi par l'agent)
* `solde_apres_transaction_declare` (Numeric, Saisi par l'agent)
* `is_solde_initial` (Boolean, `true` si report de carnet d'ouverture)
* `virement_from` / `virement_to` (Text, Comptes émetteur/bénéficiaire)
* `validation_status` (Text : `'pending'` | `'confirmed'` | `'rejected'`)
* `validated_by` / `validated_at` / `validation_note` (Metadata validation finance)

### 3.5. `transactions_credit` (Remboursements Crédit)
* `id_transaction_credit` (UUID, PK)
* `id_compte_credit` (UUID, FK)
* `no_compte` (Text)
* `type_transaction` (Text : `'Paiement'` | `'Penalite'`)
* `montant` (Numeric)
* `versement_declare` (Numeric, Saisi par l'agent dans le bordereau)
* `validation_status` (Text : `'pending'` | `'confirmed'` | `'rejected'`)
* `validated_by` / `validated_at` / `validation_note`

### 3.6. `invitation_codes` (Gestion des Inscriptions Restreintes)
* `id` (UUID, PK)
* `code` (Text, Unique, format `BSO-XXXX-XXXX`)
* `role` (Integer : `1`=Admin, `2`=Manager, `3`=Agent, `5`=Finance)
* `is_used` (Boolean)
* `used_by` (UUID -> `profiles`)
* `expires_at` (Timestamptz)
* `note` (Text)

---

## 4. 🔄 Moteur de Synchronisation Offline-First

### 4.1. File d'Attente Locale (`syncQueue`)
Toute création, modification ou suppression locale génère une entrée dans la table Dexie `syncQueue` :
```typescript
interface SyncQueueItem {
  id?: number;
  table: 'personnes' | 'comptes_epargne' | 'comptes_credit' | 'transactions_epargne' | 'transactions_credit';
  action: 'add' | 'update' | 'delete';
  pk: string;
  data: any;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
  error?: string;
}
```

### 4.2. Règles Clés de Synchronisation
1. **Fusion intelligente des modifications hors-ligne (`addToSyncQueue`)** :
   Si un agent crée un dépôt de 1 000 HTG hors-ligne puis le modifie à 500 HTG avant d'avoir du réseau, le payload d'ajout est automatiquement fusionné et mis à jour.
2. **Lecture directe de l'état frais Dexie (`uploadSyncItem`)** :
   Avant tout appel réseau vers Supabase, le système relit la table locale pour garantir l'envoi de la version la plus récente.
3. **Assainissement strict des colonnes (`schemaMapper.ts`)** :
   Les données locales contenant des jointures d'interface (ex: `client_name`, `client_code`) sont filtrées pour n'envoyer que les colonnes exactes de PostgreSQL, évitant l'erreur PostgREST `PGRST204`.
4. **Non-écrasement des triggers serveur** :
   Les soldes calculés serveur (`solde_actuel`, `montant_restant`) sont recalculés par les triggers PostgreSQL lors de la validation officielle.

---

## 5. 🧮 Moteur de Calcul Financier & Rapports

Le fichier [services/statistics.ts](file:///c:/Users/Lenovo/Documents/GitHub/BSO_portal/services/statistics.ts) centralise toutes les métriques de la journée et de l'agent :

### 5.1. Dépôts Épargne (Ventilés par produit)
* **Dépôt Épargne Standard** : `type_transaction === 'D'` et catégorie `Epargne` (exclut `is_solde_initial`).
* **Dépôt Fonds de Garantie** : `type_transaction === 'D'` et catégorie `Fonds Garantie`.
* **Dépôt Grandon** : `type_transaction === 'D'` et catégorie `Grandon`.
* **Solde Cumulé (Épargne)** : Somme des `solde_apres_transaction_declare` des transactions épargne de la période.

### 5.2. Remboursements Crédit (Ventilés par produit)
* **Paiement Crédit Cash** : `type_transaction === 'Paiement'` sur compte `Credit Cash`.
* **Paiement Konfyans** : `type_transaction === 'Paiement'` sur compte `Konfyans`.
* **Paiement Électroménager** : `type_transaction === 'Paiement'` sur compte `Electromenager`.
* **Versement Cumulé (Crédit)** : Somme des `versement_declare` saisis par l'agent.

### 5.3. Total Cash Physique Collecté
Formule de rapprochement de caisse physique nette :
$$\text{Total Cash} = (\text{Dépôts Épargne} + \text{Paiements Crédit} + \text{Pénalités} + \text{Monnaie} + \text{Frais}) - \text{Retraits} - \text{Remises}$$
