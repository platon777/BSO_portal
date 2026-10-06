import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { copyToClipboard } from '../utils/clipboard';
import SecureWrapper from '../components/common/SecureWrapper';
import { getCreditFinalCapital } from '../utils/creditCalculations';
import { useAuthStore } from '../stores/authStore';
import { canAccessAdminReports } from '../types/auth';
import { getSuccursaleLabel } from '../utils/succursale';
import { buildSavingsAccountSyncSummary } from '../services/savingsAccountService';
import { formatCreditAccountType } from '../utils/creditTypes';
import { normalizePhotoUrl } from '../utils/photoUtils';

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
  const canViewBalances = canAccessAdminReports(profile?.role);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const data = useLiveQuery(async () => {
    const safeCompteId = typeof compteId === 'string' ? compteId.trim() : '';
    if (!safeCompteId) {
      return { missing: true as const };
    }

    const compte = await db.comptes_epargne.get(safeCompteId);
    if (!compte) {
      return { missing: true as const };
    }

    const [personne, transactions, comptesCredit, queueItems] = await Promise.all([
      compte.id_personne ? db.personnes.get(compte.id_personne) : Promise.resolve(undefined),
      db.transactions_epargne.where('id_compte_epargne').equals(safeCompteId).toArray(),
      db.comptes_credit.where('id_compte_epargne').equals(safeCompteId).toArray(),
      db.syncQueue.where('status').anyOf(['pending', 'failed']).toArray(),
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
      syncSummary: buildSavingsAccountSyncSummary(compte, queueItems),
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

  const { compte, personne, transactions, comptesCredit, syncSummary } = data;
  const clientPhotoUrl = normalizePhotoUrl(personne?.photo_identification);
  const motoPhotoUrl = normalizePhotoUrl(compte.photo_personne_autorisee || compte.photo_allowed);

  const detailItems: Array<{ label: string; value: unknown }> = [
    { label: 'ID compte', value: compte.id_compte_epargne },
    { label: 'ID personne', value: compte.id_personne },
    { label: 'Numero compte', value: compte.no_compte },
    { label: 'Numero ancien', value: compte.no_compte_ancien },
    { label: 'ID plan', value: compte.id_plan },
    ...(canViewBalances ? [{ label: 'Solde confirme', value: syncSummary.confirmedBalanceEstimate }] : []),
    { label: 'Fonds garantie', value: compte.fonds_garantie },
    { label: 'Statut', value: compte.statut },
    { label: 'Date creation metier', value: formatDate(compte.date_creation) },
    { label: 'Succursale', value: getSuccursaleLabel(compte.succursale) || compte.succursale },
    { label: 'Duree', value: compte.duree },
    { label: 'Person allowed', value: compte.person_allowed },
    { label: 'Piece allowed', value: compte.piece_identification_allowed },
    { label: 'NIF/CIN allowed', value: compte.nif_cin_allowed },
    { label: 'Photo chauffeur', value: clientPhotoUrl ? 'Disponible' : 'Aucune' },
    { label: 'Photo moto / autorisée', value: motoPhotoUrl ? 'Disponible' : 'Aucune' },
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
              <p className="text-xs uppercase tracking-wide text-blue-700">Client lié (Chauffeur)</p>
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-full overflow-hidden bg-white border border-blue-200 flex items-center justify-center">
                    {clientPhotoUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto({ url: clientPhotoUrl, title: `Photo chauffeur - ${personne.prenom} ${personne.nom}` })}
                        className="h-full w-full cursor-zoom-in"
                        title="Agrandir la photo"
                      >
                        <img
                          src={clientPhotoUrl}
                          alt={`Photo ${personne.prenom} ${personne.nom}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <span className="text-xs text-blue-700 text-center px-1">Aucune photo</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-900">{personne.prenom} {personne.nom}</p>
                    <p className="text-xs text-blue-800">Code: {personne.code_client}</p>
                  </div>
                </div>
                {clientPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: clientPhotoUrl, title: `Photo chauffeur - ${personne.prenom} ${personne.nom}` })}
                    className="text-xs text-blue-700 hover:text-blue-900 bg-white px-3 py-1.5 rounded-lg border border-blue-200 self-start sm:self-auto shadow-sm"
                  >
                    Voir photo chauffeur
                  </button>
                )}
              </div>
            </div>
          )}

          {canViewBalances && (syncSummary.pendingCount > 0 || syncSummary.failedCount > 0) && (
            <div className={`mb-6 p-3 rounded-lg border ${syncSummary.failedCount > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <p className="text-sm font-semibold">
                {syncSummary.failedCount > 0 ? 'Synchronisation a corriger' : 'Operation en attente de synchronisation'}
              </p>
              <p className="mt-1 text-xs">
                Solde confirme: {syncSummary.confirmedBalanceEstimate.toFixed(2)} HTG
                {syncSummary.pendingCount > 0 ? ` | Apres attente: ${syncSummary.projectedBalance.toFixed(2)} HTG` : ''}
              </p>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wide text-gray-700 font-semibold">Photo du titulaire (Chauffeur)</p>
                {clientPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: clientPhotoUrl, title: `Photo du titulaire / Chauffeur - ${personne?.prenom || ''} ${personne?.nom || ''}` })}
                    className="text-xs text-blue-700 hover:text-blue-900 font-medium"
                  >
                    Agrandir
                  </button>
                )}
              </div>
              <div className="h-44 rounded-md overflow-hidden bg-white border border-gray-200 flex items-center justify-center">
                {clientPhotoUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: clientPhotoUrl, title: `Photo du titulaire / Chauffeur - ${personne?.prenom || ''} ${personne?.nom || ''}` })}
                    className="h-full w-full group relative cursor-zoom-in"
                  >
                    <img src={clientPhotoUrl} alt="Photo titulaire" className="h-full w-full object-cover group-hover:opacity-90 transition" />
                    <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded shadow">🔍 Agrandir</span>
                  </button>
                ) : (
                  <span className="text-sm text-gray-500">Aucune photo disponible</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wide text-gray-700 font-semibold">Photo de la moto / Personne autorisée</p>
                {motoPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: motoPhotoUrl, title: `Photo de la moto / Personne autorisée - Compte ${compte.no_compte}` })}
                    className="text-xs text-indigo-700 hover:text-indigo-900 font-medium"
                  >
                    Agrandir
                  </button>
                )}
              </div>
              <div className="h-44 rounded-md overflow-hidden bg-white border border-gray-200 flex items-center justify-center">
                {motoPhotoUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: motoPhotoUrl, title: `Photo de la moto / Personne autorisée - Compte ${compte.no_compte}` })}
                    className="h-full w-full group relative cursor-zoom-in"
                  >
                    <img src={motoPhotoUrl} alt="Photo personne autorisee" className="h-full w-full object-cover group-hover:opacity-90 transition" />
                    <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded shadow">🔍 Agrandir</span>
                  </button>
                ) : (
                  <span className="text-sm text-gray-500">Aucune photo disponible</span>
                )}
              </div>
            </div>
          </div>

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
                  <p className="text-xs text-gray-600">Type: {formatCreditAccountType(credit.type_compte_credit)}</p>
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

        {/* Modal de prévisualisation de photo */}
        {previewPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            onClick={() => setPreviewPhoto(null)}
          >
            <div
              className="relative max-w-2xl w-full bg-white rounded-xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-900 truncate pr-4">{previewPhoto.title}</h3>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-200 text-sm font-bold"
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 flex items-center justify-center bg-gray-900 min-h-[300px]">
                <img
                  src={previewPhoto.url}
                  alt={previewPhoto.title}
                  className="max-h-[75vh] w-auto max-w-full object-contain rounded"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </SecureWrapper>
  );
};

export default CompteEpargneDetails;
