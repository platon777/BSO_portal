import { SyncQueueItem } from '../types';
import { CREDIT_ACCOUNT_TYPE_VALUES } from '../utils/creditTypes';

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

  if (!item.table) {
    errors.push('Table name is required');
  }

  if (!item.action) {
    errors.push('Action is required');
  }

  if (!item.pk) {
    errors.push('Primary key is required');
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (item.pk && !uuidRegex.test(item.pk)) {
    errors.push(`Invalid UUID format for primary key: ${item.pk}`);
  }

  if ((item.action === 'add' || item.action === 'update') && !item.data) {
    errors.push('Data is required for add/update operations');
  }

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
  if (action !== 'add') return;

  if (!data.prenom) errors.push('Prenom is required');
  if (!data.nom) errors.push('Nom is required');
  if (!data.numero_telephone) errors.push('Numero telephone is required');
  if (!data.adresse) errors.push('Adresse is required');
  if (!data.lieu_de_travail) errors.push('Lieu de travail is required');
  if (!data.secteur && !data.occupation) errors.push('Secteur is required');
  if (!data.activite && !data.occupation) errors.push('Activite is required');
  if (!data.photo_identification) errors.push('Photo identification is required');
  if (!data.sexe || !['M', 'F'].includes(data.sexe)) {
    errors.push('Sexe must be M or F');
  }
};

const validateCompteEpargne = (data: any, errors: string[], action: string) => {
  if (action === 'add') {
    if (!data.id_personne) errors.push('ID personne is required');
    if (!data.no_compte) errors.push('Numero compte is required');
    if (!data.no_compte_ancien) errors.push('Numero compte ancien is required');
    if (!data.succursale) errors.push('Succursale is required');
    if (!data.id_plan) errors.push('Plan is required');
    if (!data.type_compte_epargne) errors.push('Type compte epargne is required');
  }

  if (data.solde_actuel !== undefined && Number(data.solde_actuel) < 0) {
    errors.push('Solde cannot be negative');
  }
};

const validateCompteCredit = (data: any, errors: string[], action: string) => {
  if (action === 'add') {
    if (!data.id_personne) errors.push('ID personne is required');
    if (!data.id_compte_epargne) errors.push('ID compte epargne is required');
    if (!data.no_compte) errors.push('Numero compte is required');
    if (!data.ancien_code) errors.push('Code credit ancien is required');
    if (!data.type_compte_credit) errors.push('Type compte credit is required');
    if (data.type_compte_credit && !CREDIT_ACCOUNT_TYPE_VALUES.includes(data.type_compte_credit)) {
      errors.push('Invalid type compte credit');
    }
    if (!data.montant_prete || Number(data.montant_prete) <= 0) {
      errors.push('Montant prete must be greater than 0');
    }
    if (!data.duree_credit_mois || Number(data.duree_credit_mois) <= 0) {
      errors.push('Duree credit must be greater than 0');
    }
    if (data.taux_interet === undefined || data.taux_interet === null || data.taux_interet === '') {
      errors.push('Taux interet is required');
    }
    if (!data.paiement_journalier || Number(data.paiement_journalier) <= 0) {
      errors.push('Paiement journalier must be greater than 0');
    }
    if (data.penalites === undefined || data.penalites === null || data.penalites === '') {
      errors.push('Penalites is required');
    }
  }

  if (data.montant_deja_paye_manuellement !== undefined && Number(data.montant_deja_paye_manuellement) < 0) {
    errors.push('Montant deja paye manuellement cannot be negative');
  }
};

const validateTransactionEpargne = (data: any, errors: string[], action: string) => {
  if (action !== 'add') return;

  if (!data.id_compte_epargne) errors.push('ID compte epargne is required');
  if (!data.montant || Number(data.montant) <= 0) {
    errors.push('Montant must be greater than 0');
  }
  if (!['D', 'R', 'FL', 'S', 'V', 'FA'].includes(data.type_transaction)) {
    errors.push('Invalid transaction type');
  }
  if (data.type_transaction === 'V') {
    if (!data.virement_from) errors.push('Virement requires virement_from');
    if (!data.virement_to) errors.push('Virement requires virement_to');
  }
};

const validateTransactionCredit = (data: any, errors: string[], action: string) => {
  if (action !== 'add') return;

  if (!data.id_compte_credit) errors.push('ID compte credit is required');
  if (!data.montant || Number(data.montant) <= 0) {
    errors.push('Montant must be greater than 0');
  }
  if (!['Paiement', 'Penalite', 'Garantie'].includes(data.type_transaction)) {
    errors.push('Invalid transaction type');
  }
  if (data.type_transaction === 'Paiement' && (data.versement_declare === undefined || data.versement_declare === null || data.versement_declare === '')) {
    errors.push('Versement declare is required for Paiement');
  }
};
