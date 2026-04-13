import React, { useState } from 'react';
import { TransactionCredit, CompteCreditEnriched } from '../../types';
import { db } from '../../services/database';
import Input from '../common/Input';
import Select from '../common/Select';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import { getCreditMontantRestant } from '../../utils/creditCalculations';

interface TransactionCreditFormProps {
  compteCredit: CompteCreditEnriched;
  transaction?: TransactionCredit;
  onSave: () => void;
  onCancel: () => void;
}

const parseNumber = (value: string): number => {
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getNowHaitiISO = (): string => {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Port-au-Prince' }).replace(' ', 'T') + '.000Z';
};

const TransactionCreditForm: React.FC<TransactionCreditFormProps> = ({ compteCredit, transaction, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const [formData, setFormData] = useState<Partial<TransactionCredit>>(transaction || {
    id_compte_credit: compteCredit.id_compte_credit,
    no_compte: compteCredit.no_compte,
    solde_avant_transaction: getCreditMontantRestant(compteCredit),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['montant', 'versement_declare'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseNumber(value) : value }));
  };

  const validateBeforeSubmit = () => {
    if (!formData.type_transaction) {
      toast.error('Type de transaction est obligatoire.');
      return false;
    }

    if (!formData.montant || Number(formData.montant) <= 0) {
      toast.error('Montant doit etre superieur a zero.');
      return false;
    }

    if (formData.type_transaction === 'Paiement' && (formData.versement_declare === undefined || formData.versement_declare === null)) {
      toast.error('Versement declare est obligatoire pour Paiement.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const userId = profile?.user_id;
    if (!userId) {
      toast.error('Erreur: utilisateur non connecte');
      return;
    }

    if (!validateBeforeSubmit()) {
      return;
    }

    if (transaction && transaction.id_transaction_credit) {
      await db.updateRecord('transactions_credit', transaction.id_transaction_credit, {
        ...formData,
        updated_at: getNowHaitiISO()
      });
    } else {
      const nowIso = getNowHaitiISO();
      const newTransaction: Omit<TransactionCredit, 'id_transaction_credit'> = {
        id_compte_credit: formData.id_compte_credit!,
        no_compte: formData.no_compte!,
        solde_avant_transaction: formData.solde_avant_transaction!,
        type_transaction: formData.type_transaction!,
        montant: formData.montant!,
        date_transaction: nowIso,
        created_by: userId,
        created_at: nowIso,
        versement_declare: formData.versement_declare
      };

      await db.addRecord('transactions_credit', newTransaction);
    }

    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input name="client" label="Client" value={`${compteCredit.personne?.prenom} ${compteCredit.personne?.nom}`} readOnly disabled />
      <Input name="no_compte_credit" label="Compte Credit" value={compteCredit.no_compte} readOnly disabled />
      {compteCredit.ancien_code && (
        <Input name="ancien_code" label="Ancien Compte Credit" value={compteCredit.ancien_code} readOnly disabled />
      )}

      <Select label="Type de transaction" name="type_transaction" value={formData.type_transaction || ''} onChange={handleChange} required>
        <option value="">Selectionner le type</option>
        <option value="Paiement">Paiement</option>
        <option value="Penalite">Penalite</option>
      </Select>

      <Input type="number" label="Montant" name="montant" value={formData.montant ?? ''} onChange={handleChange} required step="0.01" />
      <Input type="number" label="Versement Declare" name="versement_declare" value={formData.versement_declare ?? ''} onChange={handleChange} step="0.01" required={formData.type_transaction === 'Paiement'} />

      <div className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 min-h-[44px]">Annuler</button>
        <button type="submit" className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 min-h-[44px]">Enregistrer</button>
      </div>
    </form>
  );
};

export default TransactionCreditForm;
