import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import { supabase, handleSupabaseError, isOnline } from '../../services/supabase';
import * as authService from '../../services/supabaseAuth';
import { useAuthStore } from '../../stores/authStore';
import { UserProfile, UserRole } from '../../types/auth';
import { db } from '../../services/database';
import { Personne } from '../../types';

type AccessGrantRow = {
  id: string;
  agent_id: string;
  client_id: string;
  granted_by: string;
  expires_at: string;
  created_at: string;
  transaction_id: string | null;
  transaction_credit_id: string | null;
  reason: string | null;
  scope_type: string | null;
  duration_minutes: number | null;
  agent_full_name: string | null;
  admin_full_name: string | null;
  client_full_name: string | null;
  client_code: string | null;
  resource_label: string | null;
  compte_epargne_id: string | null;
  compte_credit_id: string | null;
};

type AccessGrantAuditRow = {
  id: string;
  grant_id: string | null;
  event_type: 'GRANT' | 'REVOKE';
  agent_id: string | null;
  client_id: string | null;
  transaction_epargne_id: string | null;
  transaction_credit_id: string | null;
  granted_by: string | null;
  reason: string | null;
  created_at: string;
  scope_type: string | null;
  duration_minutes: number | null;
  expires_at: string | null;
  agent_full_name: string | null;
  admin_full_name: string | null;
  client_full_name: string | null;
  client_code: string | null;
  resource_label: string | null;
};

type AgentActionAuditRow = {
  id: string;
  occurred_at: string;
  actor_id: string;
  actor_full_name: string | null;
  action: 'UPDATE' | 'DELETE';
  target_table: string;
  target_id: string;
  scope_type: string;
  client_id: string | null;
  client_full_name: string | null;
  client_code: string | null;
  no_compte: string | null;
  transaction_type: string | null;
  grant_id: string | null;
  admin_id: string | null;
  admin_full_name: string | null;
};

const getScopeLabel = (scopeType?: string | null) => {
  switch (scopeType) {
    case 'transaction_credit':
      return 'Transaction crédit';
    case 'transaction_epargne':
      return 'Transaction épargne';
    case 'compte_credit':
      return 'Compte crédit';
    case 'compte_epargne':
      return 'Compte épargne';
    case 'personne':
      return 'Client';
    case 'client':
    default:
      return 'Client';
  }
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const AccessGrantsPanel: React.FC = () => {
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === UserRole.ADMIN;

  const [loading, setLoading] = useState(false);
  const [grants, setGrants] = useState<AccessGrantRow[]>([]);
  const [audit, setAudit] = useState<AccessGrantAuditRow[]>([]);
  const [agentActions, setAgentActions] = useState<AgentActionAuditRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const [showExpired, setShowExpired] = useState(false);

  const personnes = useLiveQuery(async () => db.personnes.toArray(), []);

  const personnesMap = useMemo(() => {
    const map = new Map<string, Personne>();
    (personnes || []).forEach((p) => map.set(p.id_personne, p));
    return map;
  }, [personnes]);

  useEffect(() => {
    if (!isAdmin) return;
    const loadProfiles = async () => {
      const result = await authService.fetchAllProfiles();
      if (!('message' in result)) {
        const map = new Map<string, string>();
        result.forEach((p: UserProfile) => {
          map.set(p.user_id, `${p.firstname} ${p.name}`);
        });
        setProfilesMap(map);
      }
    };
    loadProfiles();
  }, [isAdmin]);

  const getUserName = (userId: string | null | undefined) => {
    if (!userId) return '-';
    return profilesMap.get(userId) || userId.slice(0, 8);
  };

  const getClientLabel = (clientId: string | null | undefined, clientFullName?: string | null, clientCode?: string | null) => {
    if (clientFullName) {
      return clientCode ? `${clientFullName} (${clientCode})` : clientFullName;
    }
    if (!clientId) return '-';
    const client = personnesMap.get(clientId);
    if (!client) return clientId.slice(0, 8);
    return `${client.prenom} ${client.nom} (${client.code_client})`;
  };

  const refresh = async () => {
    if (!isAdmin) return;
    if (!isOnline()) {
      toast.error('Hors ligne: impossible de charger les acces.');
      return;
    }

    setLoading(true);
    try {
      const { data: grantsData, error: grantsError } = await supabase
        .from('temporary_access_grants')
        .select('id, agent_id, client_id, granted_by, expires_at, created_at, transaction_id, transaction_credit_id, reason, scope_type, duration_minutes, agent_full_name, admin_full_name, client_full_name, client_code, resource_label, compte_epargne_id, compte_credit_id')
        .order('created_at', { ascending: false })
        .limit(200);

      if (grantsError) {
        const err = handleSupabaseError(grantsError);
        toast.error(err.message);
      } else {
        setGrants((grantsData as AccessGrantRow[]) || []);
      }

      const { data: auditData, error: auditError } = await supabase
        .from('access_grant_audit')
        .select('id, grant_id, event_type, agent_id, client_id, transaction_epargne_id, transaction_credit_id, granted_by, reason, created_at, scope_type, duration_minutes, expires_at, agent_full_name, admin_full_name, client_full_name, client_code, resource_label')
        .order('created_at', { ascending: false })
        .limit(100);

      if (auditError) {
        const err = handleSupabaseError(auditError);
        toast.error(err.message);
      } else {
        setAudit((auditData as AccessGrantAuditRow[]) || []);
      }

      const { data: agentActionsData, error: agentActionsError } = await supabase
        .from('agent_action_audit')
        .select('id, occurred_at, actor_id, actor_full_name, action, target_table, target_id, scope_type, client_id, client_full_name, client_code, no_compte, transaction_type, grant_id, admin_id, admin_full_name')
        .order('occurred_at', { ascending: false })
        .limit(100);

      if (agentActionsError) {
        const err = handleSupabaseError(agentActionsError);
        toast.error(err.message);
      } else {
        setAgentActions((agentActionsData as AgentActionAuditRow[]) || []);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const now = Date.now();
  const visibleGrants = useMemo(() => {
    return grants.filter((g) => {
      const exp = new Date(g.expires_at).getTime();
      const isExpired = !exp || Number.isNaN(exp) ? true : exp <= now;
      return showExpired ? true : !isExpired;
    });
  }, [grants, showExpired, now]);

  const revokeGrant = async (grantId: string) => {
    if (!isOnline()) {
      toast.error('Hors ligne: impossible de revoquer.');
      return;
    }
    const { error } = await supabase.from('temporary_access_grants').delete().eq('id', grantId);
    if (error) {
      toast.error(handleSupabaseError(error).message);
      return;
    }
    toast.success('Acces revoque.');
    setGrants((prev) => prev.filter((g) => g.id !== grantId));
  };

  if (!isAdmin) return null;

  return (
    <div className="bg-white p-4 rounded-lg shadow-md mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Acces temporaires (Admin)</h2>
          <p className="text-sm text-gray-600">Qui a donne l'acces, a quel agent, pour quel client ou transaction.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(e) => setShowExpired(e.target.checked)}
            />
            Afficher expirés
          </label>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 min-h-[44px]"
          >
            {loading ? 'Chargement...' : 'Rafraichir'}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {visibleGrants.length === 0 ? (
          <div className="text-sm text-gray-500">Aucun acces {showExpired ? '' : 'actif'}.</div>
        ) : (
          visibleGrants.map((g) => {
            const exp = new Date(g.expires_at).getTime();
            const isExpired = !exp || Number.isNaN(exp) ? true : exp <= Date.now();
            return (
              <div key={g.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded">
                        {getScopeLabel(g.scope_type)}
                      </span>
                      <span className={`px-2 py-1 text-xs font-semibold rounded ${isExpired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {isExpired ? 'Expire' : 'Actif'}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">{g.id.slice(0, 8)}...</span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500 text-xs">Agent</span><div className="text-gray-900 truncate">{g.agent_full_name || getUserName(g.agent_id)}</div></div>
                      <div><span className="text-gray-500 text-xs">Admin</span><div className="text-gray-900 truncate">{g.admin_full_name || getUserName(g.granted_by)}</div></div>
                      <div className="sm:col-span-2"><span className="text-gray-500 text-xs">Client</span><div className="text-gray-900 truncate">{getClientLabel(g.client_id, g.client_full_name, g.client_code)}</div></div>
                      <div><span className="text-gray-500 text-xs">Debut</span><div className="text-gray-700">{formatDateTime(g.created_at)}</div></div>
                      <div><span className="text-gray-500 text-xs">Expiration</span><div className="text-gray-700">{formatDateTime(g.expires_at)}</div></div>
                      <div><span className="text-gray-500 text-xs">Durée</span><div className="text-gray-700">{g.duration_minutes ? `${g.duration_minutes} min` : '-'}</div></div>
                      <div><span className="text-gray-500 text-xs">Cible</span><div className="text-gray-700 truncate">{g.resource_label || '-'}</div></div>
                      {g.reason ? (
                        <div className="sm:col-span-2"><span className="text-gray-500 text-xs">Raison</span><div className="text-gray-800">{g.reason}</div></div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revokeGrant(g.id)}
                    className="shrink-0 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 min-h-[44px]"
                    title="Revoquer"
                  >
                    Revoquer
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-md font-semibold text-gray-800 mb-2">Historique (audit)</h3>
        {audit.length === 0 ? (
          <div className="text-sm text-gray-500">Aucun evenement.</div>
        ) : (
          <div className="max-h-64 overflow-y-auto overscroll-contain border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Durée</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cible</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Raison</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {audit.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDateTime(a.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${a.event_type === 'GRANT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {a.event_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-800">{a.agent_full_name || getUserName(a.agent_id)}</td>
                    <td className="px-3 py-2 text-gray-800">{a.admin_full_name || getUserName(a.granted_by)}</td>
                    <td className="px-3 py-2 text-gray-800">{getClientLabel(a.client_id, a.client_full_name, a.client_code)}</td>
                    <td className="px-3 py-2 text-gray-700">{getScopeLabel(a.scope_type)}</td>
                    <td className="px-3 py-2 text-gray-700">{a.duration_minutes ? `${a.duration_minutes} min` : '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{a.resource_label || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{a.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-md font-semibold text-gray-800 mb-2">Historique des actions (agents)</h3>
        {agentActions.length === 0 ? (
          <div className="text-sm text-gray-500">Aucune action enregistrée.</div>
        ) : (
          <div className="max-h-80 overflow-y-auto overscroll-contain border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Compte</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tx</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Admin (grant)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Grant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {agentActions.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDateTime(r.occurred_at)}</td>
                    <td className="px-3 py-2 text-gray-800">{r.actor_full_name || getUserName(r.actor_id)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${r.action === 'DELETE' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{getScopeLabel(r.scope_type)}</td>
                    <td className="px-3 py-2 text-gray-800">{getClientLabel(r.client_id, r.client_full_name, r.client_code)}</td>
                    <td className="px-3 py-2 text-gray-700">{r.no_compte || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{r.transaction_type || '-'}</td>
                    <td className="px-3 py-2 text-gray-800">{r.admin_full_name || getUserName(r.admin_id)}</td>
                    <td className="px-3 py-2 text-gray-700 font-mono">{r.grant_id ? `${r.grant_id.slice(0, 8)}...` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Note: les actions listées sont les UPDATE/DELETE réussis sur Supabase. Les INSERT ne sont pas journalisés.
        </p>
      </div>
    </div>
  );
};

export default AccessGrantsPanel;
