import Dexie, { Table } from 'dexie';
import { Personne, CompteEpargne, CompteCredit, TransactionEpargne, TransactionCredit, SyncQueueItem } from '../types';

// Simple UUID generator
const generateUUID = () => {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export class MySubClassedDexie extends Dexie {
  personnes!: Table<Personne, string>;
  comptes_epargne!: Table<CompteEpargne, string>;
  comptes_credit!: Table<CompteCredit, string>;
  transactions_epargne!: Table<TransactionEpargne, string>;
  transactions_credit!: Table<TransactionCredit, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('bsoPortalDB');
    // Complete schema with all indexed fields for optimal querying
    // Version 3: Added comprehensive indexes for all key fields
    this.version(3).stores({
      personnes: 'id_personne, code_client, pseudo, lieu_de_travail, occupation, geocode, prenom, nom, piece_identification, email, numero_telephone, adresse, sexe, date_naissance, nif_cin, photo_identification, date_creation, statut, created_at, &unique_id, id_plan, montant, created_by, updated_by, updated_at',
      comptes_epargne: 'id_compte_epargne, id_personne, no_compte, id_plan, solde_actuel, fonds_garantie, statut, date_creation, succursale, duree, person_allowed, piece_identification_allowed, nif_cin_allowed, photo_allowed, created_at, created_by, updated_by, updated_at',
      comptes_credit: 'id_compte_credit, id_personne, no_compte, id_compte_epargne, montant_prete, taux_interet, paiement_journalier, duree_credit_mois, fonds_garantie, penalites, statut, date_creation, created_at, created_by, updated_by, paiement_rembourse, updated_at',
      transactions_epargne: 'id_transaction_epargne, id_compte_epargne, no_compte, type_transaction, montant, solde_declare, virement_from, type_frais_livret, solde_avant_transaction, solde_avant_transaction_declare, date_transaction, solde_apres_transactions, solde_apres_transaction_declare, created_at, created_by, updated_at',
      transactions_credit: 'id_transaction_credit, id_compte_credit, no_compte, type_transaction, montant, solde_avant_transaction, date_transaction, montant_pret, solde_credit, created_at, created_by, versement_declare, updated_at',
      syncQueue: '++id, table, pk, status, timestamp',
    });

    // Version 4: Add retry_count and updated_at to syncQueue
    this.version(4).stores({
      syncQueue: '++id, table, pk, status, timestamp, retry_count',
    }).upgrade(tx => {
      // Add retry_count field to existing syncQueue items
      return tx.table('syncQueue').toCollection().modify(item => {
        if (item.retry_count === undefined) {
          item.retry_count = 0;
        }
        if (item.updated_at === undefined) {
          item.updated_at = item.timestamp;
        }
      });
    });
  }

  private async addToSyncQueue(action: 'add' | 'update' | 'delete', table: SyncQueueItem['table'], pk: string, data: any) {
    const item: SyncQueueItem = {
      table,
      action,
      pk,
      data,
      status: 'pending',
      timestamp: Date.now(),
      retry_count: 0,
      updated_at: Date.now(),
    };
    await this.syncQueue.add(item);
  }

  async addRecord(
    tableName: 'personnes' | 'comptes_epargne' | 'comptes_credit' | 'transactions_epargne' | 'transactions_credit',
    data: object
  ) {
    const table = this.table(tableName);
    const pkName = table.schema.primKey.name;
    const pk = generateUUID();
    const dataWithPk = { ...data, [pkName]: pk };

    await this.transaction('rw', table, this.syncQueue, async () => {
      await table.add(dataWithPk);
      await this.addToSyncQueue('add', tableName, pk, dataWithPk);
    });
    return pk;
  }

  async updateRecord<T>(
    tableName: 'personnes' | 'comptes_epargne' | 'comptes_credit' | 'transactions_epargne' | 'transactions_credit',
    pk: string,
    changes: Partial<T>
  ) {
    const table = this.table(tableName);
    await this.transaction('rw', table, this.syncQueue, async () => {
      await table.update(pk, changes as any);
      await this.addToSyncQueue('update', tableName, pk, changes);
    });
  }

  async deletePersonCascade(personId: string) {
    return this.transaction('rw', [this.personnes, this.comptes_epargne, this.comptes_credit, this.transactions_epargne, this.transactions_credit, this.syncQueue], async () => {
      const comptesEpargne = await this.comptes_epargne.where('id_personne').equals(personId).toArray();
      for (const compte of comptesEpargne) {
        await this.deleteCompteEpargneCascade(compte.id_compte_epargne);
      }
      await this.personnes.delete(personId);
      await this.addToSyncQueue('delete', 'personnes', personId, { id_personne: personId });
    });
  }

  async deleteCompteEpargneCascade(compteEpargneId: string) {
    return this.transaction('rw', [this.comptes_epargne, this.comptes_credit, this.transactions_epargne, this.transactions_credit, this.syncQueue], async () => {
      const comptesCredit = await this.comptes_credit.where('id_compte_epargne').equals(compteEpargneId).toArray();
      for (const compte of comptesCredit) {
        await this.deleteCompteCreditCascade(compte.id_compte_credit);
      }
      await this.transactions_epargne.where('id_compte_epargne').equals(compteEpargneId).delete();
      await this.comptes_epargne.delete(compteEpargneId);
      await this.addToSyncQueue('delete', 'comptes_epargne', compteEpargneId, { id_compte_epargne: compteEpargneId });
    });
  }

  async deleteCompteCreditCascade(compteCreditId: string) {
    return this.transaction('rw', [this.comptes_credit, this.transactions_credit, this.syncQueue], async () => {
      await this.transactions_credit.where('id_compte_credit').equals(compteCreditId).delete();
      await this.comptes_credit.delete(compteCreditId);
      await this.addToSyncQueue('delete', 'comptes_credit', compteCreditId, { id_compte_credit: compteCreditId });
    });
  }
}

export const db = new MySubClassedDexie();

// NOTE: Fonction de seed désactivée - Les données proviennent maintenant de Supabase via synchronisation
export async function seedDatabase() {
  console.log("Seed database disabled - Data will be synced from Supabase");
}
