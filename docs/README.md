# Documentation auditée — Portail BSO

**Organisation :** Bwat Sekrem Online

**Périmètre :** portail interne de gestion des opérations financières

**État documentaire :** Markdown validable avant production des documents Word

**Révision :** 23 août 2026

Le portail BSO sert aux équipes internes pour gérer les clients, les comptes, les transactions de terrain, la synchronisation hors ligne et le rapprochement du cash physique.

## Documents disponibles

1. [Documentation globale et architecture](./01_DOCUMENTATION_GLOBALE_ARCHITECTURE.md)
   - finalité du portail;
   - architecture PWA hors ligne;
   - données principales;
   - règles financières et synchronisation;
   - état technique vérifié.

2. [Guide de prise en main par rôle](./02_GUIDE_PRISE_EN_MAIN_ROLES.md)
   - matrice Admin, Manager, Agent, Finance et rôle non défini;
   - inscription par code;
   - journée type d’un agent;
   - validation et rapprochement de caisse;
   - déconnexion sécurisée.

3. [Points de vigilance et sécurité](./03_POINTS_DE_VIGILANCE_ET_SECURITE.md)
   - risques hors ligne;
   - protection des accès et des données;
   - distinction entre cash collecté et solde comptable;
   - incidents, sauvegardes et maintenance;
   - risques résiduels.

4. [Audit technique et plan de recette](./04_AUDIT_TECHNIQUE_ET_PLAN_DE_RECETTE.md)
   - constats corrigés;
   - preuves de tests;
   - contrôles avant déploiement;
   - scénarios d’acceptation client;
   - réserves et prochaines décisions.

## Règles métier validées

- Le Total Cash représente le cash physique collecté, y compris les opérations en attente de validation; les opérations rejetées sont exclues.
- Admin, Manager et Finance peuvent modifier les données métier sans dérogation temporaire.
- L’Agent peut consulter les données, mais ne peut modifier ou supprimer une ressource qu’avec un accès temporaire actif accordé par un Admin.
- Admin et Manager peuvent générer des codes d’invitation pour Manager, Agent et Finance.
- Aucun code d’invitation ne peut attribuer le rôle Admin.
- Le rôle 4, « Non défini », reste bloqué.
- La déconnexion supprime les données utilisateur et métier conservées localement. Si des opérations ne sont pas synchronisées, l’utilisateur doit confirmer leur perte.

## Limite de cette livraison documentaire

Ces fichiers décrivent l’état audité du code et de Supabase. Ils ne remplacent pas une recette humaine sur téléphone et ordinateur, ni une décision formelle de mise en production. Les documents Word ne doivent être générés qu’après validation de ces Markdown par le responsable du projet.
