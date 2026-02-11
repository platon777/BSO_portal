import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CompteEpargne, TransactionEpargne } from '../../types';
import { db } from '../../services/database';
import Input from '../common/Input';
import Select from '../common/Select';
import { generateCustomCode } from '../../services/codeGenerator';
import SearchableSelect from '../common/SearchableSelect';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface CompteEpargneFormProps {
  compte?: CompteEpargne;
  onSave: () => void;
  onCancel: () => void;
}

const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;

const parseNumber = (value: string): number => {
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.readAsDataURL(file);
  });

const CompteEpargneForm: React.FC<CompteEpargneFormProps> = ({ compte, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const [formData, setFormData] = useState<Partial<CompteEpargne>>({});
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const clients = useLiveQuery(() => db.personnes.toArray(), []);

  useEffect(() => {
    if (compte) {
      setFormData(compte);
    } else {
      setFormData({
        solde_actuel: 0,
        fonds_garantie: 0,
        categorie_compte_epargne: 'Epargne',
      });
    }
  }, [compte]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['solde_actuel', 'fonds_garantie', 'id_plan'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseNumber(value) : value }));
  };

  const handleClientChange = (clientId: string | null) => {
    setFormData(prev => ({ ...prev, id_personne: clientId || undefined }));
  };

  const handlePhotoInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Le fichier selectionne doit etre une image.');
      return;
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      toast.error('La photo depasse 8MB. Choisissez une image plus legere.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setFormData(prev => ({ ...prev, photo_personne_autorisee: dataUrl }));
    } catch (error: any) {
      toast.error(error?.message || 'Impossible de sauvegarder la photo.');
    }
  };

  const clearAuthorizedPhoto = () => {
    setFormData(prev => ({ ...prev, photo_personne_autorisee: '' }));
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
    if (!formData.id_personne) {
      toast.error('Veuillez selectionner un client.');
      return false;
    }
    if (!String(formData.no_compte_ancien || '').trim()) {
      toast.error('Numero compte ancien est obligatoire.');
      return false;
    }
    if (!String(formData.succursale || '').trim()) {
      toast.error('Succursale est obligatoire.');
      return false;
    }
    if (!formData.id_plan) {
      toast.error('Plan est obligatoire.');
      return false;
    }
    if (!String(formData.type_compte_epargne || '').trim()) {
      toast.error('Type compte epargne est obligatoire.');
      return false;
    }
    if ((formData.solde_actuel ?? 0) < 0) {
      toast.error('Le solde initial ne peut pas etre negatif.');
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

    if (formData.no_compte_ancien && formData.no_compte_ancien.trim() !== '') {
      const existingLegacyAccount = await db.comptes_epargne.where('no_compte_ancien').equals(formData.no_compte_ancien).first();
      if (existingLegacyAccount && existingLegacyAccount.id_compte_epargne !== compte?.id_compte_epargne) {
        toast.error('Ce numero de compte ancien existe deja.');
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
      const selectedClient = clients?.find(c => c.id_personne === formData.id_personne);
      if (!selectedClient) {
        toast.error('Client non valide selectionne.');
        return;
      }

      const nowIso = new Date().toISOString();
      const newCompte: Omit<CompteEpargne, 'id_compte_epargne'> = {
        id_personne: formData.id_personne!,
        no_compte: generateCustomCode(selectedClient.code_client),
        no_compte_ancien: String(formData.no_compte_ancien || '').trim(),
        id_plan: formData.id_plan,
        type_compte_epargne: formData.type_compte_epargne,
        categorie_compte_epargne: formData.categorie_compte_epargne,
        photo_personne_autorisee: formData.photo_personne_autorisee,
        solde_actuel: 0,
        fonds_garantie: 0,
        statut: 'Actif',
        date_creation: nowIso,
        created_by: userId,
        created_at: nowIso,
        succursale: formData.succursale,
        duree: undefined,
        person_allowed: formData.person_allowed,
        piece_identification_allowed: formData.piece_identification_allowed,
        nif_cin_allowed: formData.nif_cin_allowed,
        photo_allowed: formData.photo_allowed,
      };

      const compteId = await db.addRecord('comptes_epargne', newCompte);

      const initialBalance = Number(formData.solde_actuel ?? 0);
      if (initialBalance > 0) {
        const newTransaction: Omit<TransactionEpargne, 'id_transaction_epargne'> = {
          id_compte_epargne: compteId,
          no_compte: newCompte.no_compte,
          type_transaction: 'D',
          montant: initialBalance,
          categorie_compte_epargne: newCompte.categorie_compte_epargne,
          solde_avant_transaction: 0,
          solde_avant_transaction_declare: 0,
          solde_apres_transaction_declare: initialBalance,
          solde_apres_transactions: initialBalance,
          date_transaction: nowIso,
          created_by: userId,
          created_at: nowIso,
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

        <Input label="Numero de Compte Ancien" name="no_compte_ancien" value={formData.no_compte_ancien || ''} onChange={handleChange} required />

        <Select label="Succursale" name="succursale" value={formData.succursale || ''} onChange={handleChange} required>
          <option value="">Selectionner...</option>
          <option value="1">Cap-Haitien</option>
          <option value="2">Vertieres</option>
          <option value="3">Champin</option>
        </Select>

        <Input type="number" label="Plan (ID)" name="id_plan" value={formData.id_plan ?? ''} onChange={handleChange} required />

        <Select label="Type Compte Epargne" name="type_compte_epargne" value={formData.type_compte_epargne || ''} onChange={handleChange} required>
          <option value="">Selectionner...</option>
          <option value="Compte Upgrade">Compte Upgrade</option>
          <option value="Compte Staff">Compte Staff</option>
          <option value="Compte Bloque">Compte Bloque</option>
        </Select>

        <Select label="Categorie Compte Epargne" name="categorie_compte_epargne" value={formData.categorie_compte_epargne || ''} onChange={handleChange}>
          <option value="">Selectionner...</option>
          <option value="Epargne">Epargne</option>
          <option value="Fonds Garantie">Fonds Garantie</option>
          <option value="Grandon">Grandon</option>
        </Select>

        <Input type="number" label="Solde Initial" name="solde_actuel" value={formData.solde_actuel ?? 0} onChange={handleChange} disabled={!!compte} step="0.01" />

        <Input label="Personne Autorisee" name="person_allowed" value={formData.person_allowed || ''} onChange={handleChange} className="md:col-span-2" />

        <Select label="Piece d'Identification Autorisee" name="piece_identification_allowed" value={formData.piece_identification_allowed || ''} onChange={handleChange}>
          <option value="">Selectionner...</option>
          <option value="NIF">NIF</option>
          <option value="CIN">CIN</option>
          <option value="Passeport">Passeport</option>
        </Select>

        <Input label="NIF/CIN Autorise" name="nif_cin_allowed" value={formData.nif_cin_allowed || ''} onChange={handleChange} />

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Photo personne autorisee</label>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="h-24 w-24 rounded-md border border-gray-300 overflow-hidden bg-gray-50 flex items-center justify-center">
              {formData.photo_personne_autorisee ? (
                <img src={formData.photo_personne_autorisee} alt="Photo personne autorisee" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-gray-500 text-center px-2">Aucune photo</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Importer photo
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Prendre photo
              </button>
              {formData.photo_personne_autorisee && (
                <button
                  type="button"
                  onClick={clearAuthorizedPhoto}
                  className="px-3 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200"
                >
                  Retirer
                </button>
              )}
            </div>
          </div>

          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoInputChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoInputChange}
          />
          <p className="mt-2 text-xs text-gray-500">
            La photo est enregistree localement et sera synchronisee automatiquement vers Supabase.
          </p>
        </div>
      </div>

      <div className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 min-h-[44px]">Annuler</button>
        <button type="submit" className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 min-h-[44px]">Enregistrer</button>
      </div>
    </form>
  );
};

export default CompteEpargneForm;
