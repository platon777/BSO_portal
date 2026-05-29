import React, { useCallback, useState } from 'react';
import { TransactionEpargne, CompteEpargneAvecPersonne, CompteEpargne, Personne } from '../../types';
import { db } from '../../services/database';
import Input from '../common/Input';
import Select from '../common/Select';
import AsyncSearchableSelect, {
  AsyncSearchableOption,
  LoadOptionsParams,
  LoadOptionsResult,
} from '../common/AsyncSearchableSelect';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import {
  validateSavingsTransactionBeforeLocalSave,
} from '../../services/savingsAccountService';

interface TransactionEpargneFormProps {
  compteEpargne: CompteEpargneAvecPersonne;
  transaction?: TransactionEpargne;
  onSave: () => void;
  onCancel: () => void;
}

const parseNumber = (value: string): number => {
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Generate Haiti timezone ISO string (UTC-5 / America/Port-au-Prince)
const getNowHaitiISO = (): string => {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Port-au-Prince' }).replace(' ', 'T');
};

const BENEFICIARY_PAGE_SIZE = 20;
const SEARCH_MATCH_LIMIT = 120;

const TransactionEpargneForm: React.FC<TransactionEpargneFormProps> = ({ compteEpargne, transaction, onSave, onCancel }) => {
  const { profile } = useAuthStore();
  const [formData, setFormData] = useState<Partial<TransactionEpargne>>(transaction || {
    id_compte_epargne: compteEpargne.id_compte_epargne,
    no_compte: compteEpargne.no_compte,
    categorie_compte_epargne: compteEpargne.categorie_compte_epargne || 'Epargne',
    virement_from: compteEpargne.no_compte || '',
    frais_auto: 0,
    remise_client: 0,
    monnaie_client: '',
    solde_avant_transaction: compteEpargne.solde_actuel,
    solde_avant_transaction_declare: compteEpargne.solde_actuel,
    solde_apres_transaction_declare: compteEpargne.solde_actuel,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['montant', 'solde_declare', 'solde_avant_transaction_declare', 'solde_apres_transaction_declare', 'frais_auto', 'remise_client'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? parseNumber(value) : value }));
  };

  const handleBeneficiaryChange = (beneficiaryAccount: string | null) => {
    setFormData(prev => ({ ...prev, virement_to: beneficiaryAccount || undefined }));
  };

  const buildBeneficiaryOptionsFromComptes = useCallback(async (comptes: CompteEpargne[]): Promise<AsyncSearchableOption[]> => {
    if (comptes.length === 0) return [];

    const personIds = Array.from(new Set(comptes.map((compte) => compte.id_personne).filter(Boolean)));
    const persons = personIds.length > 0
      ? await db.personnes.where('id_personne').anyOf(personIds).toArray()
      : [];
    const personById = new Map<string, Personne>(persons.map((person) => [person.id_personne, person]));

    return comptes.map((compte) => {
      const person = personById.get(compte.id_personne);
      const nomClient = person ? `${person.prenom} ${person.nom}` : 'Client inconnu';
      const codeClient = person?.code_client || '-';
      const codeAncien = compte.no_compte_ancien || '-';
      return {
        id: compte.no_compte,
        label: compte.no_compte,
        subLabel: `${nomClient} | Code: ${codeClient} | Code ancien: ${codeAncien}`,
      };
    });
  }, []);

  const loadBeneficiaryOptions = useCallback(async ({ search, offset, limit }: LoadOptionsParams): Promise<LoadOptionsResult> => {
    const trimmedSearch = search.trim();
    const effectiveLimit = Math.max(limit, BENEFICIARY_PAGE_SIZE);

    if (!trimmedSearch) {
      const rawComptes = await db.comptes_epargne
        .orderBy('date_creation')
        .reverse()
        .offset(offset)
        .limit(effectiveLimit + 1)
        .toArray();

      const filteredComptes = rawComptes.filter((compte) => compte.id_compte_epargne !== compteEpargne.id_compte_epargne);
      const pageComptes = filteredComptes.slice(0, effectiveLimit);
      const options = await buildBeneficiaryOptionsFromComptes(pageComptes);

      return {
        options,
        hasMore: rawComptes.length > effectiveLimit,
      };
    }

    const [byNoCompte, byAncienCode, personsByCode, personsByPrenom, personsByNom] = await Promise.all([
      db.comptes_epargne.where('no_compte').startsWithIgnoreCase(trimmedSearch).limit(SEARCH_MATCH_LIMIT).toArray(),
      db.comptes_epargne.where('no_compte_ancien').startsWithIgnoreCase(trimmedSearch).limit(SEARCH_MATCH_LIMIT).toArray(),
      db.personnes.where('code_client').startsWithIgnoreCase(trimmedSearch).limit(SEARCH_MATCH_LIMIT).toArray(),
      db.personnes.where('prenom').startsWithIgnoreCase(trimmedSearch).limit(SEARCH_MATCH_LIMIT).toArray(),
      db.personnes.where('nom').startsWithIgnoreCase(trimmedSearch).limit(SEARCH_MATCH_LIMIT).toArray(),
    ]);

    const personIdSet = new Set<string>();
    [...personsByCode, ...personsByPrenom, ...personsByNom].forEach((person: Personne) => personIdSet.add(person.id_personne));

    let byPerson: CompteEpargne[] = [];
    if (personIdSet.size > 0) {
      byPerson = await db.comptes_epargne.where('id_personne').anyOf(Array.from(personIdSet)).toArray();
    }

    const uniqueComptes = new Map<string, CompteEpargne>();
    [...byNoCompte, ...byAncienCode, ...byPerson].forEach((compte) => {
      if (compte.id_compte_epargne === compteEpargne.id_compte_epargne) return;
      uniqueComptes.set(compte.id_compte_epargne, compte);
    });

    const sortedComptes = Array.from(uniqueComptes.values()).sort((a, b) =>
      new Date(b.date_creation || 0).getTime() - new Date(a.date_creation || 0).getTime()
    );

    const pageSlice = sortedComptes.slice(offset, offset + effectiveLimit + 1);
    const pageComptes = pageSlice.slice(0, effectiveLimit);
    const options = await buildBeneficiaryOptionsFromComptes(pageComptes);

    return {
      options,
      hasMore: pageSlice.length > effectiveLimit,
    };
  }, [buildBeneficiaryOptionsFromComptes, compteEpargne.id_compte_epargne]);

  const resolveBeneficiaryValue = useCallback(async (value: string): Promise<AsyncSearchableOption | null> => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const compte = await db.comptes_epargne.where('no_compte').equals(trimmed).first();
    if (!compte) {
      return {
        id: trimmed,
        label: trimmed,
        subLabel: 'Compte non repertorie localement',
      };
    }

    const [option] = await buildBeneficiaryOptionsFromComptes([compte]);
    return option || null;
  }, [buildBeneficiaryOptionsFromComptes]);

  const validateBeforeSubmit = () => {
    if (!formData.type_transaction) {
      toast.error('Type de transaction est obligatoire.');
      return false;
    }

    const computedMontant = Number(formData.montant ?? 0);
    if (computedMontant <= 0) {
      toast.error('Montant doit etre superieur a zero.');
      return false;
    }

    if (formData.type_transaction === 'V') {
      if (!String(formData.virement_from || '').trim() || !String(formData.virement_to || '').trim()) {
        toast.error('Virement requiert compte emetteur et compte beneficiaire.');
        return false;
      }
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

    if (!validateBeforeSubmit()) {
      return;
    }

    let solde_apres_transactions = formData.solde_avant_transaction || 0;
    const montant = formData.montant || 0;
    const typeTransaction = formData.type_transaction!;

    const guard = await validateSavingsTransactionBeforeLocalSave(compteEpargne, typeTransaction, montant);
    if (!guard.allowed) {
      toast.error(guard.message || 'Operation impossible pour ce compte.');
      return;
    }

    const soldeAvantConfirme = guard.serverBalance ?? formData.solde_avant_transaction ?? compteEpargne.solde_actuel ?? 0;
    solde_apres_transactions = soldeAvantConfirme;

    if (typeTransaction === 'D') {
      solde_apres_transactions += montant;
    } else if (typeTransaction === 'R' || typeTransaction === 'FL' || typeTransaction === 'S' || typeTransaction === 'FA' || typeTransaction === 'V') {
      solde_apres_transactions -= montant;
      if (solde_apres_transactions < 0) {
        toast.error(`Solde insuffisant. Solde disponible: ${soldeAvantConfirme}`);
        return;
      }
    }

    if (transaction && transaction.id_transaction_epargne) {
      await db.updateRecord('transactions_epargne', transaction.id_transaction_epargne, {
        ...formData,
        categorie_compte_epargne: compteEpargne.categorie_compte_epargne || 'Epargne',
        virement_from: formData.type_transaction === 'V'
          ? String(formData.virement_from || compteEpargne.no_compte || '').trim()
          : undefined,
        virement_to: formData.type_transaction === 'V'
          ? String(formData.virement_to || '').trim()
          : undefined,
        solde_apres_transactions,
        solde_avant_transaction: soldeAvantConfirme,
        solde_avant_transaction_declare: soldeAvantConfirme,
        solde_apres_transaction_declare: solde_apres_transactions,
        updated_at: getNowHaitiISO()
      });
    } else {
      const nowIso = getNowHaitiISO();
      const newTransaction: Omit<TransactionEpargne, 'id_transaction_epargne'> = {
        id_compte_epargne: formData.id_compte_epargne!,
        no_compte: formData.no_compte!,
        type_transaction: formData.type_transaction!,
        montant: formData.montant!,
        categorie_compte_epargne: compteEpargne.categorie_compte_epargne || 'Epargne',
        solde_declare: formData.solde_declare,
        virement_from: formData.type_transaction === 'V'
          ? String(formData.virement_from || compteEpargne.no_compte || '').trim()
          : undefined,
        virement_to: formData.type_transaction === 'V'
          ? String(formData.virement_to || '').trim()
          : undefined,
        frais_auto: formData.frais_auto,
        monnaie_client: formData.monnaie_client,
        remise_client: formData.remise_client,
        solde_avant_transaction: soldeAvantConfirme,
        solde_avant_transaction_declare: soldeAvantConfirme,
        solde_apres_transaction_declare: solde_apres_transactions,
        date_transaction: nowIso,
        created_by: userId,
        created_at: nowIso,
        solde_apres_transactions
      };

      await db.addRecord('transactions_epargne', newTransaction);

      // Local projection only. Supabase balance is changed by the transaction trigger.
      await db.comptes_epargne.update(formData.id_compte_epargne!, {
        solde_actuel: solde_apres_transactions,
        updated_at: nowIso
      });

      // For virements: update beneficiary balance locally only (no sync queue)
      // The Supabase trigger update_savings_balance() handles the beneficiary credit on sync
      if (formData.type_transaction === 'V' && formData.virement_to) {
        const beneficiaryCompte = await db.comptes_epargne.where('no_compte').equals(formData.virement_to).first();
        if (beneficiaryCompte) {
          const newBeneficiarySolde = (beneficiaryCompte.solde_actuel || 0) + montant;
          // Direct Dexie update - not through db.updateRecord() to avoid creating a sync queue item
          await db.comptes_epargne.update(beneficiaryCompte.id_compte_epargne, {
            solde_actuel: newBeneficiarySolde,
            updated_at: nowIso,
          });
        }
      }
    }

    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input name="client" label="Client" value={`${compteEpargne.personne?.prenom} ${compteEpargne.personne?.nom}`} readOnly disabled />
      <Input name="no_compte_epargne" label="Compte Epargne" value={compteEpargne.no_compte} readOnly disabled />
      {compteEpargne.no_compte_ancien && (
        <Input name="no_compte_ancien" label="Code Ancien" value={compteEpargne.no_compte_ancien} readOnly disabled />
      )}
      <Input name="categorie_compte_epargne_display" label="Categorie Compte Epargne" value={compteEpargne.categorie_compte_epargne || 'Epargne'} readOnly disabled />

      <Select label="Type de transaction" name="type_transaction" value={formData.type_transaction || ''} onChange={handleChange} required>
        <option value="">Selectionner le type</option>
        <option value="D">Depot</option>
        <option value="R">Retrait</option>
        <option value="FL">Nouveau Livret</option>
        <option value="S">Frais Service</option>
        <option value="FA">Frais Auto</option>
        <option value="V">Virement</option>
      </Select>

      <Input type="number" label="Montant" name="montant" value={formData.montant ?? ''} onChange={handleChange} required step="0.01" />

      {formData.type_transaction === 'V' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            type="text"
            label="Compte emetteur"
            name="virement_from"
            value={formData.virement_from ?? compteEpargne.no_compte ?? ''}
            readOnly
            disabled
            required
          />
          <AsyncSearchableSelect
            label="Compte beneficiaire"
            value={formData.virement_to || null}
            onChange={handleBeneficiaryChange}
            loadOptions={loadBeneficiaryOptions}
            resolveValue={resolveBeneficiaryValue}
            placeholder="Rechercher par nom, code client ou code ancien..."
            pageSize={BENEFICIARY_PAGE_SIZE}
            required
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          type="text"
          label="Monnaie Client"
          name="monnaie_client"
          value={formData.monnaie_client ?? ''}
          onChange={handleChange}
          placeholder="Entrer une valeur libre..."
        />

        <Input type="number" label="Remise Client" name="remise_client" value={formData.remise_client || ''} onChange={handleChange} step="0.01" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input type="number" label="Solde Avant Declare" name="solde_avant_transaction_declare" value={formData.solde_avant_transaction_declare ?? ''} onChange={handleChange} required step="0.01" />
        <Input type="number" label="Solde Apres Declare" name="solde_apres_transaction_declare" value={formData.solde_apres_transaction_declare ?? ''} onChange={handleChange} required step="0.01" />
      </div>

      <div className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onCancel} className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 min-h-[44px]">Annuler</button>
        <button type="submit" className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 min-h-[44px]">Enregistrer</button>
      </div>
    </form>
  );
};

export default TransactionEpargneForm;
