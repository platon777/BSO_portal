-- Item C (feedback 2026-06-28): le solde initial declare a l'ouverture d'un compte
-- epargne ne doit PAS compter comme un depot cash dans le rapport de l'agent
-- (c'est un solde reporte de l'ancien carnet, pas une transaction cash du jour).
--
-- L'ouverture cree malgre tout une transaction 'D' (pour que le trigger de solde
-- positionne le solde du compte cote serveur). On la marque donc avec un drapeau
-- `is_solde_initial` pour pouvoir l'exclure des metriques cash du rapport
-- (Depot, Fonds Garantie, Grandon, Total Cash) sans casser le calcul du solde.

ALTER TABLE public.transactions_epargne
  ADD COLUMN IF NOT EXISTS is_solde_initial boolean NOT NULL DEFAULT false;
