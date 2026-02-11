import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { copyToClipboard } from '../utils/clipboard';
import SecureWrapper from '../components/common/SecureWrapper';
import { getCreditFinalCapital } from '../utils/creditCalculations';
import { useAuthStore } from '../stores/authStore';
import { UserRole } from '../types/auth';

interface CompteEpargneDetailsProps {
  compteId: string;
  onBack: () => void;
  onOpenCreditDetails?: (id: string) => void;
}

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toFixed(2);
  return String(value);
};

const CompteEpargneDetails: React.FC<CompteEpargneDetailsProps> = ({ compteId, onBack, onOpenCreditDetails }) => {
  const { profile } = useAuthStore();
  const canViewBalances = profile?.role === UserRole.ADMIN;
  const data = useLiveQuery(async () => {
    const safeCompteId = typeof compteId === 'string' ? compteId.trim() : '';
    if (!safeCompteId) {
      return { missing: true as const };
    }

    const compte = await db.comptes_epargne.get(safeCompteId);
    if (!compte) {
      return { missing: true as const };
    }

    const [personne, transactions, comptesCredit] = await Promise.all([
      compte.id_personne ? db.personnes.get(compte.id_personne) : Promise.resolve(undefined),
      db.transactions_epargne.where('id_compte_epargne').equals(safeCompteId).toArray(),
      db.comptes_credit.where('id_compte_epargne').equals(safeCompteId).toArray(),
    ]);

    transactions.sort((a, b) => {
      const dateA = new Date(a.date_transaction || a.created_at || '').getTime() || 0;
      const dateB = new Date(b.date_transaction || b.created_at || '').getTime() || 0;
      return dateB - dateA;
    });

    return {
      missing: false as const,
      compte,
      personne,
      transactions,
      comptesCredit,
    };
  }, [compteId], undefined);

  if (data === undefined) {
    return (
      <SecureWrapper>
        <div className="space-y-4">
          <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200">
            Retour
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-700">Chargement des details...</div>
        </div>
      </SecureWrapper>
    );
  }

  if (data.missing) {
    return (
      <SecureWrapper>
        <div className="space-y-4">
          <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200">
            Retour vers epargne
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-700">Compte epargne introuvable.</div>
        </div>
      </SecureWrapper>
    );
  }

  const { compte, personne, transactions, comptesCredit } = data;

  const detailItems: Array<{ label: string; value: unknown }> = [
    { label: 'ID compte', value: compte.id_compte_epargne },
    { label: 'ID personne', value: compte.id_personne },
    { label: 'Numero compte', value: compte.no_compte },
    { label: 'Numero ancien', value: compte.no_compte_ancien },
    { label: 'ID plan', value: compte.id_plan },
    ...(canViewBalances ? [{ label: 'Solde actuel', value: compte.solde_actuel }] : []),
    { label: 'Fonds garantie', value: compte.fonds_garantie },
    { label: 'Statut', value: compte.statut },
    { label: 'Date creation metier', value: formatDate(compte.date_creation) },
    { label: 'Succursale', value: compte.succursale },
    { label: 'Duree', value: compte.duree },
    { label: 'Person allowed', value: compte.person_allowed },
    { label: 'Piece allowed', value: compte.piece_identification_allowed },
    { label: 'NIF/CIN allowed', value: compte.nif_cin_allowed },
    { label: 'Photo allowed', value: compte.photo_allowed },
    { label: 'Cree le', value: formatDate(compte.created_at) },
    { label: 'Cree par', value: compte.created_by },
    { label: 'Modifie le', value: formatDate(compte.updated_at) },
    { label: 'Modifie par', value: compte.updated_by },
  ];

  return (
    <SecureWrapper>
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200">
          Retour vers epargne
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Compte epargne</h1>
              <button type="button" onClick={() => copyToClipboard(compte.no_compte, 'Numero de compte')} className="font-mono text-sm text-blue-700 hover:text-blue-900">
                {compte.no_compte || '-'}
              </button>
            </div>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {compte.statut || 'N/A'}
            </span>
          </div>

          {personne && (
            <div className="mb-6 p-3 rounded-lg border border-blue-200 bg-blue-50">
              <p className="text-xs uppercase tracking-wide text-blue-700">Client lie</p>
              <p className="text-sm font-semibold text-blue-900">{personne.prenom} {personne.nom}</p>
              <p className="text-xs text-blue-800">Code: {personne.code_client}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {detailItems.map((item) => (
              <div key={item.label} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-xs uppercase tracking-wide text-gray-500">{item.label}</p>
                <p className="text-sm font-medium text-gray-900 break-words">{formatValue(item.value)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Comptes credit lies ({comptesCredit.length})</h2>
          <div className="space-y-2">
            {comptesCredit.length === 0 && <p className="text-sm text-gray-600">Aucun compte credit lie a ce compte epargne.</p>}
            {comptesCredit.map((credit) => (
              <div key={credit.id_compte_credit} className="p-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{credit.no_compte}</p>
                  <p className="text-xs text-gray-600">Capital final: {formatValue(getCreditFinalCapital(credit))} HTG</p>
                </div>
                {onOpenCreditDetails && (
                  <button
                    type="button"
                    onClick={() => onOpenCreditDetails(credit.id_compte_credit)}
                    className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                  >
                    Voir details
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Transactions epargne ({transactions.length})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                  {canViewBalances && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Solde avant declare</th>}
                  {canViewBalances && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Solde apres declare</th>}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <tr key={tx.id_transaction_epargne}>
                    <td className="px-3 py-2 text-sm text-gray-700">{formatDate(tx.date_transaction)}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{tx.type_transaction}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 font-medium">{formatValue(tx.montant)}</td>
                    {canViewBalances && <td className="px-3 py-2 text-sm text-gray-700">{formatValue(tx.solde_avant_transaction_declare)}</td>}
                    {canViewBalances && <td className="px-3 py-2 text-sm text-gray-700">{formatValue(tx.solde_apres_transaction_declare)}</td>}
                    <td className="px-3 py-2 text-sm text-gray-700">{tx.created_by || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {transactions.length === 0 && <p className="text-sm text-gray-600 mt-3">Aucune transaction pour ce compte.</p>}
        </div>
      </div>
    </SecureWrapper>
  );
};

export default CompteEpargneDetails;
