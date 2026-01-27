import React, { useState } from 'react';
import { Personne, CompteEpargne, TransactionEpargne } from '../../types';
import Input from '../common/Input';
import Select from '../common/Select';
import { db } from '../../services/database';
import { generateUserCode, generateCustomCode } from '../../services/codeGenerator';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface ClientFormProps {
  client?: Personne;
  onSave: () => void;
  onCancel: () => void;
}

const ClientForm: React.FC<ClientFormProps> = ({ client, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const [formData, setFormData] = useState<Partial<Personne>>(client || {
    sexe: 'M',
    statut: 'Actif'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['id_plan', 'montant'].includes(name);
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

    if (client && client.id_personne) {
      // Update existing client
      await db.updateRecord('personnes', client.id_personne, {
        ...formData,
        updated_by: userId,
        updated_at: new Date().toISOString()
      });
    } else {
      // Create new client
      if (!formData.nom || !formData.prenom || !formData.numero_telephone) {
        alert("Nom, prénom et téléphone sont requis.");
        return;
      }

      // Check for duplicates (NIF/CIN and Phone)
      // Ignore 'nan', null, or empty strings for NIF
      if (formData.nif_cin && formData.nif_cin.toLowerCase() !== 'nan' && formData.nif_cin.trim() !== '') {
        const existingNif = await db.personnes.where('nif_cin').equals(formData.nif_cin).first();
        if (existingNif && existingNif.id_personne !== client?.id_personne) {
          toast.error(`Un client avec ce NIF/CIN existe déjà : ${existingNif.prenom} ${existingNif.nom}`);
          return;
        }
      }

      // Check Phone (Required field)
      if (formData.numero_telephone) {
        const existingPhone = await db.personnes.where('numero_telephone').equals(formData.numero_telephone).first();
        if (existingPhone && existingPhone.id_personne !== client?.id_personne) {
          toast.error(`Un client avec ce numéro de téléphone existe déjà : ${existingPhone.prenom} ${existingPhone.nom}`);
          return;
        }
      }

      const newClientData = {
        ...formData,
        code_client: generateUserCode(formData.prenom, formData.nom),
        created_by: userId,
        date_creation: new Date().toISOString(),
        sexe: formData.sexe || 'M',
        statut: formData.statut || 'Actif',
        unique_id: crypto.randomUUID()
      } as Omit<Personne, 'id_personne'>;

      const newClientId = await db.addRecord('personnes', newClientData);

      // Create Savings Account if amount is provided
      if (formData.montant && formData.montant > 0) {
        const initialBalance = formData.montant;

        // Create the account
        const newCompte: Omit<CompteEpargne, 'id_compte_epargne'> = {
          id_personne: newClientId,
          no_compte: generateCustomCode(newClientData.code_client),
          solde_actuel: initialBalance,
          fonds_garantie: 0,
          statut: 'Actif',
          date_creation: new Date().toISOString(),
          created_by: userId,
          created_at: new Date().toISOString(),
          id_plan: formData.id_plan,
          // Inherit allowed fields from client if needed, or leave empty
        };

        const compteId = await db.addRecord('comptes_epargne', newCompte);

        // Create the deposit transaction
        const newTransaction: Omit<TransactionEpargne, 'id_transaction_epargne'> = {
          id_compte_epargne: compteId,
          no_compte: newCompte.no_compte,
          type_transaction: 'D', // Dépôt
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
      }
    }
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Nom" name="nom" value={formData.nom || ''} onChange={handleChange} required />
        <Input label="Prénom" name="prenom" value={formData.prenom || ''} onChange={handleChange} required />
        {client && <Input label="Code Client" name="code_client" value={formData.code_client || ''} readOnly disabled />}
        <Input label="Pseudo" name="pseudo" value={formData.pseudo || ''} onChange={handleChange} />
        <Select label="Pièce d'identification" name="piece_identification" value={formData.piece_identification || ''} onChange={handleChange}>
          <option value="">Sélectionner</option>
          <option value="NIF">NIF</option>
          <option value="CIN">CIN</option>
          <option value="Passeport">Passeport</option>
        </Select>
        <Input label="Numéro d'identification (NIF/CIN)" name="nif_cin" value={formData.nif_cin || ''} onChange={handleChange} />
        <Input label="Adresse" name="adresse" value={formData.adresse || ''} onChange={handleChange} />
        <Input label="Téléphone" name="numero_telephone" value={formData.numero_telephone || ''} onChange={handleChange} required />
        <Input label="Email" name="email" type="email" value={formData.email || ''} onChange={handleChange} />
        <Input label="Lieu de travail" name="lieu_de_travail" value={formData.lieu_de_travail || ''} onChange={handleChange} />
        <Input label="Occupation" name="occupation" value={formData.occupation || ''} onChange={handleChange} />
        <Input label="Geocode" name="geocode" value={formData.geocode || ''} onChange={handleChange} />
        <Input label="Photo (URL)" name="photo_identification" value={formData.photo_identification || ''} onChange={handleChange} />
        <Select label="Sexe" name="sexe" value={formData.sexe || 'M'} onChange={handleChange}>
          <option value="M">Masculin</option>
          <option value="F">Féminin</option>
        </Select>
        <Input type="date" label="Date de Naissance" name="date_naissance" value={formData.date_naissance ? formData.date_naissance.split('T')[0] : ''} onChange={handleChange} />
        <Input type="number" label="ID Plan" name="id_plan" value={formData.id_plan || ''} onChange={handleChange} />
        <Input type="number" label="Montant" name="montant" value={formData.montant || ''} onChange={handleChange} step="0.01" />
      </div>
      <div className="pt-4 flex justify-end space-x-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Annuler</button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Enregistrer</button>
      </div>
    </form>
  );
};

export default ClientForm;