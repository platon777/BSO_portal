-- Add PRIMARY KEY on comptes_epargne to enable UPDATE under logical replication
--
-- Context: comptes_epargne is in the supabase_realtime publication, but had no
-- PRIMARY KEY (only UNIQUE constraints). With REPLICA IDENTITY = default,
-- Postgres rejects every UPDATE with:
--   "cannot update table because it does not have a replica identity and publishes updates"
-- This blocked client sync for the table itself AND for transactions_epargne,
-- whose after-insert trigger updates the savings balance on comptes_epargne.
--
-- Strategy: build a new unique index concurrently, promote it to PRIMARY KEY.
-- The old UNIQUE constraint (comptes_epargne_id_compte_epargne_key) is kept
-- because three foreign keys (comptes_credit, transactions_epargne,
-- temporary_access_grants) reference its underlying index. Dropping it would
-- require CASCADE and FK recreation.

CREATE UNIQUE INDEX IF NOT EXISTS comptes_epargne_pkey_idx
  ON public.comptes_epargne (id_compte_epargne);

ALTER TABLE public.comptes_epargne
  ADD CONSTRAINT comptes_epargne_pkey
  PRIMARY KEY USING INDEX comptes_epargne_pkey_idx;
