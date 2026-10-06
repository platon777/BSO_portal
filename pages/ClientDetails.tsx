import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { copyToClipboard } from '../utils/clipboard';
import SecureWrapper from '../components/common/SecureWrapper';
import { getCreditFinalCapital } from '../utils/creditCalculations';
import { useAuthStore } from '../stores/authStore';
import { canAccessAdminReports } from '../types/auth';
import { formatCreditAccountType } from '../utils/creditTypes';
import { normalizePhotoUrl } from '../utils/photoUtils';

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
  const { profile } = useAuthStore();
  const canViewBalances = canAccessAdminReports(profile?.role);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const [clientPhotoError, setClientPhotoError] = useState(false);

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
  const clientPhotoUrl = normalizePhotoUrl(client.photo_identification);

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
    { label: 'Photo chauffeur / client', value: clientPhotoUrl ? 'Disponible' : 'Aucune' },
  ];

  return (
    <SecureWrapper>
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200">
          Retour vers clients
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            {clientPhotoUrl && !clientPhotoError ? (
              <button
                type="button"
                onClick={() => setPreviewPhoto({ url: clientPhotoUrl, title: `Photo chauffeur / client - ${client.prenom} ${client.nom}` })}
                className="relative group cursor-zoom-in focus:outline-none"
                title="Cliquer pour agrandir la photo du chauffeur"
              >
                <img
                  src={clientPhotoUrl}
                  alt={`${client.prenom} ${client.nom}`}
                  className="w-20 h-20 rounded-full object-cover border-2 border-blue-500 shadow-sm transition group-hover:opacity-90"
                  onError={() => setClientPhotoError(true)}
                />
                <span className="absolute bottom-0 right-0 bg-blue-600 text-white rounded-full p-1 text-[10px] shadow" title="Agrandir">🔍</span>
              </button>
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xl font-semibold border border-gray-300">
                {(client.prenom?.[0] || '') + (client.nom?.[0] || '')}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{client.prenom} {client.nom}</h1>
                {clientPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: clientPhotoUrl, title: `Photo chauffeur / client - ${client.prenom} ${client.nom}` })}
                    className="text-xs text-blue-700 hover:text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                  >
                    Voir photo
                  </button>
                )}
              </div>
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
              {comptesEpargne.map((compte) => {
                const epargneMotoPhoto = normalizePhotoUrl(compte.photo_personne_autorisee || compte.photo_allowed);
                return (
                  <div key={compte.id_compte_epargne} className="p-3 rounded-lg border border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900">{compte.no_compte || '-'}</p>
                      {canViewBalances && <p className="text-xs text-gray-600">Solde: {(compte.solde_actuel ?? 0).toFixed(2)} HTG</p>}
                      {epargneMotoPhoto && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto({ url: epargneMotoPhoto, title: `Photo moto / personne autorisée - Compte ${compte.no_compte}` })}
                            className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 transition"
                          >
                            <img src={epargneMotoPhoto} alt="Moto" className="w-5 h-5 rounded object-cover" />
                            <span>Photo moto</span>
                          </button>
                        </div>
                      )}
                    </div>
                    {onOpenEpargneDetails && (
                      <button
                        type="button"
                        onClick={() => onOpenEpargneDetails(compte.id_compte_epargne)}
                        className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 self-start sm:self-auto"
                      >
                        Voir details
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Comptes credit ({comptesCredit.length})</h2>
            <div className="space-y-2">
              {comptesCredit.length === 0 && <p className="text-sm text-gray-600">Aucun compte credit.</p>}
              {comptesCredit.map((compte) => {
                const linkedEpargne = comptesEpargne.find(e => e.id_compte_epargne === compte.id_compte_epargne);
                const creditMotoPhoto = normalizePhotoUrl(linkedEpargne?.photo_personne_autorisee || linkedEpargne?.photo_allowed);
                return (
                  <div key={compte.id_compte_credit} className="p-3 rounded-lg border border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900">{compte.no_compte || '-'}</p>
                      <p className="text-xs text-gray-600">Type: {formatCreditAccountType(compte.type_compte_credit)}</p>
                      <p className="text-xs text-gray-600">Capital final: {getCreditFinalCapital(compte).toFixed(2)} HTG</p>
                      {creditMotoPhoto && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto({ url: creditMotoPhoto, title: `Photo moto / personne autorisée - Crédit ${compte.no_compte}` })}
                            className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 transition"
                          >
                            <img src={creditMotoPhoto} alt="Moto" className="w-5 h-5 rounded object-cover" />
                            <span>Photo moto</span>
                          </button>
                        </div>
                      )}
                    </div>
                    {onOpenCreditDetails && (
                      <button
                        type="button"
                        onClick={() => onOpenCreditDetails(compte.id_compte_credit)}
                        className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 self-start sm:self-auto"
                      >
                        Voir details
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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

export default ClientDetails;
