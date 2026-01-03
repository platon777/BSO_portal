import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CompteEpargne, TransactionEpargne } from '../../types';
import { db } from '../../services/database';
import Input from '../common/Input';
import Select from '../common/Select';
import { generateCustomCode } from '../../services/codeGenerator';
import SearchableSelect from '../common/SearchableSelect';
import { useAuthStore } from '../../stores/authStore';

interface CompteEpargneFormProps {
  compte?: CompteEpargne;
  onSave: () => void;
  onCancel: () => void;
}

const CompteEpargneForm: React.FC<CompteEpargneFormProps> = ({ compte, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const [formData, setFormData] = useState<Partial<CompteEpargne>>({});

  const clients = useLiveQuery(() => db.personnes.where('statut').equals('Actif').toArray(), []);

  useEffect(() => {
    if (compte) {
      setFormData(compte);
    } else {
      setFormData({
        solde_actuel: 0,
        fonds_garantie: 0,
      });
    }
  }, [compte]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['id_personne', 'solde_actuel', 'fonds_garantie', 'duree', 'id_plan'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseFloat(value) || 0 : value }));
  };

  const handleClientChange = (clientId: string | null) => {
    setFormData(prev => ({ ...prev, id_personne: clientId || undefined }));
  };

  const clientOptions = useMemo(() => {
    if (!clients) return [];
    return clients.map(client => ({
      id: client.id_personne,
      label: `${client.prenom} ${client.nom}`,
      subLabel: `Code: ${client.code_client}`,
    }));
  }, [clients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Get current user ID from profile
    const userId = profile?.user_id;
    if (!userId) {
      alert('Erreur: Utilisateur non connecté');
      return;
    }

    if (compte && compte.id_compte_epargne) {
      await db.updateRecord('comptes_epargne', compte.id_compte_epargne, {
        ...formData,
        updated_by: userId,
        updated_at: new Date().toISOString()
      });
    } else {
      if (!formData.id_personne) {
        alert("Veuillez sélectionner un client.");
        return;
      }
      const selectedClient = clients?.find(c => c.id_personne === formData.id_personne);
      if (!selectedClient) {
        alert("Client non valide sélectionné.");
        return;
      }

      const newCompte: Omit<CompteEpargne, 'id_compte_epargne'> = {
        id_personne: formData.id_personne!,
        no_compte: generateCustomCode(selectedClient.code_client),
        solde_actuel: 0, // Always start at 0, let transaction update it
        fonds_garantie: formData.fonds_garantie || 0,
        statut: 'Actif', // Default value, managed locally
        date_creation: new Date().toISOString(),
        created_by: userId,
        created_at: new Date().toISOString(),
        succursale: formData.succursale,
        duree: formData.duree,
        id_plan: formData.id_plan,
        person_allowed: formData.person_allowed,
        piece_identification_allowed: formData.piece_identification_allowed,
        nif_cin_allowed: formData.nif_cin_allowed,
        photo_allowed: formData.photo_allowed,
      };

      // 1. Create the account (initially 0 balance)
      const compteId = await db.addRecord('comptes_epargne', newCompte);

      // 2. If there is an initial balance, create a deposit transaction
      const initialBalance = formData.solde_actuel || 0;
      if (initialBalance > 0) {
        const newTransaction: Omit<TransactionEpargne, 'id_transaction_epargne'> = {
          id_compte_epargne: compteId,
          no_compte: newCompte.no_compte,
          type_transaction: 'D', // Dépôt
          montant: initialBalance,
          solde_avant_transaction: 0,
          solde_apres_transactions: initialBalance,
          date_transaction: new Date().toISOString(),
          created_by: userId,
          created_at: new Date().toISOString(),
          solde_declare: initialBalance
        };

        await db.addRecord('transactions_epargne', newTransaction);

        // 3. Update the local account balance to reflect the transaction immediately (Optimistic UI)
        await db.updateRecord('comptes_epargne', compteId, {
          solde_actuel: initialBalance,
          updated_at: new Date().toISOString()
        });
      }
    }
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <SearchableSelect
            label="Client"
            options={clientOptions}
            value={formData.id_personne || null}
            onChange={handleClientChange}
            placeholder="Rechercher par nom ou code client..."
            disabled={!!compte}
            required
          />
        </div>

        {compte && <Input label="Numéro de Compte" name="no_compte" value={formData.no_compte || ''} readOnly disabled />}
        <Input label="Succursale" name="succursale" value={formData.succursale || ''} onChange={handleChange} />
        <Input type="number" label="Durée (mois)" name="duree" value={formData.duree || ''} onChange={handleChange} />
        <Input type="number" label="ID Plan" name="id_plan" value={formData.id_plan || ''} onChange={handleChange} />
        <Input type="number" label="Solde Initial" name="solde_actuel" value={formData.solde_actuel || ''} onChange={handleChange} disabled={!!compte} step="0.01" />
        <Input type="number" label="Fonds de Garantie" name="fonds_garantie" value={formData.fonds_garantie || ''} onChange={handleChange} step="0.01" />
        <Input label="Personne Autorisée" name="person_allowed" value={formData.person_allowed || ''} onChange={handleChange} className="md:col-span-2" />

        <Select label="Pièce d'Identification Autorisée" name="piece_identification_allowed" value={formData.piece_identification_allowed || ''} onChange={handleChange}>
          <option value="">Sélectionner...</option>
          <option value="NIF">NIF</option>
          <option value="CIN">CIN</option>
          <option value="Passeport">Passeport</option>
        </Select>

        <Input label="NIF/CIN Autorisé" name="nif_cin_allowed" value={formData.nif_cin_allowed || ''} onChange={handleChange} />
      </div>

      <div className="pt-4 flex justify-end space-x-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Annuler</button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Enregistrer</button>
      </div>
    </form>
  );
};

export default CompteEpargneForm;