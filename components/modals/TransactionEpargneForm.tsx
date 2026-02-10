import React, { useState } from 'react';
import { TransactionEpargne, CompteEpargneAvecPersonne } from '../../types';
import { db } from '../../services/database';
import Input from '../common/Input';
import Select from '../common/Select';
import { useAuthStore } from '../../stores/authStore';

interface TransactionEpargneFormProps {
  compteEpargne: CompteEpargneAvecPersonne;
  transaction?: TransactionEpargne;
  onSave: () => void;
  onCancel: () => void;
}

const TransactionEpargneForm: React.FC<TransactionEpargneFormProps> = ({ compteEpargne, transaction, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const [formData, setFormData] = useState<Partial<TransactionEpargne>>(transaction || {
    id_compte_epargne: compteEpargne.id_compte_epargne,
    no_compte: compteEpargne.no_compte,
    solde_avant_transaction: compteEpargne.solde_actuel,
    solde_avant_transaction_declare: compteEpargne.solde_actuel,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['montant', 'solde_declare', 'solde_avant_transaction_declare', 'solde_apres_transaction_declare'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseFloat(value) || 0 : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const userId = profile?.user_id;
    if (!userId) {
      alert('Erreur: Utilisateur non connecte');
      return;
    }

    let solde_apres_transactions = formData.solde_avant_transaction || 0;
    const montant = formData.montant || 0;

    if (formData.type_transaction === 'D') {
      solde_apres_transactions += montant;
    } else if (formData.type_transaction === 'R') {
      solde_apres_transactions -= montant;
      if (solde_apres_transactions < 0) {
        alert(`Solde insuffisant pour ce retrait. Solde disponible: ${formData.solde_avant_transaction || 0}`);
        return;
      }
    } else if (formData.type_transaction === 'FL' || formData.type_transaction === 'S') {
      solde_apres_transactions -= montant;
      if (solde_apres_transactions < 0) {
        alert(`Solde insuffisant pour ces frais. Solde disponible: ${formData.solde_avant_transaction || 0}`);
        return;
      }
    }

    if (transaction && transaction.id_transaction_epargne) {
      await db.updateRecord('transactions_epargne', transaction.id_transaction_epargne, {
        ...formData,
        solde_apres_transactions,
        updated_at: new Date().toISOString()
      });
    } else {
      const newTransaction: Omit<TransactionEpargne, 'id_transaction_epargne'> = {
        id_compte_epargne: formData.id_compte_epargne!,
        no_compte: formData.no_compte!,
        type_transaction: formData.type_transaction!,
        montant: formData.montant!,
        solde_avant_transaction: formData.solde_avant_transaction!,
        solde_avant_transaction_declare: formData.solde_avant_transaction_declare!,
        solde_apres_transaction_declare: formData.solde_apres_transaction_declare!,
        date_transaction: new Date().toISOString(),
        created_by: userId,
        created_at: new Date().toISOString(),
        solde_apres_transactions
      };

      await db.addRecord('transactions_epargne', newTransaction);

      await db.updateRecord('comptes_epargne', formData.id_compte_epargne!, {
        solde_actuel: solde_apres_transactions,
        updated_at: new Date().toISOString()
      });
    }

    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input name="client" label="Client" value={`${compteEpargne.personne?.prenom} ${compteEpargne.personne?.nom}`} readOnly disabled />
      <Input name="no_compte_epargne" label="Compte Epargne" value={compteEpargne.no_compte} readOnly disabled />

      <Select label="Type de transaction" name="type_transaction" value={formData.type_transaction || ''} onChange={handleChange} required>
        <option value="">Selectionner le type</option>
        <option value="D">Depot</option>
        <option value="R">Retrait</option>
        <option value="FL">Frais Livret</option>
        <option value="S">Frais service</option>
      </Select>

      <Input type="number" label="Montant" name="montant" value={formData.montant ?? ''} onChange={handleChange} required />

      <div className="grid grid-cols-2 gap-4">
        <Input type="number" label="Solde Avant Declare" name="solde_avant_transaction_declare" value={formData.solde_avant_transaction_declare ?? ''} onChange={handleChange} required />
        <Input type="number" label="Solde Apres Declare" name="solde_apres_transaction_declare" value={formData.solde_apres_transaction_declare ?? ''} onChange={handleChange} required />
      </div>

      <div className="pt-4 flex justify-end space-x-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Annuler</button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Enregistrer</button>
      </div>
    </form>
  );
};

export default TransactionEpargneForm;