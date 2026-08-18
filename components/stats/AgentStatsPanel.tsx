import React, { useState, useEffect } from 'react';
import { getAgentStats, AgentStats, DateFilter, initialStats } from '../../services/statistics';
import { useAuthStore } from '../../stores/authStore';

const StatCard: React.FC<{ title: string; value?: string | number; count?: number; amount?: string; color: string }> = ({ title, value, count, amount, color }) => (
    <div className={`bg-white p-4 rounded-lg shadow-md border-l-4 ${color} w-full`}>
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        {count !== undefined && amount !== undefined ? (
            <>
                <p className="text-2xl font-bold text-gray-800">{count}</p>
                <p className="text-sm text-gray-600">{amount}</p>
            </>
        ) : (
            <p className="text-2xl font-bold text-gray-800">{value}</p>
        )}
    </div>
);

const toLocalDateISO = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const fmt = (n: number) => `${(n || 0).toFixed(2)} HTG`;

interface AgentStatsPanelProps {
    /** Affiche le titre "Statistiques de l'agent ...". Par défaut true. */
    showHeader?: boolean;
    /** ID de l'agent ciblé (si sélectionné par un admin). Par défaut l'utilisateur connecté. */
    targetUserId?: string;
    /** Nom complet de l'agent ciblé pour l'affichage. */
    targetUserName?: string;
}

/**
 * Panneau de statistiques (rapport) de l'agent connecté ou de l'agent sélectionné.
 * Réutilisé par la page Paramètres et par la page Rapports dédiée.
 */
const AgentStatsPanel: React.FC<AgentStatsPanelProps> = ({
    showHeader = true,
    targetUserId,
    targetUserName
}) => {
    const { profile } = useAuthStore();
    const userId = targetUserId || profile?.user_id || '';
    const displayName = targetUserName || (profile ? `${profile.firstname} ${profile.name}` : '(Non connecté)');
    const [stats, setStats] = useState<AgentStats | null>(null);
    const [datePreset, setDatePreset] = useState<'today' | 'yesterday'>('today');
    const [dateFilter, setDateFilter] = useState<DateFilter>({ type: 'today' });

    useEffect(() => {
        let active = true;
        const fetchStats = async () => {
            if (!userId) {
                if (active) setStats({ ...initialStats });
                return;
            }
            const agentStats = await getAgentStats(userId, dateFilter);
            if (active) setStats(agentStats);
        };
        fetchStats();
        return () => { active = false; };
    }, [dateFilter, userId]);

    const handleDatePresetChange = (preset: 'today' | 'yesterday') => {
        setDatePreset(preset);
        if (preset === 'today') {
            setDateFilter({ type: 'today' });
            return;
        }
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        setDateFilter({ type: 'specific', date: toLocalDateISO(yesterday) });
    };

    if (!stats) {
        return <div className="p-4 text-gray-600">Chargement des statistiques...</div>;
    }

    const totalEnAttente = (stats.montant_depot_en_attente || 0) + (stats.montant_paiement_en_attente || 0);
    const totalValide = stats.total_cash - totalEnAttente;

    return (
        <div className="bg-white p-4 rounded-lg shadow-md">
            {showHeader && (
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Statistiques de l'agent {displayName}
                </h2>
            )}
            {!userId && (
                <div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-md">
                    <p className="text-sm text-yellow-800">
                        <strong>Note :</strong> Aucun agent sélectionné ou connecté. Les statistiques sont vides.
                    </p>
                </div>
            )}
            <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Période :</label>
                    <select
                        value={datePreset}
                        onChange={(e) => handleDatePresetChange(e.target.value as 'today' | 'yesterday')}
                        className="p-2 border border-gray-300 rounded-md text-sm bg-white"
                    >
                        <option value="today">Aujourd'hui</option>
                        <option value="yesterday">Hier</option>
                    </select>
                </div>
                <div className="text-xs text-gray-500">
                    Calcul en temps réel dès la collecte terrain
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 max-h-[60vh] overflow-y-auto overscroll-contain p-2 sm:p-3 pr-2 pb-24 md:pb-3">
                <StatCard title="Comptes Épargne Créés" count={stats.comptes_epargne_crees} amount="" color="border-blue-100" />
                <StatCard title="Comptes Crédit Créés" count={stats.comptes_credit_crees} amount="" color="border-blue-100" />

                <StatCard title="Dépôt (Épargne)" count={stats.transactions_epargne_depot} amount={fmt(stats.montant_transactions_epargne_depot)} color="border-green-100" />
                <StatCard title="Retrait" count={stats.transactions_epargne_retrait} amount={fmt(stats.montant_transactions_epargne_retrait)} color="border-red-100" />

                <StatCard title="Dépôt Fonds Garantie" count={stats.transactions_depot_fonds_garantie} amount={fmt(stats.montant_depot_fonds_garantie)} color="border-cyan-100" />
                <StatCard title="Dépôt Grandon" count={stats.transactions_depot_grandon} amount={fmt(stats.montant_depot_grandon)} color="border-lime-100" />

                <StatCard title="Solde Cumulé" value={fmt(stats.solde_cumule)} color="border-indigo-100" />
                <StatCard title="Nouveau Carnet (Frais Livret)" count={stats.transactions_frais_livret} amount={fmt(stats.montant_transactions_frais_livret)} color="border-orange-100" />

                <StatCard title="Virement" count={stats.transactions_virement} amount={fmt(stats.montant_transactions_virement)} color="border-blue-100" />
                <StatCard title="Frais Auto" count={stats.transactions_frais_auto} amount={fmt(stats.montant_transactions_frais_auto)} color="border-purple-100" />

                <StatCard title="Frais Service" count={stats.transactions_epargne_frais_service} amount={fmt(stats.montant_transactions_epargne_frais_service)} color="border-yellow-100" />
                <StatCard title="Versement Cumulé" value={fmt(stats.versement_cumule)} color="border-indigo-100" />

                <StatCard title="Crédit Cash" count={stats.comptes_credit_cash} amount={fmt(stats.montant_credit_cash)} color="border-green-100" />
                <StatCard title="Crédit Konfyans" count={stats.comptes_credit_konfyans} amount={fmt(stats.montant_credit_konfyans)} color="border-green-100" />

                <StatCard title="Crédit Électroménager" count={stats.comptes_credit_electromenager} amount={fmt(stats.montant_credit_electromenager)} color="border-green-100" />
                <StatCard title="Paiement Crédit" count={stats.transactions_credit_paiement} amount={fmt(stats.montant_transactions_credit_paiement)} color="border-green-100" />

                <StatCard title="Pénalités" count={stats.transactions_credit_penalite} amount={fmt(stats.montant_transactions_credit_penalite)} color="border-red-100" />
                <StatCard title="Garantie (Crédit)" count={stats.transactions_credit_garantie} amount={fmt(stats.montant_transactions_credit_garantie)} color="border-cyan-100" />

                <StatCard title="Monnaie" value={fmt(stats.montant_monnaie_client)} color="border-teal-100" />
                <StatCard title="Remise" value={fmt(stats.montant_remise_client)} color="border-pink-100" />

                <StatCard title="Frais Dossier" value={fmt(stats.montant_frais_dossier)} color="border-amber-100" />

                {/* Entrées d'argent en attente de validation finance */}
                <StatCard title="Dépôts en attente ⏳" count={stats.transactions_depot_en_attente} amount={fmt(stats.montant_depot_en_attente)} color="border-amber-400" />
                <StatCard title="Paiements en attente ⏳" count={stats.transactions_paiement_en_attente} amount={fmt(stats.montant_paiement_en_attente)} color="border-amber-400" />

                {/* Total Cash Collecté - highlighted */}
                <div className="col-span-2">
                    <div className="bg-emerald-50 p-4 rounded-lg shadow-md border-l-4 border-emerald-500 w-full">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <h3 className="text-base font-semibold text-emerald-900">Total Cash Collecté (Physique)</h3>
                            <span className="text-2xl font-bold text-emerald-800">{fmt(stats.total_cash)}</span>
                        </div>
                        <div className="mt-2 text-xs text-emerald-700 flex flex-wrap gap-x-4 gap-y-1">
                            <span>Validé : <strong>{fmt(totalValide)}</strong></span>
                            <span>En attente de validation : <strong>{fmt(totalEnAttente)}</strong></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentStatsPanel;
