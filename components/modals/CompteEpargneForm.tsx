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
import { getSuccursaleLabel, getSuccursaleOptions } from '../../utils/succursale';
import { supabase } from '../../services/supabase';

// Generate Haiti timezone ISO string (UTC-5 / America/Port-au-Prince)
const getNowHaitiISO = (): string => {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Port-au-Prince' }).replace(' ', 'T');
};

interface CompteEpargneFormProps {
  compte?: CompteEpargne;
  onSave: () => void;
  onCancel: () => void;
}

const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;
const PLAN_CACHE_KEY = 'bso_offres_plans_cache_v1';

interface PlanOption {
  id: number;
  nom_plan: string;
}

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
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const clients = useLiveQuery(() => db.personnes.toArray(), []);

  useEffect(() => {
    if (compte) {
      setFormData({
        ...compte,
        succursale: getSuccursaleLabel(compte.succursale) || compte.succursale,
      });
    } else {
      setFormData({
        solde_actuel: 0,
        fonds_garantie: 0,
        categorie_compte_epargne: 'Epargne',
      });
    }
  }, [compte]);

  useEffect(() => {
    let isMounted = true;

    const loadPlanCache = () => {
      try {
        const raw = localStorage.getItem(PLAN_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        const cachedPlans = parsed
          .map((item: any) => ({ id: Number(item.id), nom_plan: String(item.nom_plan || '') }))
          .filter((item: PlanOption) => Number.isFinite(item.id) && item.id > 0 && item.nom_plan);
        if (cachedPlans.length > 0 && isMounted) {
          setPlanOptions(cachedPlans);
        }
      } catch (error) {
        console.warn('[CompteEpargneForm] Impossible de charger le cache des plans', error);
      }
    };

    const fetchPlans = async () => {
      setPlansLoading(true);
      try {
        const { data, error } = await supabase
          .from('offres_plans')
          .select('id_plan, nom_plan')
          .order('id_plan', { ascending: true });

        if (error) {
          console.warn('[CompteEpargneForm] Chargement offres_plans echoue', error);
          return;
        }

        const fetchedPlans = (data || [])
          .map((item: any) => ({ id: Number(item.id_plan), nom_plan: String(item.nom_plan || '') }))
          .filter((item: PlanOption) => Number.isFinite(item.id) && item.id > 0 && item.nom_plan);

        if (isMounted && fetchedPlans.length > 0) {
          setPlanOptions(fetchedPlans);
          localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(fetchedPlans));
        }
      } finally {
        if (isMounted) {
          setPlansLoading(false);
        }
      }
    };

    loadPlanCache();
    fetchPlans();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['solde_actuel', 'fonds_garantie', 'id_plan'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseNumber(value) : value }));
  };

  const handleClientChange = (clientId: string | null) => {
    setFormData(prev => ({ ...prev, id_personne: clientId || undefined }));
  };

  const handlePlanChange = (planId: string | null) => {
    const parsedPlanId = planId ? Number(planId) : undefined;
    setFormData(prev => ({
      ...prev,
      id_plan: parsedPlanId && Number.isFinite(parsedPlanId) ? parsedPlanId : undefined,
    }));
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

  const succursaleOptions = useMemo(() => getSuccursaleOptions(), []);

  const mergedPlanOptions = useMemo(() => {
    const map = new Map<number, PlanOption>();
    planOptions.forEach((plan) => map.set(plan.id, plan));

    const currentPlanId = Number(formData.id_plan);
    if (Number.isFinite(currentPlanId) && currentPlanId > 0 && !map.has(currentPlanId)) {
      map.set(currentPlanId, { id: currentPlanId, nom_plan: `Plan #${currentPlanId}` });
    }

    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }, [planOptions, formData.id_plan]);

  const searchablePlanOptions = useMemo(() => {
    return mergedPlanOptions.map((plan) => ({
      id: String(plan.id),
      label: plan.nom_plan,
      subLabel: `Plan ID: ${plan.id}`,
    }));
  }, [mergedPlanOptions]);

  const validateRequired = () => {
    if (!formData.id_personne) {
      toast.error('Veuillez selectionner un client.');
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
    if (!mergedPlanOptions.some((plan) => plan.id === Number(formData.id_plan))) {
      toast.error('Le plan selectionne est invalide.');
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

    const trimmedLegacyAccount = String(formData.no_compte_ancien || '').trim();
    if (trimmedLegacyAccount) {
      const existingLegacyAccount = await db.comptes_epargne.where('no_compte_ancien').equals(trimmedLegacyAccount).first();
      if (existingLegacyAccount && existingLegacyAccount.id_compte_epargne !== compte?.id_compte_epargne) {
        toast.error('Ce numero de compte ancien existe deja.');
        return;
      }
    }

    if (compte && compte.id_compte_epargne) {
      await db.updateRecord('comptes_epargne', compte.id_compte_epargne, {
        ...formData,
        no_compte_ancien: trimmedLegacyAccount || undefined,
        updated_by: userId,
        updated_at: getNowHaitiISO()
      });
    } else {
      const selectedClient = clients?.find(c => c.id_personne === formData.id_personne);
      if (!selectedClient) {
        toast.error('Client non valide selectionne.');
        return;
      }

      const nowIso = getNowHaitiISO();
      const newCompte: Omit<CompteEpargne, 'id_compte_epargne'> = {
        id_personne: formData.id_personne!,
        no_compte: generateCustomCode(selectedClient.code_client),
        no_compte_ancien: trimmedLegacyAccount || undefined,
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
          // Solde reporte de l'ancien carnet: ne doit pas compter comme depot cash du jour.
          is_solde_initial: true,
          // Report d'ouverture: pas une entree de cash a verifier -> confirme d'emblee.
          validation_status: 'confirmed',
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

        // Local projection only. The server balance is updated by the transaction trigger.
        await db.comptes_epargne.update(compteId, {
          solde_actuel: initialBalance,
          updated_at: getNowHaitiISO()
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

        <Select label="Succursale" name="succursale" value={formData.succursale || ''} onChange={handleChange} required>
          <option value="">Selectionner...</option>
          {succursaleOptions.map((option) => (
            <option key={option.id} value={option.label}>
              {option.label}
            </option>
          ))}
        </Select>

        <div className="space-y-1">
          <SearchableSelect
            label="Plan"
            options={searchablePlanOptions}
            value={formData.id_plan ? String(formData.id_plan) : null}
            onChange={handlePlanChange}
            placeholder="Rechercher un plan..."
            required
          />
          {plansLoading && <p className="text-xs text-gray-500">Chargement des plans...</p>}
          {!plansLoading && mergedPlanOptions.length === 0 && (
            <p className="text-xs text-orange-600">Aucun plan disponible. Synchronisez ou verifiez la connexion.</p>
          )}
        </div>

        <Select label="Type Compte Epargne" name="type_compte_epargne" value={formData.type_compte_epargne || ''} onChange={handleChange} required>
          <option value="">Selectionner...</option>
          <option value="Nouveau Compte">Nouveau Compte</option>
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
