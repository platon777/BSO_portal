import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { canAccessAdminReports } from '../../types/auth';
import {
  fetchInvitationCodes,
  generateInvitationCode,
  revokeInvitationCode,
  InvitationCodeRecord,
} from '../../services/invitationService';
import { isOnline } from '../../services/supabase';
import { RefreshCwIcon, CheckIcon, TrashIcon } from '../icons/Icons';
import toast from 'react-hot-toast';

const getRoleLabel = (role: number) => {
  switch (role) {
    case 1:
      return { label: 'Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' };
    case 2:
      return { label: 'Manager', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    case 3:
      return { label: 'Agent de terrain', color: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 5:
      return { label: 'Finance', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    default:
      return { label: 'Agent', color: 'bg-gray-100 text-gray-800 border-gray-200' };
  }
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const InvitationCodesPanel: React.FC = () => {
  const { profile } = useAuthStore();
  const isAdminOrManager = canAccessAdminReports(profile?.role);

  const [codes, setCodes] = useState<InvitationCodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Formulaire de génération
  const [selectedRole, setSelectedRole] = useState<number>(3); // Défaut: Agent
  const [agentNote, setAgentNote] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number>(14);

  // Code récemment généré (pour affichage modal/focus)
  const [latestGenerated, setLatestGenerated] = useState<{
    code: string;
    role: number;
    expires_at: string;
    note?: string;
  } | null>(null);

  const loadCodes = async () => {
    if (!isAdminOrManager) return;
    setLoading(true);
    try {
      const data = await fetchInvitationCodes();
      setCodes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCodes();
  }, [isAdminOrManager]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline()) {
      toast.error('Connexion Internet requise pour générer un code.');
      return;
    }

    setGenerating(true);
    const toastId = toast.loading('Génération du code d invitation en cours...');

    try {
      const res = await generateInvitationCode(selectedRole, agentNote, expiresInDays);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Impossible de générer le code.');
      }

      toast.success('Code d invitation généré avec succès !', { id: toastId });
      setLatestGenerated(res.data);
      setAgentNote('');
      await loadCodes();
    } catch (err: any) {
      toast.error('Erreur : ' + (err?.message || 'Échec'), { id: toastId });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Code ${code} copié dans le presse-papier !`);
  };

  const handleCopyFullMessage = (item: { code: string; role: number; expires_at: string }) => {
    const roleInfo = getRoleLabel(item.role);
    const expDate = formatDate(item.expires_at);
    const message = `Bonjour,\n\nVoici votre code d'invitation officiel pour créer votre compte sur le portail BSO :\n👉 Code : ${item.code}\n👉 Rôle : ${roleInfo.label}\n👉 Valable jusqu'au : ${expDate}\n\nRendez-vous sur la page d'inscription et saisissez ce code pour activer votre accès.`;

    navigator.clipboard.writeText(message);
    toast.success('Message d invitation complet copié ! Prêt à être envoyé par WhatsApp / SMS.');
  };

  const handleRevoke = async (codeId: string, codeStr: string) => {
    const ok = window.confirm(`Voulez-vous révoquer le code d'invitation ${codeStr} ?`);
    if (!ok) return;

    try {
      const success = await revokeInvitationCode(codeId);
      if (success) {
        toast.success(`Code ${codeStr} révoqué avec succès.`);
        setCodes((prev) => prev.filter((c) => c.id !== codeId));
        if (latestGenerated?.code === codeStr) setLatestGenerated(null);
      } else {
        toast.error('Impossible de révoquer ce code.');
      }
    } catch (err: any) {
      toast.error('Erreur : ' + err.message);
    }
  };

  if (!isAdminOrManager) {
    return null;
  }

  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm mb-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>🎟️</span> Codes d'Invitation des Agents & Staff
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Générez des codes d'accès uniques pour autoriser l'inscription de vos agents de manière sécurisée.
          </p>
        </div>
        <button
          onClick={loadCodes}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 min-h-[36px] self-start sm:self-center"
        >
          <RefreshCwIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Formulaire de génération */}
      <form onSubmit={handleGenerate} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <span>⚡</span> Générer un nouveau code d'invitation
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Rôle attribué */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Rôle attribué :</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(Number(e.target.value))}
              className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[44px]"
            >
              <option value={3}>Agent de terrain</option>
              <option value={2}>Manager</option>
              <option value={5}>Finance</option>
              {profile?.role === 1 && <option value={1}>Administrateur</option>}
            </select>
          </div>

          {/* Validité */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Durée de validité :</label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[44px]"
            >
              <option value={7}>7 jours</option>
              <option value={14}>14 jours</option>
              <option value={30}>30 jours</option>
            </select>
          </div>

          {/* Note / Destinataire */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Destinataire (optionnel) :</label>
            <input
              type="text"
              value={agentNote}
              onChange={(e) => setAgentNote(e.target.value)}
              placeholder="Ex: Jean Pierre - Agent Nord"
              className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[44px]"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={generating}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-sm disabled:opacity-50 min-h-[44px] flex items-center gap-2"
          >
            <span>⚡</span>
            <span>{generating ? 'Génération…' : 'Créer le code d invitation'}</span>
          </button>
        </div>
      </form>

      {/* Bannière du code récemment généré */}
      {latestGenerated && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-emerald-600 text-white rounded-full text-xs">✔</span>
              <h4 className="font-bold text-emerald-900 text-sm sm:text-base">
                Code généré avec succès pour {getRoleLabel(latestGenerated.role).label} !
              </h4>
            </div>
            <button
              onClick={() => setLatestGenerated(null)}
              className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold p-1"
            >
              ✕ Fermer
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-emerald-200">
            <div className="font-mono text-xl sm:text-2xl font-extrabold text-emerald-900 tracking-widest text-center sm:text-left">
              {latestGenerated.code}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyCode(latestGenerated.code)}
                className="flex-1 sm:flex-none px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg min-h-[38px] flex items-center justify-center gap-1.5"
              >
                <span>📋</span> Copier le code
              </button>
              <button
                type="button"
                onClick={() => handleCopyFullMessage(latestGenerated)}
                className="flex-1 sm:flex-none px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg min-h-[38px] flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>📲</span> Copier le message WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste des codes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">
            Historique des codes ({codes.length})
          </h3>
          <span className="text-xs text-gray-500">
            {codes.filter((c) => !c.is_used && new Date(c.expires_at) > new Date()).length} code(s) actif(s)
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chargement des codes...</div>
        ) : codes.length === 0 ? (
          <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-lg text-sm border border-gray-200">
            Aucun code d invitation généré pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-100 text-gray-700 font-semibold border-b">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Rôle</th>
                  <th className="p-3">Destinataire / Note</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Créé le</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {codes.map((item) => {
                  const isExpired = new Date(item.expires_at) < new Date();
                  const roleBadge = getRoleLabel(item.role);

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Code */}
                      <td className="p-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{item.code}</span>
                          {!item.is_used && !isExpired && (
                            <button
                              onClick={() => handleCopyCode(item.code)}
                              className="text-gray-400 hover:text-blue-600 p-0.5"
                              title="Copier le code"
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Rôle */}
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${roleBadge.color}`}>
                          {roleBadge.label}
                        </span>
                      </td>

                      {/* Note */}
                      <td className="p-3 text-gray-600">{item.note || '-'}</td>

                      {/* Statut */}
                      <td className="p-3 whitespace-nowrap">
                        {item.is_used ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            <CheckIcon className="w-3 h-3" />
                            <span>Utilisé par {item.used_by_name || 'Agent'}</span>
                          </span>
                        ) : isExpired ? (
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                            Expiré
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            Actif (Prêt)
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(item.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        {!item.is_used && !isExpired ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleCopyFullMessage(item)}
                              className="px-2 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200"
                              title="Copier message complet"
                            >
                              📲 Partager
                            </button>
                            <button
                              onClick={() => handleRevoke(item.id, item.code)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Révoquer ce code"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvitationCodesPanel;
