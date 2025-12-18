import React, { useState } from 'react';
import { Personne } from '../../types';
import Input from '../common/Input';
import Select from '../common/Select';
import { db } from '../../services/database';
import { generateUserCode } from '../../services/codeGenerator';
import { useAuthStore } from '../../stores/authStore';

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

  <Input label="Prénom" name="prenom" value={formData.prenom || ''} onChange={handleChange} required />
  { client && <Input label="Code Client" name="code_client" value={formData.code_client || ''} readOnly disabled /> }
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
    </div >
  <div className="pt-4 flex justify-end space-x-2">
    <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Annuler</button>
    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Enregistrer</button>
  </div>
  </form >
);
};

export default ClientForm;