import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CompteCredit, CompteEpargne } from '../../types';
import { db } from '../../services/database';
import Input from '../common/Input';
import Select from '../common/Select';
import { generateCustomCode } from '../../services/codeGenerator';
import SearchableSelect from '../common/SearchableSelect';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface CompteCreditFormProps {
  compte?: CompteCredit;
  onSave: () => void;
  onCancel: () => void;
}

const parseNumber = (value: string): number => {
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateInput = (value?: string): string => {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : value;
};

const CompteCreditForm: React.FC<CompteCreditFormProps> = ({ compte, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const [formData, setFormData] = useState<Partial<CompteCredit>>({});
  const [comptesEpargne, setComptesEpargne] = useState<CompteEpargne[]>([]);

  const clients = useLiveQuery(() => db.personnes.toArray(), []);

  useEffect(() => {
    if (compte) {
      setFormData(compte);
    } else {
      const nowIso = new Date().toISOString();
      setFormData({
        paiement_rembourse: 0,
        montant_deja_paye_manuellement: 0,
        fonds_garantie: 0,
        penalites: 0,
        statut: 'Actif',
        date_debut: nowIso,
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
    const isNumber = ['montant_prete', 'duree_credit_mois', 'taux_interet', 'fonds_garantie', 'paiement_journalier', 'penalites', 'montant_deja_paye_manuellement'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseNumber(value) : value }));
  };

  const handleClientChange = (clientId: string | null) => {
    setFormData(prev => ({ ...prev, id_personne: clientId || undefined, id_compte_epargne: undefined }));
  };

  const clientOptions = useMemo(() => {
    if (!clients) return [];
    return clients.map(client => ({
      id: client.id_personne,
      label: `${client.prenom} ${client.nom}`,
      subLabel: `Code: ${client.code_client}`,
    }));
  }, [clients]);

  const validateRequired = () => {
    if (!formData.id_personne || !formData.id_compte_epargne) {
      toast.error('Veuillez selectionner un client et un compte epargne associe.');
      return false;
    }
    if (!String(formData.ancien_code || '').trim()) {
      toast.error('Code credit ancien est obligatoire.');
      return false;
    }

    const requiredNumberFields: Array<{ key: keyof CompteCredit; label: string; gtZero?: boolean }> = [
      { key: 'montant_prete', label: 'Montant prete', gtZero: true },
      { key: 'duree_credit_mois', label: 'Duree (mois)', gtZero: true },
      { key: 'taux_interet', label: 'Taux interet' },
      { key: 'paiement_journalier', label: 'Paiement journalier', gtZero: true },
      { key: 'fonds_garantie', label: 'Fonds garantie' },
      { key: 'penalites', label: 'Penalites' },
    ];

    for (const field of requiredNumberFields) {
      const value = Number(formData[field.key] ?? NaN);
      if (!Number.isFinite(value)) {
        toast.error(`${field.label} est obligatoire.`);
        return false;
      }
      if (field.gtZero && value <= 0) {
        toast.error(`${field.label} doit etre superieur a zero.`);
        return false;
      }
    }

    if (!formData.date_debut) {
      toast.error('Date debut est obligatoire.');
      return false;
    }

    if (!formData.date_fin) {
      toast.error('Date fin est obligatoire.');
      return false;
    }

    if (new Date(formData.date_fin).getTime() < new Date(formData.date_debut).getTime()) {
      toast.error('Date fin doit etre superieure ou egale a date debut.');
      return false;
    }

    if ((formData.montant_deja_paye_manuellement ?? 0) < 0) {
      toast.error('Montant deja paye manuellement ne peut pas etre negatif.');
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

    if (!validateRequired()) {
      return;
    }

    if (formData.ancien_code && formData.ancien_code.trim() !== '') {
      const existingLegacyCode = await db.comptes_credit.where('ancien_code').equals(formData.ancien_code).first();
      if (existingLegacyCode && existingLegacyCode.id_compte_credit !== compte?.id_compte_credit) {
        toast.error('Ce code credit ancien existe deja.');
        return;
      }
    }

    if (compte && compte.id_compte_credit) {
      await db.updateRecord('comptes_credit', compte.id_compte_credit, {
        ...formData,
        updated_by: userId,
        updated_at: new Date().toISOString()
      });
    } else {
      const selectedCompteEpargne = comptesEpargne.find(c => c.id_compte_epargne === formData.id_compte_epargne);
      if (!selectedCompteEpargne) {
        toast.error('Compte epargne associe non valide.');
        return;
      }

      const nowIso = new Date().toISOString();
      const newCompte: Omit<CompteCredit, 'id_compte_credit'> = {
        id_personne: formData.id_personne!,
        id_compte_epargne: formData.id_compte_epargne!,
        no_compte: generateCustomCode(selectedCompteEpargne.no_compte),
        ancien_code: formData.ancien_code,
        montant_prete: Number(formData.montant_prete),
        duree_credit_mois: Number(formData.duree_credit_mois),
        taux_interet: Number(formData.taux_interet),
        paiement_journalier: Number(formData.paiement_journalier),
        paiement_rembourse: 0,
        montant_deja_paye_manuellement: formData.montant_deja_paye_manuellement ?? 0,
        fonds_garantie: Number(formData.fonds_garantie),
        penalites: Number(formData.penalites),
        statut: 'Actif',
        date_creation: nowIso,
        date_debut: formData.date_debut,
        date_fin: formData.date_fin,
        created_at: nowIso,
        created_by: userId,
      };
      await db.addRecord('comptes_credit', newCompte);
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

        <Select label="Compte Epargne Associe" name="id_compte_epargne" value={formData.id_compte_epargne || ''} onChange={handleChange} required disabled={!!compte || !formData.id_personne} className="md:col-span-2">
          <option value="">Selectionner un compte</option>
          {comptesEpargne.map(c => <option key={c.id_compte_epargne} value={c.id_compte_epargne}>{c.no_compte}</option>)}
        </Select>

        {compte && <Input label="Numero de Compte Credit" name="no_compte" value={formData.no_compte || ''} readOnly disabled />}

        <Input label="Code Credit Ancien" name="ancien_code" value={formData.ancien_code || ''} onChange={handleChange} required />
        <Input type="number" label="Montant Prete" name="montant_prete" value={formData.montant_prete ?? ''} onChange={handleChange} required step="0.01" />
        <Input type="number" label="Montant Deja Paye (Manuel)" name="montant_deja_paye_manuellement" value={formData.montant_deja_paye_manuellement ?? 0} onChange={handleChange} step="0.01" />
        <Input type="number" label="Duree (mois)" name="duree_credit_mois" value={formData.duree_credit_mois ?? ''} onChange={handleChange} required />
        <Input type="number" label="Taux d'interet (decimal)" name="taux_interet" value={formData.taux_interet ?? ''} onChange={handleChange} required step="0.01" />
        <Input type="number" label="Paiement Journalier" name="paiement_journalier" value={formData.paiement_journalier ?? ''} onChange={handleChange} required step="0.01" />
        <Input type="number" label="Fonds de Garantie" name="fonds_garantie" value={formData.fonds_garantie ?? ''} onChange={handleChange} required step="0.01" />
        <Input type="number" label="Penalites" name="penalites" value={formData.penalites ?? ''} onChange={handleChange} required step="0.01" />

        <Input type="date" label="Date de debut" name="date_debut" value={toDateInput(formData.date_debut)} onChange={handleChange} required />
        <Input type="date" label="Date de fin" name="date_fin" value={toDateInput(formData.date_fin)} onChange={handleChange} required />

        <div className="md:col-span-2">
          <Select label="Statut" name="statut" value={formData.statut || 'Actif'} onChange={handleChange}>
            <option value="Actif">Actif</option>
            <option value="Paye">Paye</option>
            <option value="En retard">En retard</option>
            <option value="Ferme">Ferme</option>
          </Select>
        </div>
      </div>

      <div className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 min-h-[44px]">Annuler</button>
        <button type="submit" className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 min-h-[44px]">Enregistrer</button>
      </div>
    </form>
  );
};

export default CompteCreditForm;
