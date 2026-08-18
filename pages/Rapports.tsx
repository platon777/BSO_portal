import React, { useEffect, useState, useCallback } from 'react';
import AgentStatsPanel from '../components/stats/AgentStatsPanel';
import AgentSearchSelect, { AgentOption } from '../components/common/AgentSearchSelect';
import { useAuthStore } from '../stores/authStore';
import { canAccessAdminReports } from '../types/auth';
import { supabase } from '../services/supabase';
import { db } from '../services/database';

const CACHED_PROFILES_KEY = 'bso_cached_profiles';

/**
 * Page Rapports — statistiques et rapport de collecte.
 * - Pour les agents standards : affiche leur propre fiche de rapport en temps réel.
 * - Pour les admins/managers/finance : sélecteur de recherche d'agent responsive
 *   permettant de contrôler immédiatement la fiche de n'importe quel agent lors de la remise de caisse.
 */
const Rapports: React.FC = () => {
  const { profile } = useAuthStore();
  const isAdminOrManager = canAccessAdminReports(profile?.role);

  const [agents, setAgents] = useState<AgentOption[]>(() => {
    try {
      const cached = localStorage.getItem(CACHED_PROFILES_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [selectedAgentId, setSelectedAgentId] = useState<string>(profile?.user_id || '');
  const [selectedAgentName, setSelectedAgentName] = useState<string>(
    profile ? `${profile.firstname || ''} ${profile.name || ''}`.trim() : ''
  );
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Synchroniser l'utilisateur connecté par défaut
  useEffect(() => {
    if (profile?.user_id) {
      if (!selectedAgentId) {
        setSelectedAgentId(profile.user_id);
      }
      if (!selectedAgentName) {
        setSelectedAgentName(`${profile.firstname || ''} ${profile.name || ''}`.trim());
      }
    }
  }, [profile, selectedAgentId, selectedAgentName]);

  const loadAgents = useCallback(async () => {
    if (!isAdminOrManager) return;
    setLoadingAgents(true);

    try {
      // 1. Essayer depuis Supabase profiles
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, firstname, name, email, role')
        .order('firstname', { ascending: true });

      if (!error && data && data.length > 0) {
        const list: AgentOption[] = data
          .filter((p: any) => p.user_id)
          .map((p: any) => {
            const fullName = [p.firstname, p.name].filter(Boolean).join(' ').trim() || p.email || `Agent (${p.user_id.slice(0, 8)})`;
            return {
              id: p.user_id,
              name: fullName,
              email: p.email,
              role: p.role,
            };
          });

        setAgents(list);
        try {
          localStorage.setItem(CACHED_PROFILES_KEY, JSON.stringify(list));
        } catch {
          // ignore quota
        }
        setLoadingAgents(false);
        return;
      }
    } catch (e) {
      console.warn('[Rapports] Erreur récupération profils Supabase, bascule sur cache/local:', e);
    }

    try {
      // 2. Fallback Dexie local si hors-ligne
      const [epg, cred] = await Promise.all([
        db.transactions_epargne.toArray(),
        db.transactions_credit.toArray(),
      ]);
      const creatorIds = Array.from(new Set([...epg, ...cred].map((t) => t.created_by).filter(Boolean)));

      if (creatorIds.length > 0) {
        setAgents((prev) => {
          const map = new Map(prev.map((a) => [a.id, a]));
          creatorIds.forEach((id) => {
            if (!map.has(id)) {
              map.set(id, {
                id,
                name: id === profile?.user_id ? `${profile.firstname} ${profile.name}`.trim() : `Agent (${id.slice(0, 8)})`,
              });
            }
          });
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.error('[Rapports] Erreur fallback local:', err);
    } finally {
      setLoadingAgents(false);
    }
  }, [isAdminOrManager, profile]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgentId(agentId);
    const agent = agents.find((a) => a.id === agentId);
    if (agent) {
      setSelectedAgentName(agent.name);
    } else if (agentId === profile?.user_id) {
      setSelectedAgentName(`${profile?.firstname || ''} ${profile?.name || ''}`.trim());
    }
  };

  return (
    <div className="space-y-4">
      {/* Header responsive avec sélecteur de recherche */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
            {isAdminOrManager ? 'Fiche Rapport & Contrôle de Caisse' : 'Mon rapport'}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            {isAdminOrManager
              ? 'Sélectionnez un agent pour contrôler en direct sa collecte et ses entrées de fonds.'
              : 'Suivi en direct de vos collectes et opérations du jour.'}
          </p>
        </div>

        {/* Dropdown de recherche réactif pour Admin / Manager / Finance */}
        {isAdminOrManager && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs font-semibold text-gray-600 sm:whitespace-nowrap">
              Agent ciblé :
            </span>
            <AgentSearchSelect
              agents={agents}
              selectedAgentId={selectedAgentId || profile?.user_id || ''}
              onSelect={handleAgentSelect}
              isLoading={loadingAgents}
              currentUserId={profile?.user_id}
            />
          </div>
        )}
      </div>

      {/* Panneau des statistiques en direct */}
      <AgentStatsPanel
        showHeader={false}
        targetUserId={selectedAgentId || profile?.user_id}
        targetUserName={selectedAgentName || (profile ? `${profile.firstname} ${profile.name}` : undefined)}
      />
    </div>
  );
};

export default Rapports;
