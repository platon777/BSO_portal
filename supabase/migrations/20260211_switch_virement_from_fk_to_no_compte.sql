-- Basculer la reference de virement_from vers le no_compte normal
-- (au lieu de no_compte_ancien), sans perte silencieuse de donnees.

-- 1) Conversion des anciennes valeurs (no_compte_ancien -> no_compte)
update public.transactions_epargne te
set virement_from = ce.no_compte
from public.comptes_epargne ce
where te.virement_from is not null
  and te.virement_from = ce.no_compte_ancien
  and ce.no_compte is not null;

-- 2) Verification de l'unicite de no_compte avant creation FK
do $$
declare
  duplicate_no_compte_count integer;
  unresolved_virement_count integer;
begin
  select count(*) into duplicate_no_compte_count
  from (
    select no_compte
    from public.comptes_epargne
    where no_compte is not null
    group by no_compte
    having count(*) > 1
  ) d;

  if duplicate_no_compte_count > 0 then
    raise exception 'Migration stoppee: % no_compte dupliques trouves dans comptes_epargne.', duplicate_no_compte_count;
  end if;

  select count(*) into unresolved_virement_count
  from public.transactions_epargne te
  where te.virement_from is not null
    and not exists (
      select 1
      from public.comptes_epargne ce
      where ce.no_compte = te.virement_from
    );

  if unresolved_virement_count > 0 then
    raise exception 'Migration stoppee: % transactions_epargne.virement_from ne correspondent a aucun comptes_epargne.no_compte.', unresolved_virement_count;
  end if;
end $$;

-- 3) Garantir unicite de la colonne referencee
create unique index if not exists comptes_epargne_no_compte_uidx
on public.comptes_epargne (no_compte);

-- 4) Remplacer la FK virement_from -> no_compte
alter table public.transactions_epargne
drop constraint if exists transactions_epargne_virement_from_fkey;

alter table public.transactions_epargne
add constraint transactions_epargne_virement_from_fkey
foreign key (virement_from)
references public.comptes_epargne(no_compte);
