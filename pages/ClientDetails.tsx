import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { copyToClipboard } from '../utils/clipboard';
import SecureWrapper from '../components/common/SecureWrapper';

interface ClientDetailsProps {
  clientId: string;
  onBack: () => void;
  onOpenEpargneDetails?: (id: string) => void;
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
  return String(value);
};

const ClientDetails: React.FC<ClientDetailsProps> = ({ clientId, onBack, onOpenEpargneDetails, onOpenCreditDetails }) => {
  const data = useLiveQuery(async () => {
    const client = await db.personnes.get(clientId);
    if (!client) {
      return { missing: true as const };
    }

    const [comptesEpargne, comptesCredit] = await Promise.all([
      db.comptes_epargne.where('id_personne').equals(clientId).toArray(),
      db.comptes_credit.where('id_personne').equals(clientId).toArray(),
    ]);

    return {
      missing: false as const,
      client,
      comptesEpargne,
      comptesCredit,
    };
  }, [clientId], undefined);

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
            Retour vers clients
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-700">Client introuvable.</div>
        </div>
      </SecureWrapper>
    );
  }

  const { client, comptesEpargne, comptesCredit } = data;

  const detailItems: Array<{ label: string; value: unknown }> = [
    { label: 'ID client', value: client.id_personne },
    { label: 'Code client', value: client.code_client },
    { label: 'Code client ancien', value: client.code_client_ancien },
    { label: 'Prenom', value: client.prenom },
    { label: 'Nom', value: client.nom },
    { label: 'Pseudo', value: client.pseudo },
    { label: 'Sexe', value: client.sexe },
    { label: 'Date de naissance', value: client.date_naissance },
    { label: 'Telephone', value: client.numero_telephone },
    { label: 'Email', value: client.email },
    { label: 'NIF/CIN', value: client.nif_cin },
    { label: 'Piece identification', value: client.piece_identification },
    { label: 'Adresse', value: client.adresse },
    { label: 'Occupation', value: client.occupation },
    { label: 'Lieu de travail', value: client.lieu_de_travail },
    { label: 'Geocode', value: client.geocode },
    { label: 'Date creation metier', value: formatDate(client.date_creation) },
    { label: 'Statut', value: client.statut },
    { label: 'Unique ID', value: client.unique_id },
    { label: 'Cree le', value: formatDate(client.created_at) },
    { label: 'Cree par', value: client.created_by },
    { label: 'Modifie le', value: formatDate(client.updated_at) },
    { label: 'Modifie par', value: client.updated_by },
    { label: 'Photo', value: client.photo_identification ? 'Disponible' : 'Aucune' },
  ];

  return (
    <SecureWrapper>
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200">
          Retour vers clients
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            {client.photo_identification ? (
              <img src={client.photo_identification} alt={`${client.prenom} ${client.nom}`} className="w-20 h-20 rounded-full object-cover border border-gray-300" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xl font-semibold border border-gray-300">
                {(client.prenom?.[0] || '') + (client.nom?.[0] || '')}
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{client.prenom} {client.nom}</h1>
              <button type="button" onClick={() => copyToClipboard(client.code_client, 'Code client')} className="text-sm text-blue-700 hover:text-blue-900 font-mono">
                {client.code_client}
              </button>
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Comptes epargne ({comptesEpargne.length})</h2>
            <div className="space-y-2">
              {comptesEpargne.length === 0 && <p className="text-sm text-gray-600">Aucun compte epargne.</p>}
              {comptesEpargne.map((compte) => (
                <div key={compte.id_compte_epargne} className="p-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{compte.no_compte || '-'}</p>
                    <p className="text-xs text-gray-600">Solde: {(compte.solde_actuel ?? 0).toFixed(2)} HTG</p>
                  </div>
                  {onOpenEpargneDetails && (
                    <button
                      type="button"
                      onClick={() => onOpenEpargneDetails(compte.id_compte_epargne)}
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
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Comptes credit ({comptesCredit.length})</h2>
            <div className="space-y-2">
              {comptesCredit.length === 0 && <p className="text-sm text-gray-600">Aucun compte credit.</p>}
              {comptesCredit.map((compte) => (
                <div key={compte.id_compte_credit} className="p-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{compte.no_compte || '-'}</p>
                    <p className="text-xs text-gray-600">Montant prete: {(compte.montant_prete ?? 0).toFixed(2)} HTG</p>
                  </div>
                  {onOpenCreditDetails && (
                    <button
                      type="button"
                      onClick={() => onOpenCreditDetails(compte.id_compte_credit)}
                      className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                    >
                      Voir details
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SecureWrapper>
  );
};

export default ClientDetails;
