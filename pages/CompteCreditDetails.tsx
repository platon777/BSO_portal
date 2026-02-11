import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { copyToClipboard } from '../utils/clipboard';
import SecureWrapper from '../components/common/SecureWrapper';
import { getCreditFinalCapital, getCreditMontantRestant, getCreditTotalRembourse } from '../utils/creditCalculations';

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

const CompteCreditDetails: React.FC<CompteCreditDetailsProps> = ({ compteId, onBack }) => {
  const data = useLiveQuery(async () => {
    const safeCompteId = typeof compteId === 'string' ? compteId.trim() : '';
    if (!safeCompteId) {
      return { missing: true as const };
    }

    const compte = await db.comptes_credit.get(safeCompteId);
    if (!compte) {
      return { missing: true as const };
    }

    const [personne, compteEpargne, transactions] = await Promise.all([
      compte.id_personne ? db.personnes.get(compte.id_personne) : Promise.resolve(undefined),
      compte.id_compte_epargne ? db.comptes_epargne.get(compte.id_compte_epargne) : Promise.resolve(undefined),
      db.transactions_credit.where('id_compte_credit').equals(safeCompteId).toArray(),
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

  const { compte, personne, compteEpargne, transactions } = data;
  const totalRembourse = getCreditTotalRembourse(compte);
  const capitalFinal = getCreditFinalCapital(compte);
  const montantRestant = getCreditMontantRestant(compte);

  const detailItems: Array<{ label: string; value: unknown }> = [
    { label: 'ID compte', value: compte.id_compte_credit },
    { label: 'ID personne', value: compte.id_personne },
    { label: 'Numero compte', value: compte.no_compte },
    { label: 'Code ancien', value: compte.ancien_code },
    { label: 'ID compte epargne', value: compte.id_compte_epargne },
    { label: 'Montant prete', value: compte.montant_prete },
    { label: 'Capital final calcule', value: capitalFinal },
    { label: 'Taux interet (decimal)', value: compte.taux_interet },
    { label: 'Paiement journalier', value: compte.paiement_journalier },
    { label: 'Duree (mois)', value: compte.duree_credit_mois },
    { label: 'Fonds garantie', value: compte.fonds_garantie },
    { label: 'Penalites', value: compte.penalites },
    { label: 'Paiement rembourse', value: compte.paiement_rembourse },
    { label: 'Montant deja paye manuellement', value: compte.montant_deja_paye_manuellement },
    { label: 'Total rembourse', value: totalRembourse },
    { label: 'Montant restant', value: montantRestant },
    { label: 'Date creation metier', value: formatDate(compte.date_creation) },
    { label: 'Statut', value: compte.statut },
    { label: 'Cree le', value: formatDate(compte.created_at) },
    { label: 'Cree par', value: compte.created_by },
    { label: 'Modifie le', value: formatDate(compte.updated_at) },
    { label: 'Modifie par', value: compte.updated_by },
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
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : compte.statut === 'Paye' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
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
                <p className="text-xs text-indigo-800">Solde: {(compteEpargne.solde_actuel ?? 0).toFixed(2)} HTG</p>
              </div>
            )}
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Solde avant</th>
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
                    <td className="px-3 py-2 text-sm text-gray-700">{formatValue(tx.solde_avant_transaction)}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{formatValue(tx.versement_declare)}</td>
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

export default CompteCreditDetails;
