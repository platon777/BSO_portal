import Dexie, { Table } from 'dexie';
import { Personne, CompteEpargne, CompteCredit, TransactionEpargne, TransactionCredit, SyncQueueItem } from '../types';
import { FAKE_PERSONNES, FAKE_COMPTES_EPARGNE, FAKE_COMPTES_CREDIT, FAKE_TRANSACTIONS_EPARGNE, FAKE_TRANSACTIONS_CREDIT } from '../data/fakeData';

// Simple UUID generator
const generateUUID = () => {
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
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
    // FIX: Upgraded schema version and included all relevant fields and indexes.
    // This is the primary fix for the loading errors.
    this.version(2).stores({
      personnes: 'id_personne, code_client, nom, prenom, nif_cin, numero_telephone, statut, created_by, &unique_id',
      comptes_epargne: 'id_compte_epargne, id_personne, no_compte, statut, created_by',
      comptes_credit: 'id_compte_credit, id_personne, no_compte, id_compte_epargne, statut, created_by',
      transactions_epargne: 'id_transaction_epargne, id_compte_epargne, date_transaction, type_transaction, created_by',
      transactions_credit: 'id_transaction_credit, id_compte_credit, date_transaction, type_transaction, created_by',
      syncQueue: '++id, table, pk, status, timestamp',
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
    };
    await this.syncQueue.add(item);
  }

  // FIX: Renamed from 'add' and corrected the type signature to be less complex and more reliable.
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
        // FIX: Casting to 'any' to avoid complex Dexie TypeScript inference issues that can be fragile.
        await table.update(pk, changes as any);
        await this.addToSyncQueue('update', tableName, pk, changes);
    });
  }

  async deletePersonCascade(personId: string) {
    // FIX: Grouped tables into an array for the transaction, as Dexie's transaction method has a limit on the number of arguments.
    return this.transaction('rw', [this.personnes, this.comptes_epargne, this.comptes_credit, this.transactions_epargne, this.transactions_credit], async () => {
      const comptesEpargne = await this.comptes_epargne.where('id_personne').equals(personId).toArray();
      for (const compte of comptesEpargne) {
        await this.deleteCompteEpargneCascade(compte.id_compte_epargne);
      }
      await this.personnes.delete(personId);
      // NOTE: Cascade deletes for sync queue not implemented for simplicity.
    });
  }

  async deleteCompteEpargneCascade(compteEpargneId: string) {
    // FIX: Grouped tables into an array for consistency and to avoid hitting argument limits in Dexie's transaction method.
    return this.transaction('rw', [this.comptes_epargne, this.comptes_credit, this.transactions_epargne, this.transactions_credit], async () => {
      const comptesCredit = await this.comptes_credit.where('id_compte_epargne').equals(compteEpargneId).toArray();
      for (const compte of comptesCredit) {
        await this.deleteCompteCreditCascade(compte.id_compte_credit);
      }
      await this.transactions_epargne.where('id_compte_epargne').equals(compteEpargneId).delete();
      await this.comptes_epargne.delete(compteEpargneId);
    });
  }

  async deleteCompteCreditCascade(compteCreditId: string) {
    return this.transaction('rw', this.comptes_credit, this.transactions_credit, async () => {
      await this.transactions_credit.where('id_compte_credit').equals(compteCreditId).delete();
      await this.comptes_credit.delete(compteCreditId);
    });
  }
}

export const db = new MySubClassedDexie();

export async function seedDatabase() {
  try {
    const personCount = await db.personnes.count();
    if (personCount === 0) {
      console.log("Database is empty, seeding with fake data...");
      await db.transaction('rw', db.tables, async () => {
        await db.personnes.bulkAdd(FAKE_PERSONNES);
        await db.comptes_epargne.bulkAdd(FAKE_COMPTES_EPARGNE);
        await db.comptes_credit.bulkAdd(FAKE_COMPTES_CREDIT);
        await db.transactions_epargne.bulkAdd(FAKE_TRANSACTIONS_EPARGNE);
        await db.transactions_credit.bulkAdd(FAKE_TRANSACTIONS_CREDIT);
      });
      console.log("Seeding complete.");
    } else {
      console.log("Database already contains data, skipping seed.");
    }
  } catch (error) {
    console.error("Error seeding database:", error);
    // In case of error (e.g., schema mismatch during development),
    // try to clear and re-seed.
    console.log("Attempting to clear and re-seed database...");
    try {
      db.close();
      await Dexie.delete(db.name);
      const newDb = new MySubClassedDexie();
      await newDb.open();
      const personCount = await newDb.personnes.count();
       if (personCount === 0) {
          console.log("Seeding database with fake data...");
          await newDb.transaction('rw', newDb.tables, async () => {
              await newDb.personnes.bulkAdd(FAKE_PERSONNES);
              await newDb.comptes_epargne.bulkAdd(FAKE_COMPTES_EPARGNE);
              await newDb.comptes_credit.bulkAdd(FAKE_COMPTES_CREDIT);
              await newDb.transactions_epargne.bulkAdd(FAKE_TRANSACTIONS_EPARGNE);
              await newDb.transactions_credit.bulkAdd(FAKE_TRANSACTIONS_CREDIT);
          });
          console.log("Re-seeding complete.");
          window.location.reload(); // Reload to use the new DB instance
       }
    } catch (clearError) {
        console.error("Failed to clear and re-seed database:", clearError);
    }
  }
}