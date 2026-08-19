import { describe, it, expect } from 'vitest';
import { mapLocalToSupabase, mapSupabaseToLocal, getPrimaryKeyField } from '../services/schemaMapper';

describe('getPrimaryKeyField', () => {
  it('renvoie la bonne cle primaire par table', () => {
    expect(getPrimaryKeyField('transactions_epargne')).toBe('id_transaction_epargne');
    expect(getPrimaryKeyField('comptes_credit')).toBe('id_compte_credit');
    expect(getPrimaryKeyField('personnes')).toBe('id_personne');
  });
});

describe('mapLocalToSupabase — champs geres par le serveur exclus', () => {
  it('transactions_epargne: exclut soldes reels, champs de decision et champs UI volatiles (client_name, etc.)', () => {
    const out = mapLocalToSupabase('transactions_epargne', {
      id_transaction_epargne: 't1', id_compte_epargne: 'a1', type_transaction: 'D', montant: 100,
      solde_avant_transaction: 1, solde_apres_transactions: 101,
      solde_avant_transaction_declare: 1, solde_apres_transaction_declare: 101,
      validation_status: 'pending', validated_by: 'x', validated_at: 'y', validation_note: 'z',
      id_personne: 'p1', created_by: 'u0', created_at: '2026-01-01T00:00:00.000Z',
      client_name: 'Jean Dupont', client_code: 'CLI-001', _local_rolled_back: false,
    } as any, 'user1');

    // Geres par trigger / serveur / UI -> ne doivent PAS partir (évite erreur PGRST204)
    expect(out.solde_avant_transaction).toBeUndefined();
    expect(out.solde_apres_transactions).toBeUndefined();
    expect(out.validated_by).toBeUndefined();
    expect(out.validated_at).toBeUndefined();
    expect(out.validation_note).toBeUndefined();
    expect(out.id_personne).toBeUndefined();
    expect(out.client_name).toBeUndefined();
    expect(out.client_code).toBeUndefined();
    expect(out._local_rolled_back).toBeUndefined();

    // Doivent partir fidèlement
    expect(out.validation_status).toBe('pending');
    expect(out.solde_apres_transaction_declare).toBe(101);
    expect(out.created_by).toBe('user1');
  });

  it('comptes_epargne: n envoie ni statut ni solde_actuel (geres par Supabase)', () => {
    const out = mapLocalToSupabase('comptes_epargne', {
      id_compte_epargne: 'a1', id_personne: 'p1', no_compte: 'N1',
      statut: 'Actif', solde_actuel: 500, fonds_garantie: 0, created_at: '2026-01-01T00:00:00.000Z',
    } as any, 'user1');
    expect(out.statut).toBeUndefined();
    expect(out.solde_actuel).toBeUndefined();
  });
});

describe('mapSupabaseToLocal — statut credit derive', () => {
  const base = {
    id_compte_credit: 'c1', id_personne: 'p1', no_compte: 'N1', id_compte_epargne: 'a1',
    montant_prete: 1000, taux_interet: 0, paiement_journalier: 10, duree_credit_mois: 1,
    montant_final: 1000, paiement_cumule: 0, created_at: '2026-01-01T00:00:00.000Z',
  };

  it('Paye quand restant nul et capital final existe', () => {
    const out: any = mapSupabaseToLocal('comptes_credit', { ...base, montant_restant: 0 });
    expect(out.statut).toBe('Payé');
  });

  it('Actif quand il reste a payer et pas de date de fin depassee', () => {
    const out: any = mapSupabaseToLocal('comptes_credit', { ...base, montant_restant: 500 });
    expect(out.statut).toBe('Actif');
  });

  it('En retard quand date_fin depassee et restant a payer', () => {
    const out: any = mapSupabaseToLocal('comptes_credit', {
      ...base, montant_restant: 500, date_fin: '2000-01-01',
    });
    expect(out.statut).toBe('En retard');
  });

  it('Paye quand le paiement manuel solde le restant', () => {
    const out: any = mapSupabaseToLocal('comptes_credit', {
      ...base, montant_restant: 100, montant_deja_paye_manuellement: 100,
    });
    expect(out.statut).toBe('Payé');
  });
});
