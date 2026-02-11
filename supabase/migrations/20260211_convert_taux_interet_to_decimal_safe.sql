-- Convert legacy credit interest rates from percentage format (e.g. 7)
-- to decimal format (e.g. 0.07) without losing source values.
-- Safe to run multiple times (idempotent).

create table if not exists public.comptes_credit_taux_interet_backup_20260211 (
  id_compte_credit uuid primary key,
  old_taux_interet numeric,
  old_montant_final numeric,
  old_montant_restant numeric,
  backed_up_at timestamp with time zone not null default now(),
  migration_tag text not null default '20260211_convert_taux_interet_to_decimal_safe'
);

insert into public.comptes_credit_taux_interet_backup_20260211 (
  id_compte_credit,
  old_taux_interet,
  old_montant_final,
  old_montant_restant
)
select
  c.id_compte_credit,
  c.taux_interet,
  c.montant_final,
  c.montant_restant
from public.comptes_credit c
where c.taux_interet is not null
  and c.taux_interet > 1
on conflict (id_compte_credit) do nothing;

update public.comptes_credit
set taux_interet = taux_interet / 100
where taux_interet is not null
  and taux_interet > 1;
