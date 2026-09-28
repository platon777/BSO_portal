import React, { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { canManageInvitations } from '../../types/auth';
import {
  fetchAllUsersWithProfiles,
  adminGenerateRecoveryLink,
  adminSendRecoveryEmail,
  AdminUserListItem,
  RecoveryLinkResult,
} from '../../services/passwordResetService';
import { isOnline } from '../../services/supabase';
import { RefreshCwIcon, CheckIcon } from '../icons/Icons';
import toast from 'react-hot-toast';

const getRoleBadge = (role: number) => {
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
      return { label: 'Non défini', color: 'bg-gray-100 text-gray-800 border-gray-200' };
  }
};

const UsersPasswordManagementPanel: React.FC = () => {
  const { profile } = useAuthStore();
  const isAdminOrManager = canManageInvitations(profile?.role);

  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modal result state for generated link
  const [activeResult, setActiveResult] = useState<{
    email: string;
    action_link?: string;
    email_otp?: string;
  } | null>(null);

  // Custom email input for manual generation
  const [customEmail, setCustomEmail] = useState('');
  const [processingEmail, setProcessingEmail] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadUsers = async () => {
    if (!isAdminOrManager) return;
    setLoading(true);
    try {
      const data = await fetchAllUsersWithProfiles();
      setUsers(data);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [isAdminOrManager]);

  // Filter users by search and role
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.firstname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole =
        roleFilter === 'all' || String(u.role) === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const handleGenerateLink = async (email: string) => {
    if (!isOnline()) {
      toast.error('Connexion Internet requise.');
      return;
    }

    setProcessingEmail(email);
    const toastId = toast.loading('Génération du lien de réinitialisation...');

    try {
      const res = await adminGenerateRecoveryLink(email);

      if (!res.success || !res.action_link) {
        throw new Error(res.error || 'Échec de la génération du lien.');
      }

      // Automatically copy to clipboard if supported
      try {
        await navigator.clipboard.writeText(res.action_link);
        toast.success('Lien copié dans le presse-papier !', { id: toastId });
      } catch {
        toast.success('Lien généré avec succès !', { id: toastId });
      }

      setActiveResult({
        email,
        action_link: res.action_link,
        email_otp: res.email_otp,
      });
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la génération.', { id: toastId });
    } finally {
      setProcessingEmail(null);
    }
  };

  const handleSendEmail = async (email: string) => {
    if (!isOnline()) {
      toast.error('Connexion Internet requise.');
      return;
    }

    setProcessingEmail(email);
    const toastId = toast.loading(`Envoi de l'email à ${email}...`);

    try {
      const res = await adminSendRecoveryEmail(email);

      if (!res.success) {
        throw new Error(res.error || 'Échec de l envoi.');
      }

      toast.success(res.message || 'Email envoyé avec succès !', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l envoi.', { id: toastId });
    } finally {
      setProcessingEmail(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      toast.success('Lien copié dans le presse-papier !');
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      toast.error('Impossible de copier automatiquement.');
    }
  };

  if (!isAdminOrManager) {
    return null;
  }

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md mb-6 border border-gray-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-gray-200 mb-6 gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span>🔑</span> Gestion des Utilisateurs & Réinitialisation de Mot de Passe
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Générez un lien direct pour permettre à un utilisateur (ex: Filias) de réinitialiser son mot de passe ou envoyez-lui un email.
          </p>
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          className="flex items-center justify-center px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition min-h-[44px] self-start sm:self-auto"
        >
          <RefreshCwIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Manual Email Reset Generator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
          <span>⚡</span> Génération rapide pour n'importe quelle adresse email
        </h3>
        <p className="text-xs text-blue-700 mb-3">
          Entrez l'adresse email d'un compte utilisateur pour générer son lien direct sans le chercher dans la liste.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            placeholder="ex: filiasronsteve@gmail.com ou fili@gmail.com"
            value={customEmail}
            onChange={(e) => setCustomEmail(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <div className="flex gap-2">
            <button
              onClick={() => customEmail && handleGenerateLink(customEmail)}
              disabled={!customEmail || processingEmail === customEmail}
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition min-h-[40px] flex items-center justify-center"
            >
              Générer lien direct
            </button>
            <button
              onClick={() => customEmail && handleSendEmail(customEmail)}
              disabled={!customEmail || processingEmail === customEmail}
              className="flex-1 sm:flex-none px-3 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md disabled:bg-gray-200 transition min-h-[40px] flex items-center justify-center"
            >
              Envoyer email
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Rechercher par nom, prénom ou email (ex: filias, cedrick)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">Tous les rôles</option>
            <option value="1">Admin</option>
            <option value="2">Manager</option>
            <option value="3">Agent de terrain</option>
            <option value="5">Finance</option>
          </select>
        </div>
      </div>

      {/* Users Table / Cards */}
      {loading ? (
        <div className="py-8 text-center text-gray-500 flex items-center justify-center gap-2">
          <RefreshCwIcon className="w-5 h-5 animate-spin text-blue-600" />
          Chargement des utilisateurs...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-lg">
          Aucun utilisateur trouvé {searchQuery && `pour "${searchQuery}"`}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Utilisateur</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Rôle</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Actions mot de passe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredUsers.map((u) => {
                const badge = getRoleBadge(u.role);
                const isProcessing = processingEmail === u.email;

                return (
                  <tr key={u.id || u.user_id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">
                        {u.firstname} {u.name}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleGenerateLink(u.email)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 transition flex items-center gap-1 min-h-[36px]"
                          title="Générer et copier un lien direct à partager"
                        >
                          <span>📋</span>
                          {isProcessing ? 'Génération...' : 'Copier lien direct'}
                        </button>
                        <button
                          onClick={() => handleSendEmail(u.email)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 disabled:opacity-50 transition flex items-center gap-1 min-h-[36px]"
                          title="Envoyer le lien par email"
                        >
                          <span>✉️</span>
                          Envoyer email
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal with Link Details & Share Options */}
      {activeResult && activeResult.action_link && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-green-600">✅</span> Lien de réinitialisation prêt
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Pour l'utilisateur : <strong>{activeResult.email}</strong>
                </p>
              </div>
              <button
                onClick={() => setActiveResult(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none p-1"
              >
                &times;
              </button>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
              Ce lien permet à l'utilisateur de définir immédiatement un nouveau mot de passe.
              Partagez-le directement via WhatsApp, SMS ou message privé.
            </div>

            {/* Link Container */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Lien direct de récupération :</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-lg p-2.5">
                <input
                  type="text"
                  readOnly
                  value={activeResult.action_link}
                  className="w-full bg-transparent text-xs text-gray-800 font-mono outline-none select-all"
                />
              </div>
            </div>

            {/* Action buttons in Modal */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={() => copyToClipboard(activeResult.action_link!)}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
              >
                {copiedLink ? <CheckIcon className="w-4 h-4" /> : null}
                {copiedLink ? 'Copié !' : 'Copier dans le presse-papier'}
              </button>

              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `Bonjour, voici votre lien pour réinitialiser votre mot de passe sur le portail BSO : ${activeResult.action_link}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition shadow-sm text-center"
              >
                <span>💬</span>
                Envoyer sur WhatsApp
              </a>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => setActiveResult(null)}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPasswordManagementPanel;
