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

  const clients = useLiveQuery(() => db.personnes.toArray(), []);

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

    const userId = profile?.user_id;
    if (!userId) {
      alert('Erreur: Utilisateur non connecte');
      return;
    }

    if (formData.no_compte_ancien && formData.no_compte_ancien.trim() !== '') {
      const existingLegacyAccount = await db.comptes_epargne.where('no_compte_ancien').equals(formData.no_compte_ancien).first();
      if (existingLegacyAccount && existingLegacyAccount.id_compte_epargne !== compte?.id_compte_epargne) {
        alert('Ce numero de compte ancien existe deja.');
        return;
      }
    }

    if (compte && compte.id_compte_epargne) {
      await db.updateRecord('comptes_epargne', compte.id_compte_epargne, {
        ...formData,
        updated_by: userId,
        updated_at: new Date().toISOString()
      });
    } else {
      if (!formData.id_personne) {
        alert('Veuillez selectionner un client.');
        return;
      }

      const selectedClient = clients?.find(c => c.id_personne === formData.id_personne);
      if (!selectedClient) {
        alert('Client non valide selectionne.');
        return;
      }

      const newCompte: Omit<CompteEpargne, 'id_compte_epargne'> = {
        id_personne: formData.id_personne!,
        no_compte: generateCustomCode(selectedClient.code_client),
        no_compte_ancien: formData.no_compte_ancien,
        solde_actuel: 0,
        fonds_garantie: formData.fonds_garantie || 0,
        statut: 'Actif',
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

      const compteId = await db.addRecord('comptes_epargne', newCompte);

      const initialBalance = formData.solde_actuel ?? 0;
      if (initialBalance > 0) {
        const newTransaction: Omit<TransactionEpargne, 'id_transaction_epargne'> = {
          id_compte_epargne: compteId,
          no_compte: newCompte.no_compte,
          type_transaction: 'D',
          montant: initialBalance,
          solde_avant_transaction: 0,
          solde_avant_transaction_declare: 0,
          solde_apres_transaction_declare: initialBalance,
          solde_apres_transactions: initialBalance,
          date_transaction: new Date().toISOString(),
          created_by: userId,
          created_at: new Date().toISOString(),
          solde_declare: initialBalance
        };

        await db.addRecord('transactions_epargne', newTransaction);

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

        {compte && <Input label="Numero de Compte" name="no_compte" value={formData.no_compte || ''} readOnly disabled />}
        <Input label="Numero de Compte Ancien" name="no_compte_ancien" value={formData.no_compte_ancien || ''} onChange={handleChange} />
        <Input label="Succursale" name="succursale" value={formData.succursale || ''} onChange={handleChange} />
        <Input type="number" label="Duree (mois)" name="duree" value={formData.duree || ''} onChange={handleChange} />
        <Input type="number" label="ID Plan" name="id_plan" value={formData.id_plan || ''} onChange={handleChange} />
        <Input type="number" label="Solde Initial" name="solde_actuel" value={formData.solde_actuel ?? ''} onChange={handleChange} disabled={!!compte} step="0.01" />
        <Input type="number" label="Fonds de Garantie" name="fonds_garantie" value={formData.fonds_garantie || ''} onChange={handleChange} step="0.01" />
        <Input label="Personne Autorisee" name="person_allowed" value={formData.person_allowed || ''} onChange={handleChange} className="md:col-span-2" />

        <Select label="Piece d'Identification Autorisee" name="piece_identification_allowed" value={formData.piece_identification_allowed || ''} onChange={handleChange}>
          <option value="">Selectionner...</option>
          <option value="NIF">NIF</option>
          <option value="CIN">CIN</option>
          <option value="Passeport">Passeport</option>
        </Select>

        <Input label="NIF/CIN Autorise" name="nif_cin_allowed" value={formData.nif_cin_allowed || ''} onChange={handleChange} />
      </div>

      <div className="pt-4 flex justify-end space-x-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Annuler</button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Enregistrer</button>
      </div>
    </form>
  );
};

export default CompteEpargneForm;
