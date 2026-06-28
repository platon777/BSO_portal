import React from 'react';
import AgentStatsPanel from '../components/stats/AgentStatsPanel';

/**
 * Page Rapports — statistiques de l'agent connecté.
 * Accessible depuis le menu latéral et la barre mobile, comme les pages
 * Clients / Épargne / Crédit. Respecte les restrictions existantes : seules les
 * données de l'utilisateur connecté sont comptabilisées (getAgentStats(userId)).
 */
const Rapports: React.FC = () => {
    return (
        <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">Mon rapport</h1>
            <AgentStatsPanel showHeader={false} />
        </div>
    );
};

export default Rapports;
