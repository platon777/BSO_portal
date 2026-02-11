-- Fix credit interest calculation after switching taux_interet to integer percent.
-- Correct formula: montant_final = montant_prete * (1 + (taux_interet/100) * duree_credit_mois)
-- Also recompute existing montant_final/montant_restant values safely.

create table if not exists public.comptes_credit_amounts_backup_20260211_fix_percent (
  id_compte_credit uuid primary key,
  old_taux_interet numeric,
  old_montant_final numeric,
  old_montant_restant numeric,
  old_paiement_cumule numeric,
  backed_up_at timestamp with time zone not null default now(),
  migration_tag text not null default '20260211_fix_credit_percent_formula_and_recompute'
);

insert into public.comptes_credit_amounts_backup_20260211_fix_percent (
  id_compte_credit,
  old_taux_interet,
  old_montant_final,
  old_montant_restant,
  old_paiement_cumule
)
select
  c.id_compte_credit,
  c.taux_interet,
  c.montant_final,
  c.montant_restant,
  c.paiement_cumule
from public.comptes_credit c
on conflict (id_compte_credit) do nothing;

create or replace function public.calculate_montant_final()
returns trigger
language plpgsql
as $function$
declare
  taux_percent numeric;
  calc_montant_final numeric;
begin
  -- Backward compatibility: if decimal slips in (e.g. 0.07), convert to percent.
  if new.taux_interet > 0 and new.taux_interet < 1 then
    taux_percent := new.taux_interet * 100;
  elsif new.taux_interet > 100 and new.taux_interet <= 10000 then
    -- Defensive normalization for accidental double-scaling (e.g. 1000 -> 10)
    taux_percent := new.taux_interet / 100;
  else
    taux_percent := new.taux_interet;
  end if;

  calc_montant_final := new.montant_prete * (1 + (coalesce(taux_percent, 0) / 100) * coalesce(new.duree_credit_mois, 0));

  new.montant_final := calc_montant_final;
  new.montant_restant := greatest(calc_montant_final - coalesce(new.paiement_cumule, 0), 0);

  return new;
end;
$function$;

drop trigger if exists trigger_calculate_montant_final on public.comptes_credit;
create trigger trigger_calculate_montant_final
before insert or update of montant_prete, taux_interet, duree_credit_mois, paiement_cumule
on public.comptes_credit
for each row
execute function public.calculate_montant_final();

-- Recompute existing values with the corrected formula.
update public.comptes_credit c
set
  taux_interet = case
    when c.taux_interet > 100 and c.taux_interet <= 10000 then round((c.taux_interet::numeric / 100))::integer
    else c.taux_interet
  end,
  montant_final = c.montant_prete * (
    1 + (
      (
        case
          when c.taux_interet > 100 and c.taux_interet <= 10000 then (c.taux_interet::numeric / 100)
          else c.taux_interet::numeric
        end
      ) / 100
    ) * c.duree_credit_mois
  ),
  montant_restant = greatest(
    (
      c.montant_prete * (
        1 + (
          (
            case
              when c.taux_interet > 100 and c.taux_interet <= 10000 then (c.taux_interet::numeric / 100)
              else c.taux_interet::numeric
            end
          ) / 100
        ) * c.duree_credit_mois
      )
    ) - coalesce(c.paiement_cumule, 0),
    0
  ),
  updated_at = coalesce(c.updated_at, current_timestamp);

-- Ensure incremental clients receive corrected rows.
update public.comptes_credit c
set updated_at = current_timestamp
from public.comptes_credit_amounts_backup_20260211_fix_percent b
where b.id_compte_credit = c.id_compte_credit
  and (
    abs(coalesce(c.montant_final, 0) - coalesce(b.old_montant_final, 0)) > 0.01
    or abs(coalesce(c.montant_restant, 0) - coalesce(b.old_montant_restant, 0)) > 0.01
    or coalesce(c.taux_interet::numeric, 0) <> coalesce(b.old_taux_interet, 0)
  );
