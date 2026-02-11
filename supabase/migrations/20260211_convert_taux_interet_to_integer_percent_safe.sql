-- Convert credit monthly interest rates to whole-number percentages (e.g. 0.07 -> 7).
-- Safe to run multiple times:
-- - stores a one-time backup per account
-- - skips conversion if the column is already integer/bigint/smallint

create table if not exists public.comptes_credit_taux_interet_backup_20260211_int_percent (
  id_compte_credit uuid primary key,
  old_taux_interet numeric,
  old_type text not null,
  backed_up_at timestamp with time zone not null default now(),
  migration_tag text not null default '20260211_convert_taux_interet_to_integer_percent_safe'
);

do $$
declare
  current_type text;
begin
  select data_type
  into current_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'comptes_credit'
    and column_name = 'taux_interet';

  if current_type is null then
    raise exception 'Column public.comptes_credit.taux_interet not found';
  end if;

  if current_type in ('smallint', 'integer', 'bigint') then
    return;
  end if;

  insert into public.comptes_credit_taux_interet_backup_20260211_int_percent (
    id_compte_credit,
    old_taux_interet,
    old_type
  )
  select
    c.id_compte_credit,
    c.taux_interet,
    current_type
  from public.comptes_credit c
  on conflict (id_compte_credit) do nothing;

  alter table public.comptes_credit
    alter column taux_interet type integer
    using (
      case
        when taux_interet is null then null
        when taux_interet > 0 and taux_interet < 1 then round(taux_interet * 100)
        else round(taux_interet)
      end
    )::integer;
end $$;
