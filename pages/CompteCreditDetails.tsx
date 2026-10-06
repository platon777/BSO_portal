import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { copyToClipboard } from '../utils/clipboard';
import SecureWrapper from '../components/common/SecureWrapper';
import { getCreditFinalCapital } from '../utils/creditCalculations';
import { useAuthStore } from '../stores/authStore';
import { canAccessAdminReports } from '../types/auth';
import { buildCreditAccountSyncSummary } from '../services/creditAccountService';
import { formatCreditAccountType } from '../utils/creditTypes';
import { normalizePhotoUrl } from '../utils/photoUtils';

interface CompteCreditDetailsProps {
  compteId: string;
  onBack: () => void;
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

const normalizeRatePercent = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num > 0 && num < 1) return num * 100;
  if (num > 100 && num <= 10000) return num / 100;
  return num;
};

const CompteCreditDetails: React.FC<CompteCreditDetailsProps> = ({ compteId, onBack }) => {
  const { profile } = useAuthStore();
  const canViewBalances = canAccessAdminReports(profile?.role);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const data = useLiveQuery(async () => {
    const safeCompteId = typeof compteId === 'string' ? compteId.trim() : '';
    if (!safeCompteId) {
      return { missing: true as const };
    }

    const compte = await db.comptes_credit.get(safeCompteId);
    if (!compte) {
      return { missing: true as const };
    }

    const [personne, compteEpargne, transactions, queueItems] = await Promise.all([
      compte.id_personne ? db.personnes.get(compte.id_personne) : Promise.resolve(undefined),
      compte.id_compte_epargne ? db.comptes_epargne.get(compte.id_compte_epargne) : Promise.resolve(undefined),
      db.transactions_credit.where('id_compte_credit').equals(safeCompteId).toArray(),
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
      compteEpargne,
      transactions,
      syncSummary: buildCreditAccountSyncSummary(compte, queueItems),
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
            Retour vers credit
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-700">Compte credit introuvable.</div>
        </div>
      </SecureWrapper>
    );
  }

  const { compte, personne, compteEpargne, transactions, syncSummary } = data;
  const clientPhotoUrl = normalizePhotoUrl(personne?.photo_identification);
  const motoPhotoUrl = normalizePhotoUrl(compteEpargne?.photo_personne_autorisee || compteEpargne?.photo_allowed);

  const totalRembourse = syncSummary.confirmedPaidEstimate;
  const capitalFinal = getCreditFinalCapital(compte);
  const montantRestant = syncSummary.confirmedRemainingEstimate;

  const detailItems: Array<{ label: string; value: unknown }> = [
    { label: 'ID compte', value: compte.id_compte_credit },
    { label: 'ID personne', value: compte.id_personne },
    { label: 'Numero compte', value: compte.no_compte },
    { label: 'Code ancien', value: compte.ancien_code },
    { label: 'Type compte credit', value: formatCreditAccountType(compte.type_compte_credit) },
    { label: 'ID compte epargne', value: compte.id_compte_epargne },
    { label: 'Montant prete', value: compte.montant_prete },
    { label: 'Capital final calcule', value: capitalFinal },
    { label: 'Taux interet mensuel (%)', value: normalizeRatePercent(compte.taux_interet) },
    { label: 'Paiement journalier', value: compte.paiement_journalier },
    { label: 'Duree (mois)', value: compte.duree_credit_mois },
    { label: 'Penalites', value: compte.penalites },
    ...(canViewBalances ? [
      { label: 'Paiement rembourse', value: compte.paiement_rembourse },
      { label: 'Montant deja paye manuellement', value: compte.montant_deja_paye_manuellement },
      { label: 'Total rembourse', value: totalRembourse },
      { label: 'Montant restant', value: montantRestant },
    ] : []),
    { label: 'Date creation metier', value: formatDate(compte.date_creation) },
    { label: 'Statut', value: compte.statut },
    { label: 'Cree le', value: formatDate(compte.created_at) },
    { label: 'Cree par', value: compte.created_by },
    { label: 'Modifie le', value: formatDate(compte.updated_at) },
    { label: 'Modifie par', value: compte.updated_by },
    { label: 'Photo chauffeur', value: clientPhotoUrl ? 'Disponible' : 'Aucune' },
    { label: 'Photo moto / garantie', value: motoPhotoUrl ? 'Disponible' : 'Aucune' },
  ];

  return (
    <SecureWrapper>
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200">
          Retour vers credit
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Compte credit</h1>
              <button type="button" onClick={() => copyToClipboard(compte.no_compte, 'Numero de compte')} className="font-mono text-sm text-blue-700 hover:text-blue-900">
                {compte.no_compte || '-'}
              </button>
            </div>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : (compte.statut === 'Paye' || compte.statut === 'Payé') ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {compte.statut || 'N/A'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {personne && (
              <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
                <p className="text-xs uppercase tracking-wide text-blue-700">Client lie</p>
                <p className="text-sm font-semibold text-blue-900">{personne.prenom} {personne.nom}</p>
                <p className="text-xs text-blue-800">Code: {personne.code_client}</p>
              </div>
            )}
            {compteEpargne && (
              <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50">
                <p className="text-xs uppercase tracking-wide text-indigo-700">Compte epargne lie</p>
                <p className="text-sm font-semibold text-indigo-900">{compteEpargne.no_compte}</p>
                {canViewBalances && <p className="text-xs text-indigo-800">Solde: {(compteEpargne.solde_actuel ?? 0).toFixed(2)} HTG</p>}
              </div>
            )}
          </div>

          {canViewBalances && (syncSummary.pendingCount > 0 || syncSummary.failedCount > 0) && (
            <div className={`mb-6 p-3 rounded-lg border ${syncSummary.failedCount > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <p className="text-sm font-semibold">
                {syncSummary.failedCount > 0 ? 'Synchronisation credit a corriger' : 'Remboursement en attente de synchronisation'}
              </p>
              <p className="mt-1 text-xs">
                Rembourse confirme: {syncSummary.confirmedPaidEstimate.toFixed(2)} HTG | Restant confirme: {syncSummary.confirmedRemainingEstimate.toFixed(2)} HTG
                {syncSummary.pendingCount > 0 ? ` | Restant apres attente: ${syncSummary.projectedRemaining.toFixed(2)} HTG` : ''}
              </p>
            </div>
          )}

          {/* Section Photos Chauffeur et Moto */}
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wide text-gray-700 font-semibold">Photo du titulaire (Chauffeur)</p>
                {clientPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: clientPhotoUrl, title: `Photo chauffeur - ${personne?.prenom || ''} ${personne?.nom || ''}` })}
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
                    onClick={() => setPreviewPhoto({ url: clientPhotoUrl, title: `Photo chauffeur - ${personne?.prenom || ''} ${personne?.nom || ''}` })}
                    className="h-full w-full group relative cursor-zoom-in"
                  >
                    <img src={clientPhotoUrl} alt="Photo chauffeur" className="h-full w-full object-cover group-hover:opacity-90 transition" />
                    <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded shadow">🔍 Agrandir</span>
                  </button>
                ) : (
                  <span className="text-sm text-gray-500">Aucune photo disponible</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wide text-gray-700 font-semibold">Photo de la moto / Garantie</p>
                {motoPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: motoPhotoUrl, title: `Photo de la moto / Garantie - Compte ${compte.no_compte}` })}
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
                    onClick={() => setPreviewPhoto({ url: motoPhotoUrl, title: `Photo de la moto / Garantie - Compte ${compte.no_compte}` })}
                    className="h-full w-full group relative cursor-zoom-in"
                  >
                    <img src={motoPhotoUrl} alt="Photo moto" className="h-full w-full object-cover group-hover:opacity-90 transition" />
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
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Transactions credit ({transactions.length})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                  {canViewBalances && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Solde avant</th>}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Versement declare</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <tr key={tx.id_transaction_credit}>
                    <td className="px-3 py-2 text-sm text-gray-700">{formatDate(tx.date_transaction)}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{tx.type_transaction}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 font-medium">{formatValue(tx.montant)}</td>
                    {canViewBalances && <td className="px-3 py-2 text-sm text-gray-700">{formatValue(tx.solde_avant_transaction)}</td>}
                    <td className="px-3 py-2 text-sm text-gray-700">{formatValue(tx.versement_declare)}</td>
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

export default CompteCreditDetails;
