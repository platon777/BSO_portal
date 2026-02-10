alter table public.comptes_credit
add column if not exists montant_deja_paye_manuellement numeric(12,2);

update public.comptes_credit
set montant_deja_paye_manuellement = 0
where montant_deja_paye_manuellement is null;

alter table public.comptes_credit
alter column montant_deja_paye_manuellement set default 0;

alter table public.comptes_credit
alter column montant_deja_paye_manuellement set not null;
