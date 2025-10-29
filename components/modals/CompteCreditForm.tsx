import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CompteCredit, CompteEpargne } from '../../types';
import { db } from '../../services/database';
import Input from '../common/Input';
import Select from '../common/Select';

interface CompteCreditFormProps {
  compte?: CompteCredit;
  onSave: () => void;
  onCancel: () => void;
}

const CompteCreditForm: React.FC<CompteCreditFormProps> = ({ compte, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<CompteCredit>>({});
  const [comptesEpargne, setComptesEpargne] = useState<CompteEpargne[]>([]);
  
  const clients = useLiveQuery(() => db.personnes.where('statut').equals('Actif').toArray(), []);

  useEffect(() => {
    if (compte) {
      setFormData(compte);
    } else {
        setFormData({
            paiement_rembourse: 0,
            fonds_garantie: 0,
            statut: 'Actif',
        });
    }
  }, [compte]);

  useEffect(() => {
    if (formData.id_personne) {
      db.comptes_epargne.where({ id_personne: formData.id_personne, statut: 'Actif' }).toArray().then(setComptesEpargne);
    } else {
      setComptesEpargne([]);
    }
  }, [formData.id_personne]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['montant_prete', 'duree_credit_mois', 'taux_interet', 'fonds_garantie', 'paiement_journalier', 'penalites'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseFloat(value) || 0 : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const MOCK_USER_ID = 'user-test-123';

    if (compte && compte.id_compte_credit) {
        await db.updateRecord('comptes_credit', compte.id_compte_credit, {
            ...formData,
            updated_by: MOCK_USER_ID
        });
    } else {
        const newCompte: Omit<CompteCredit, 'id_compte_credit'> = {
            id_personne: formData.id_personne!,
            id_compte_epargne: formData.id_compte_epargne!,
            no_compte: formData.no_compte!,
            montant_prete: formData.montant_prete!,
            duree_credit_mois: formData.duree_credit_mois!,
            taux_interet: formData.taux_interet!,
            paiement_journalier: formData.paiement_journalier!,
            paiement_rembourse: 0,
            fonds_garantie: formData.fonds_garantie || 0,
            penalites: formData.penalites || 0,
            statut: 'Actif',
            date_creation: new Date().toISOString(),
            created_at: new Date().toISOString(),
            created_by: MOCK_USER_ID,
        };
        await db.addRecord('comptes_credit', newCompte);
    }
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Client" name="id_personne" value={formData.id_personne || ''} onChange={handleChange} required disabled={!!compte} className="md:col-span-2">
                <option value="">Sélectionner un client</option>
                {clients?.map(client => (
                <option key={client.id_personne} value={client.id_personne}>
                    {`${client.prenom} ${client.nom} (${client.code_client})`}
                </option>
                ))}
            </Select>
            <Select label="Compte Épargne Associé" name="id_compte_epargne" value={formData.id_compte_epargne || ''} onChange={handleChange} required disabled={!!compte || !formData.id_personne} className="md:col-span-2">
                <option value="">Sélectionner un compte</option>
                {comptesEpargne.map(c => <option key={c.id_compte_epargne} value={c.id_compte_epargne}>{c.no_compte}</option>)}
            </Select>
            <Input label="Numéro de Compte Crédit" name="no_compte" value={formData.no_compte || ''} onChange={handleChange} required />
            <Input type="number" label="Montant Prêté" name="montant_prete" value={formData.montant_prete || ''} onChange={handleChange} required step="0.01" />
            <Input type="number" label="Durée (mois)" name="duree_credit_mois" value={formData.duree_credit_mois || ''} onChange={handleChange} required />
            <Input type="number" label="Taux d'intérêt (%)" name="taux_interet" value={formData.taux_interet || ''} onChange={handleChange} required step="0.01" />
            <Input type="number" label="Paiement Journalier" name="paiement_journalier" value={formData.paiement_journalier || ''} onChange={handleChange} required step="0.01" />
            <Input type="number" label="Fonds de Garantie" name="fonds_garantie" value={formData.fonds_garantie || ''} onChange={handleChange} step="0.01" />
            <Input type="number" label="Pénalités" name="penalites" value={formData.penalites || ''} onChange={handleChange} step="0.01" />

            <div className="md:col-span-2">
                <Select label="Statut" name="statut" value={formData.statut || 'Actif'} onChange={handleChange}>
                    <option value="Actif">Actif</option>
                    <option value="Payé">Payé</option>
                    <option value="En retard">En retard</option>
                    <option value="Fermé">Fermé</option>
                </Select>
            </div>
        </div>

      <div className="pt-4 flex justify-end space-x-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Annuler</button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Enregistrer</button>
      </div>
    </form>
  );
};

export default CompteCreditForm;