// Fix: Added import for Dexie and Table to resolve type errors.
import Dexie, { Table } from 'dexie';
// Fix: Corrected import path for types and removed circular dependency.
import { Personne, CompteEpargne, CompteCredit, TransactionEpargne, TransactionCredit, SyncQueueItem } from '../types';
import { fakePersonnes, fakeComptesEpargne, fakeComptesCredit, fakeTransactionsCredit, fakeTransactionsEpargne } from '../data/fakeData';

// #region Utility Functions
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getPrimaryKeyName(table: string): string {
  const map: { [key: string]: string } = {
    personnes: 'id_personne',
    comptes_epargne: 'id_compte_epargne',
    comptes_credit: 'id_compte_credit',
    transactions_credit: 'id_transaction_credit',
    transactions_epargne: 'id_transaction_epargne',
  };
  return map[table] || 'id';
}
// #endregion

type SyncableTableName = 'personnes' | 'comptes_epargne' | 'comptes_credit' | 'transactions_epargne' | 'transactions_credit';

type TableTypeMap = {
  personnes: Personne;
  comptes_epargne: CompteEpargne;
  comptes_credit: CompteCredit;
  transactions_epargne: TransactionEpargne;
  transactions_credit: TransactionCredit;
};

export class BsoDatabase extends Dexie {
  personnes!: Table<Personne, string>;
  comptes_epargne!: Table<CompteEpargne, string>;
  comptes_credit!: Table<CompteCredit, string>;
  transactions_epargne!: Table<TransactionEpargne, string>;
  transactions_credit!: Table<TransactionCredit, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('bsoDatabase_v2');
    // Mise à jour du schéma pour inclure toutes les colonnes et les index pertinents.
    this.version(3).stores({
       personnes: "id_personne,code_client, pseudo, lieu_de_travail, occupation, geocode, prenom, nom, piece_identification, email, numero_telephone, adresse, sexe, date_naissance, nif_cin, photo_identification, date_creation, statut, created_at, &unique_id, id_plan, montant, created_by,updated_by, updated_at",
       comptes_epargne: "id_compte_epargne, id_personne, no_compte, id_plan, solde_actuel, fonds_garantie, date_creation, succursale ,duree, person_allowed, piece_identification_allowed, nif_cin_allowed, photo_allowed, created_at, created_by,updated_by, updated_at",
       comptes_credit: "id_compte_credit, id_personne, no_compte, id_compte_epargne, montant_prete, taux_interet, paiement_journalier, duree_credit_mois, fonds_garantie, penalites, date_creation, created_at, created_by,updated_by, paiement_rembourse, updated_at",
       transactions_credit: "id_transaction_credit, id_compte_credit, no_compte, type_transaction, montant, solde_avant_transaction, date_transaction, montant_pret, solde_credit, created_at, created_by, versement_declare, updated_at",
       transactions_epargne: "id_transaction_epargne, id_compte_epargne, no_compte, type_transaction, montant, solde_declare, virement_from, type_frais_livret, solde_avant_transaction, date_transaction, solde_apres_transaction, created_at, created_by, updated_at",
       syncQueue: '++id, table, status, timestamp, pk'
    });
  }

  private async addToSyncQueue(table: SyncableTableName, action: 'add' | 'update' | 'delete', pk: string, data: any) {
    await this.syncQueue.add({
      table,
      action,
      pk,
      data,
      status: 'pending',
      timestamp: Date.now(),
    });
  }

  // Generic add method with UUID generation
  async add<K extends SyncableTableName>(table: K, data: Omit<TableTypeMap[K], 'id_personne' | 'id_compte_epargne' | 'id_compte_credit' | 'id_transaction_epargne' | 'id_transaction_credit'>): Promise<string> {
    const pkName = getPrimaryKeyName(table);
    // FIX: Cast via 'unknown' to handle complex generic type assertion where TypeScript
    // incorrectly infers the resulting type.
    const newRecord = {
      ...data,
      [pkName]: generateUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as TableTypeMap[K];
    
    await (this[table] as Table<TableTypeMap[K], string>).add(newRecord);
    // FIX: The primary key value is typed as a union of all possible property types.
    // Cast via 'any' to treat it as a string, which it is at runtime.
    const pk = (newRecord as any)[pkName];
    await this.addToSyncQueue(table, 'add', pk, newRecord);
    return pk;
  }

  // Generic update method
  async updateRecord<K extends SyncableTableName>(table: K, pk: string, changes: Partial<TableTypeMap[K]>): Promise<number> {
    const updatedChanges = { ...changes, updated_at: new Date().toISOString() };
    // FIX: TypeScript fails to infer that the generic 'changes' object is compatible with Dexie's 
    // 'UpdateSpec' type. Casting to 'any' is a pragmatic workaround for this complex inference issue.
    const result = await (this[table] as Table<TableTypeMap[K], string>).update(pk, updatedChanges as any);

    if (result) {
      await this.addToSyncQueue(table, 'update', pk, { ...updatedChanges, [getPrimaryKeyName(table)]: pk });
    }
    return result;
  }
  
  // #region Cascade Deletion
  async deletePersonCascade(id_personne: string) {
    // FIX: Pass tables as an array to transaction when there are too many for method overloads.
    return this.transaction('rw', [this.personnes, this.comptes_epargne, this.comptes_credit, this.transactions_epargne, this.transactions_credit, this.syncQueue], async () => {
        const comptesEpargne = await this.comptes_epargne.where({ id_personne }).toArray();
        for (const compte of comptesEpargne) {
            await this.deleteCompteEpargneCascade(compte.id_compte_epargne);
        }
        await this.personnes.delete(id_personne);
        await this.addToSyncQueue('personnes', 'delete', id_personne, { id_personne });
    });
  }
  
  async deleteCompteEpargneCascade(id_compte_epargne: string) {
    // FIX: Pass tables as an array to transaction when there are too many for method overloads.
    return this.transaction('rw', [this.comptes_epargne, this.comptes_credit, this.transactions_epargne, this.transactions_credit, this.syncQueue], async () => {
        const comptesCredit = await this.comptes_credit.where({ id_compte_epargne }).toArray();
        for (const compte of comptesCredit) {
            await this.deleteCompteCreditCascade(compte.id_compte_credit);
        }
        await this.transactions_epargne.where({ id_compte_epargne }).delete();
        // Note: Not adding each transaction deletion to sync queue for simplicity, backend should handle cascade.
        await this.comptes_epargne.delete(id_compte_epargne);
        await this.addToSyncQueue('comptes_epargne', 'delete', id_compte_epargne, { id_compte_epargne });
    });
  }

  async deleteCompteCreditCascade(id_compte_credit: string) {
    return this.transaction('rw', this.comptes_credit, this.transactions_credit, this.syncQueue, async () => {
      await this.transactions_credit.where({ id_compte_credit }).delete();
      await this.comptes_credit.delete(id_compte_credit);
      await this.addToSyncQueue('comptes_credit', 'delete', id_compte_credit, { id_compte_credit });
    });
  }
  // #endregion
}

export const db = new BsoDatabase();

export async function seedDatabase() {
  try {
      const personCount = await db.personnes.count();
      if (personCount === 0) {
        console.log("Seeding database with fake data...");
        await db.personnes.bulkAdd(fakePersonnes as Personne[]);
        await db.comptes_epargne.bulkAdd(fakeComptesEpargne as CompteEpargne[]);
        await db.comptes_credit.bulkAdd(fakeComptesCredit as CompteCredit[]);
        await db.transactions_epargne.bulkAdd(fakeTransactionsEpargne as TransactionEpargne[]);
        await db.transactions_credit.bulkAdd(fakeTransactionsCredit as TransactionCredit[]);
        console.log("Database seeded.");
      }
  } catch (error) {
      console.error("Error seeding database:", error);
      // This can happen if the schema changes and old data is incompatible.
      // In a real app, a more robust migration strategy would be needed.
      // For this demo, we can try to clear and re-seed.
      console.log("Attempting to clear and re-seed database...");
      await db.delete();
      await db.open();
      await seedDatabase(); // Recursive call, be careful in production
  }
}
