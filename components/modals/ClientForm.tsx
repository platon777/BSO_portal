import React, { useRef, useState, useMemo } from 'react';
import { Personne } from '../../types';
import Input from '../common/Input';
import Select from '../common/Select';
import { db } from '../../services/database';
import { generateUserCode } from '../../services/codeGenerator';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import { SECTEURS, ACTIVITES_PAR_SECTEUR, CAPACITES_DISTRIBUTION, POINTS_DE_VENTE, Secteur } from '../../data/occupationData';

// Generate Haiti timezone ISO string (UTC-5 / America/Port-au-Prince)
const getNowHaitiISO = (): string => {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Port-au-Prince' }).replace(' ', 'T') + '.000Z';
};

interface ClientFormProps {
  client?: Personne;
  onSave: () => void;
  onCancel: () => void;
}

const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.readAsDataURL(file);
  });

const ClientForm: React.FC<ClientFormProps> = ({ client, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Personne>>(
    client || {
      sexe: 'M',
      statut: 'Actif',
    }
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoSelected = async (file?: File) => {
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
      setFormData((prev) => ({ ...prev, photo_identification: dataUrl }));
    } catch (error: any) {
      toast.error(error?.message || 'Impossible de sauvegarder la photo.');
    }
  };

  const handlePhotoInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    await handlePhotoSelected(file);
    e.target.value = '';
  };

  const clearPhoto = () => {
    setFormData((prev) => ({ ...prev, photo_identification: '' }));
  };

  const selectedSecteurs = useMemo(() => {
    if (!formData.secteur) return [] as string[];
    return formData.secteur.split(',').map(s => s.trim()).filter(Boolean);
  }, [formData.secteur]);

  const availableActivites = useMemo(() => {
    const activites = new Set<string>();
    selectedSecteurs.forEach(s => {
      const list = ACTIVITES_PAR_SECTEUR[s as Secteur];
      if (list) list.forEach(a => activites.add(a));
    });
    return Array.from(activites);
  }, [selectedSecteurs]);

  const handleSecteurToggle = (secteur: string) => {
    const current = selectedSecteurs.includes(secteur)
      ? selectedSecteurs.filter(s => s !== secteur)
      : [...selectedSecteurs, secteur];
    const newSecteur = current.join(', ');
    // Check if current activite is still valid with new secteur selection
    const newActivites = new Set<string>();
    current.forEach(s => {
      const list = ACTIVITES_PAR_SECTEUR[s as Secteur];
      if (list) list.forEach(a => newActivites.add(a));
    });
    const activiteStillValid = formData.activite && newActivites.has(formData.activite);
    setFormData(prev => ({
      ...prev,
      secteur: newSecteur || undefined,
      activite: activiteStillValid ? prev.activite : undefined,
    }));
  };

  const validateRequired = () => {
    const requiredFields: Array<{ key: keyof Personne; label: string }> = [
      { key: 'nom', label: 'Nom' },
      { key: 'prenom', label: 'Prenom' },
      { key: 'numero_telephone', label: 'Telephone' },
      { key: 'adresse', label: 'Adresse' },
      { key: 'lieu_de_travail', label: 'Lieu de travail' },
    ];

    for (const field of requiredFields) {
      const value = String(formData[field.key] || '').trim();
      if (!value) {
        toast.error(`${field.label} est obligatoire.`);
        return false;
      }
    }

    if (!formData.secteur) {
      toast.error('Secteur est obligatoire.');
      return false;
    }

    if (!formData.activite) {
      toast.error('Activité est obligatoire.');
      return false;
    }

    if (!formData.photo_identification) {
      toast.error('Photo identification est obligatoire.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const profileId = profile?.id;
    if (!profileId) {
      toast.error('Erreur: utilisateur non connecte');
      return;
    }

    if (!validateRequired()) {
      return;
    }

    if (formData.nif_cin && formData.nif_cin.toLowerCase() !== 'nan' && formData.nif_cin.trim() !== '') {
      const existingNif = await db.personnes.where('nif_cin').equals(formData.nif_cin).first();
      if (existingNif && existingNif.id_personne !== client?.id_personne) {
        toast.error(`Un client avec ce NIF/CIN existe deja: ${existingNif.prenom} ${existingNif.nom}`);
        return;
      }
    }

    if (formData.numero_telephone) {
      const existingPhone = await db.personnes.where('numero_telephone').equals(formData.numero_telephone).first();
      if (existingPhone && existingPhone.id_personne !== client?.id_personne) {
        toast.error(`Un client avec ce numero existe deja: ${existingPhone.prenom} ${existingPhone.nom}`);
        return;
      }
    }

    if (client && client.id_personne) {
      await db.updateRecord('personnes', client.id_personne, {
        ...formData,
        updated_by: String(profileId),
        updated_at: getNowHaitiISO(),
      });
    } else {
      const nowIso = getNowHaitiISO();
      const newClientData = {
        ...formData,
        code_client: generateUserCode(formData.prenom, formData.nom),
        created_by: String(profileId),
        date_creation: nowIso,
        created_at: nowIso,
        sexe: formData.sexe || 'M',
        statut: formData.statut || 'Actif',
        unique_id: crypto.randomUUID(),
      } as Omit<Personne, 'id_personne'>;

      await db.addRecord('personnes', newClientData);
    }

    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Nom" name="nom" value={formData.nom || ''} onChange={handleChange} required />
        <Input label="Prenom" name="prenom" value={formData.prenom || ''} onChange={handleChange} required />
        {client && <Input label="Code Client" name="code_client" value={formData.code_client || ''} readOnly disabled />}

        <Input label="Pseudo" name="pseudo" value={formData.pseudo || ''} onChange={handleChange} />
        <Input label="Telephone" name="numero_telephone" value={formData.numero_telephone || ''} onChange={handleChange} required />
        <Input label="Adresse" name="adresse" value={formData.adresse || ''} onChange={handleChange} required />

        <Select
          label="Piece d'identification"
          name="piece_identification"
          value={formData.piece_identification || ''}
          onChange={handleChange}
        >
          <option value="">Selectionner</option>
          <option value="NIF">NIF</option>
          <option value="CIN">CIN</option>
          <option value="Passeport">Passeport</option>
        </Select>

        <Input label="Numero d'identification" name="nif_cin" value={formData.nif_cin || ''} onChange={handleChange} />

        <Input
          type="date"
          label="Date de naissance"
          name="date_naissance"
          value={formData.date_naissance ? formData.date_naissance.split('T')[0] : ''}
          onChange={handleChange}
        />

        <Input label="Lieu de travail" name="lieu_de_travail" value={formData.lieu_de_travail || ''} onChange={handleChange} required />

        {/* Secteur - Multi-select */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Secteur *</label>
          <div className="border border-gray-300 rounded-md p-2 max-h-40 overflow-y-auto bg-white">
            {SECTEURS.map(secteur => (
              <label key={secteur} className="flex items-center gap-2 py-1 px-1 hover:bg-gray-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSecteurs.includes(secteur)}
                  onChange={() => handleSecteurToggle(secteur)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{secteur}</span>
              </label>
            ))}
          </div>
          {selectedSecteurs.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">Sélectionné(s) : {selectedSecteurs.join(', ')}</p>
          )}
        </div>

        {/* Activité - filtré selon secteur */}
        <Select label="Activité *" name="activite" value={formData.activite || ''} onChange={handleChange} required>
          <option value="">Sélectionner une activité</option>
          {availableActivites.map(activite => (
            <option key={activite} value={activite}>{activite}</option>
          ))}
        </Select>

        {/* Capacité distribution */}
        <Select label="Capacité distribution" name="capacite_distribution" value={formData.capacite_distribution || ''} onChange={handleChange}>
          <option value="">Sélectionner</option>
          {CAPACITES_DISTRIBUTION.map(cap => (
            <option key={cap} value={cap}>{cap}</option>
          ))}
        </Select>

        {/* Point de vente */}
        <Select label="Point de vente" name="point_de_vente" value={formData.point_de_vente || ''} onChange={handleChange}>
          <option value="">Sélectionner</option>
          {POINTS_DE_VENTE.map(pdv => (
            <option key={pdv} value={pdv}>{pdv}</option>
          ))}
        </Select>

        <Select label="Sexe" name="sexe" value={formData.sexe || 'M'} onChange={handleChange}>
          <option value="M">Masculin</option>
          <option value="F">Feminin</option>
        </Select>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Photo d'identification *</label>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="h-24 w-24 rounded-md border border-gray-300 overflow-hidden bg-gray-50 flex items-center justify-center">
              {formData.photo_identification ? (
                <img src={formData.photo_identification} alt="Photo client" className="h-full w-full object-cover" />
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
              {formData.photo_identification && (
                <button
                  type="button"
                  onClick={clearPhoto}
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
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 min-h-[44px]"
        >
          Annuler
        </button>
        <button type="submit" className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 min-h-[44px]">
          Enregistrer
        </button>
      </div>
    </form>
  );
};

export default ClientForm;
