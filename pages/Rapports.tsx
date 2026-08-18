import React, { useEffect, useState } from 'react';
import AgentStatsPanel from '../components/stats/AgentStatsPanel';
import { useAuthStore } from '../stores/authStore';
import { UserRole } from '../types/auth';
import { supabase } from '../services/supabase';
import { db } from '../services/database';

interface AgentOption {
  id: string;
  name: string;
}

/**
 * Page Rapports — statistiques et rapport de collecte.
 * - Pour les agents standards : affiche leur propre fiche de rapport en temps réel.
 * - Pour les admins/managers : permet de sélectionner et contrôler la fiche de rapport
 *   de n'importe quel agent afin de vérifier le cash physique remis sans erreur.
 */
const Rapports: React.FC = () => {
  const { profile } = useAuthStore();
  const isAdminOrManager = profile?.role === UserRole.ADMIN || profile?.role === UserRole.MANAGER;

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(profile?.user_id || '');
  const [selectedAgentName, setSelectedAgentName] = useState<string>(
    profile ? `${profile.firstname} ${profile.name}` : ''
  );
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    if (!isAdminOrManager) return;

    let isMounted = true;
    const loadAgents = async () => {
      setLoadingAgents(true);
      try {
        // 1. Essayer depuis Supabase profiles
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id, firstname, name')
          .order('firstname', { ascending: true });

        if (!error && data && data.length > 0) {
          if (isMounted) {
            const list: AgentOption[] = data
              .filter((p: any) => p.user_id)
              .map((p: any) => ({
                id: p.user_id,
                name: `${p.firstname || ''} ${p.name || ''}`.trim() || `Agent (${p.user_id.slice(0, 8)})`,
              }));
            setAgents(list);
          }
          return;
        }
      } catch {
        // Fallback local en cas de mode hors-ligne
      }

      try {
        // 2. Fallback Dexie local si hors-ligne
        const [epg, cred] = await Promise.all([
          db.transactions_epargne.toArray(),
          db.transactions_credit.toArray(),
        ]);
        const creatorIds = Array.from(new Set([...epg, ...cred].map((t) => t.created_by).filter(Boolean)));
        if (isMounted && creatorIds.length > 0) {
          const list: AgentOption[] = creatorIds.map((id) => ({
            id,
            name: id === profile?.user_id ? `${profile.firstname} ${profile.name}` : `Agent (${id.slice(0, 8)})`,
          }));
          setAgents(list);
        }
      } catch (err) {
        console.error('Erreur chargement agents:', err);
      } finally {
        if (isMounted) setLoadingAgents(false);
      }
    };

    loadAgents();

    return () => {
      isMounted = false;
    };
  }, [isAdminOrManager, profile]);

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgentId(agentId);
    const agent = agents.find((a) => a.id === agentId);
    if (agent) {
      setSelectedAgentName(agent.name);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
            {isAdminOrManager ? 'Fiche Rapport & Contrôle de Caisse' : 'Mon rapport'}
          </h1>
          <p className="text-sm text-gray-500">
            {isAdminOrManager
              ? "Contrôlez les montants collectés par chaque agent lors de la remise de caisse."
              : "Suivi en direct de vos collectes et opérations du jour."}
          </p>
        </div>

        {isAdminOrManager && (
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
            <label htmlFor="agent-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Agent :
            </label>
            <select
              id="agent-select"
              value={selectedAgentId}
              onChange={(e) => handleAgentSelect(e.target.value)}
              disabled={loadingAgents}
              className="p-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-w-[200px]"
            >
              {profile?.user_id && (
                <option value={profile.user_id}>
                  Moi-même ({profile.firstname} {profile.name})
                </option>
              )}
              {agents
                .filter((a) => a.id !== profile?.user_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      <AgentStatsPanel
        showHeader={false}
        targetUserId={selectedAgentId || profile?.user_id}
        targetUserName={selectedAgentName || (profile ? `${profile.firstname} ${profile.name}` : undefined)}
      />
    </div>
  );
};

export default Rapports;
