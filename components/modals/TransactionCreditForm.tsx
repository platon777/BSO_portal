import React, { useState } from 'react';
import { TransactionCredit, CompteCreditEnriched } from '../../types';
import { db } from '../../services/database';
import Input from '../common/Input';
import Select from '../common/Select';
import { useAuthStore } from '../../stores/authStore';

interface TransactionCreditFormProps {
  compteCredit: CompteCreditEnriched;
  transaction?: TransactionCredit;
  onSave: () => void;
  onCancel: () => void;
}

const TransactionCreditForm: React.FC<TransactionCreditFormProps> = ({ compteCredit, transaction, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const [formData, setFormData] = useState<Partial<TransactionCredit>>(transaction || {
    id_compte_credit: compteCredit.id_compte_credit,
    no_compte: compteCredit.no_compte,
    solde_avant_transaction: (compteCredit.montant_prete - (compteCredit.paiement_rembourse + (compteCredit.montant_deja_paye_manuellement || 0))),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['montant', 'versement_declare'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseFloat(value) || 0 : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Get current user ID from profile
    const userId = profile?.user_id;
    if (!userId) {
      alert('Erreur: Utilisateur non connecté');
      return;
    }

    if (transaction && transaction.id_transaction_credit) {
      // Update existing transaction
      await db.updateRecord('transactions_credit', transaction.id_transaction_credit, {
        ...formData,
        updated_at: new Date().toISOString()
      });
    } else {
      // Create new transaction
      const newTransaction: Omit<TransactionCredit, 'id_transaction_credit'> = {
        id_compte_credit: formData.id_compte_credit!,
        no_compte: formData.no_compte!,
        solde_avant_transaction: formData.solde_avant_transaction!,
        type_transaction: formData.type_transaction!,
        montant: formData.montant!,
        date_transaction: new Date().toISOString(),
        created_by: userId,
        created_at: new Date().toISOString(),
        versement_declare: formData.versement_declare
      };

      await db.addRecord('transactions_credit', newTransaction);
    }

    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input name="client" label="Client" value={`${compteCredit.personne?.prenom} ${compteCredit.personne?.nom}`} readOnly disabled />
      <Input name="no_compte_credit" label="Compte Crédit" value={compteCredit.no_compte} readOnly disabled />

      <Select label="Type de transaction" name="type_transaction" value={formData.type_transaction || ''} onChange={handleChange} required>
        <option value="">Sélectionner le type</option>
        <option value="Paiement">Paiement</option>
        <option value="Penalite">Pénalité</option>
        <option value="Garantie">Fonds Garantie</option>
      </Select>

      <Input type="number" label="Montant" name="montant" value={formData.montant ?? ''} onChange={handleChange} required />
      <Input type="number" label="Versement Déclaré" name="versement_declare" value={formData.versement_declare ?? ''} onChange={handleChange} />

      <div className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 min-h-[44px]">Annuler</button>
        <button type="submit" className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 min-h-[44px]">Enregistrer</button>
      </div>
    </form>
  );
};

export default TransactionCreditForm;

