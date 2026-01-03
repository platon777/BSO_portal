import { SyncQueueItem } from '../types';

/**
 * Data validator for sync items
 * Ensures data integrity before uploading to Supabase
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const validateSyncItem = (item: SyncQueueItem): ValidationResult => {
  const errors: string[] = [];

  // Validate basic fields
  if (!item.table) {
    errors.push('Table name is required');
  }

  if (!item.action) {
    errors.push('Action is required');
  }

  if (!item.pk) {
    errors.push('Primary key is required');
  }

  // Validate UUID format for primary key
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (item.pk && !uuidRegex.test(item.pk)) {
    errors.push(`Invalid UUID format for primary key: ${item.pk}`);
  }

  // Validate data exists for add/update operations
  if ((item.action === 'add' || item.action === 'update') && !item.data) {
    errors.push('Data is required for add/update operations');
  }

  // Table-specific validation
  if (item.data) {
    switch (item.table) {
      case 'personnes':
        validatePersonne(item.data, errors, item.action);
        break;
      case 'comptes_epargne':
        validateCompteEpargne(item.data, errors, item.action);
        break;
      case 'comptes_credit':
        validateCompteCredit(item.data, errors, item.action);
        break;
      case 'transactions_epargne':
        validateTransactionEpargne(item.data, errors, item.action);
        break;
      case 'transactions_credit':
        validateTransactionCredit(item.data, errors, item.action);
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const validatePersonne = (data: any, errors: string[], action: string) => {
  if (action === 'add') {
    if (!data.prenom) errors.push('Prénom is required');
    if (!data.nom) errors.push('Nom is required');
    if (!data.numero_telephone) errors.push('Numéro de téléphone is required');
    if (!data.sexe || !['M', 'F'].includes(data.sexe)) {
      errors.push('Sexe must be M or F');
    }
  }
};

const validateCompteEpargne = (data: any, errors: string[], action: string) => {
  if (action === 'add') {
    if (!data.id_personne) errors.push('ID personne is required');
    if (!data.no_compte) errors.push('Numéro de compte is required');
  }
  if (data.solde_actuel !== undefined && data.solde_actuel < 0) {
    errors.push('Solde cannot be negative');
  }
};

const validateCompteCredit = (data: any, errors: string[], action: string) => {
  if (action === 'add') {
    if (!data.id_personne) errors.push('ID personne is required');
    if (!data.id_compte_epargne) errors.push('ID compte épargne is required');
    if (!data.no_compte) errors.push('Numéro de compte is required');
    if (!data.montant_prete || data.montant_prete <= 0) {
      errors.push('Montant prêté must be greater than 0');
    }
    if (!data.paiement_journalier || data.paiement_journalier <= 0) {
      errors.push('Paiement journalier must be greater than 0');
    }
  }
};

const validateTransactionEpargne = (data: any, errors: string[], action: string) => {
  if (action === 'add') {
    if (!data.id_compte_epargne) errors.push('ID compte épargne is required');
    if (!data.montant || data.montant <= 0) {
      errors.push('Montant must be greater than 0');
    }
    if (!['D', 'R', 'FL', 'S'].includes(data.type_transaction)) {
      errors.push('Invalid transaction type');
    }
  }
};

const validateTransactionCredit = (data: any, errors: string[], action: string) => {
  if (action === 'add') {
    if (!data.id_compte_credit) errors.push('ID compte crédit is required');
    if (!data.montant || data.montant <= 0) {
      errors.push('Montant must be greater than 0');
    }
    if (!['Paiement', 'Penalite', 'Garantie'].includes(data.type_transaction)) {
      errors.push('Invalid transaction type');
    }
  }
};
