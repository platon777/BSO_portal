alter table public.comptes_epargne
add column if not exists type_compte_epargne text,
add column if not exists categorie_compte_epargne text,
add column if not exists photo_personne_autorisee text;

alter table public.transactions_epargne
add column if not exists categorie_compte_epargne text,
add column if not exists virement_to text,
add column if not exists frais_auto numeric(12,2) default 0,
add column if not exists monnaie_client text,
add column if not exists remise_client numeric(12,2) default 0;

update public.transactions_epargne
set frais_auto = 0
where frais_auto is null;

update public.transactions_epargne
set remise_client = 0
where remise_client is null;

alter table public.comptes_credit
add column if not exists date_debut timestamp without time zone,
add column if not exists date_fin timestamp without time zone;
