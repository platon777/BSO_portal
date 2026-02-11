-- Ensure decimal interest rates keep enough precision (e.g. 0.065 for 6.50%).
-- Also restores exact converted values from backup table when available.

alter table public.comptes_credit
alter column taux_interet type numeric(10,6) using taux_interet::numeric(10,6);

do $$
begin
  if to_regclass('public.comptes_credit_taux_interet_backup_20260211') is not null then
    update public.comptes_credit c
    set taux_interet = (b.old_taux_interet / 100)
    from public.comptes_credit_taux_interet_backup_20260211 b
    where b.id_compte_credit = c.id_compte_credit;
  end if;
end $$;
