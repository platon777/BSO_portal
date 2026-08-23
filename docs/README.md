# 📚 Index de la Documentation Officielle — BSO Portal

Bienvenue dans le centre de documentation de **BSO Portal**. Ce dossier regroupe l'ensemble des spécifications techniques, guides opérationnels et protocoles de sécurité de la plateforme.

---

## 📑 Sommaire des Livrables

### 1. 🏛️ [Documentation Globale & Architecture](file:///c:/Users/Lenovo/Documents/GitHub/BSO_portal/docs/01_DOCUMENTATION_GLOBALE_ARCHITECTURE.md)
* **Contenu** :
  * Présentation générale et modèle Offline-First.
  * Schéma complet des tables (`personnes`, `comptes_epargne`, `comptes_credit`, `transactions_epargne`, `transactions_credit`, `invitation_codes`).
  * Moteur de synchronisation bidirectionnel (`syncQueue`, résolution des modifications hors-ligne).
  * Moteur de calcul financier (formule de capital final, ventilation des dépôts et des paiements de crédit, calcul du Total Cash physique).

---

### 2. 👥 [Guide de Prise en Main par Rôle](file:///c:/Users/Lenovo/Documents/GitHub/BSO_portal/docs/02_GUIDE_PRISE_EN_MAIN_ROLES.md)
* **Contenu** :
  * Matrice des 5 rôles (`1: Admin`, `2: Manager`, `3: Agent`, `5: Finance`, `4: Non défini`).
  * Procédure d'invitation sécurisée et création de compte avec codes uniques (`BSO-XXXX-XXXX`).
  * Déroulé complet d'une journée type pour l'Agent de terrain (collecte offline, saisie des opérations, contrôle du rapport et synchronisation).
  * Procédure de rapprochement et validation de caisse pour l'équipe Finance et Management.

---

### 3. ⚠️ [Points de Vigilance, Sécurité & Gestion des Risques](file:///c:/Users/Lenovo/Documents/GitHub/BSO_portal/docs/03_POINTS_DE_VIGILANCE_ET_SECURITE.md)
* **Contenu** :
  * Les 2 Règles d'Or pour éviter toute perte de données locales.
  * Distinction comptable entre *Solde Déclaré* (terrain) et *Solde Réel Validé* (serveur).
  * Sécurisation des accès via Row Level Security (RLS) et filtrage strict des données transmises (`schemaMapper.ts`).
  * Tableau de dépannage rapide (résolution des erreurs de synchronisation, dérogations d'accès et journal d'audit).

---

> 💡 **Astuce pour Codex / LLM** : Vous pouvez fournir ces 3 fichiers Markdown à Codex ou à tout modèle d'IA pour obtenir un contexte technique exhaustif et fidèle à 100% à la réalité du code déployé.
