
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAgentStats, AgentStats, DateFilter, getUnsyncedStats } from '../services/statistics';
import { SyncQueueItem } from '../types';
import { RefreshCwIcon, UploadCloudIcon, DownloadCloudIcon, RotateCcwIcon, AlertTriangleIcon } from '../components/icons/Icons';

const StatCard: React.FC<{ title: string; value: string | number; color: string }> = ({ title, value, color }) => (
    <div className={`bg-white p-4 rounded-lg shadow-md border-l-4 ${color}`}>
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
);

const Parametres: React.FC = () => {
    const MOCK_USER_ID = 'test27'; // Should come from auth
    const [stats, setStats] = useState<AgentStats | null>(null);
    const [dateFilter, setDateFilter] = useState<DateFilter>({ type: 'today' });
    const unsyncedItems = useLiveQuery(() => getUnsyncedStats(), []);

    useEffect(() => {
        const fetchStats = async () => {
            const agentStats = await getAgentStats(MOCK_USER_ID, dateFilter);
            setStats(agentStats);
        };
        fetchStats();
    }, [dateFilter]);
    
    const handleSync = () => {
        // Mock sync logic
        alert('Syncing data with server...');
    }
    
    const handleForceDownload = () => {
        alert('Force downloading data from server...');
    }
    
    const handleRetryFailed = () => {
        alert('Retrying failed sync items...');
    }

    if (!stats) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Paramètres & Synchronisation</h1>

            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Actions de Synchronisation</h2>
                <div className="flex flex-wrap gap-4">
                     <button onClick={handleSync} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                        <RefreshCwIcon className="w-4 h-4 mr-2" />
                        Synchroniser
                    </button>
                    <button onClick={handleForceDownload} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
                        <DownloadCloudIcon className="w-4 h-4 mr-2" />
                        Forcer Téléchargement
                    </button>
                     <button onClick={handleRetryFailed} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:bg-gray-400" disabled={!unsyncedItems?.some(i => i.status === 'failed')}>
                        <RotateCcwIcon className="w-4 h-4 mr-2" />
                        Réessayer échecs
                    </button>
                </div>
                 <div className="mt-4">
                    <h3 className="text-md font-semibold text-gray-700">État de la synchronisation</h3>
                    <div className="flex items-center mt-2 p-3 bg-gray-50 rounded-md">
                        {unsyncedItems?.length === 0 ? (
                            <p className="text-green-600 font-medium">Toutes les données sont synchronisées.</p>
                        ) : (
                            <div className="flex items-center text-yellow-600">
                                <AlertTriangleIcon className="w-5 h-5 mr-2"/>
                                <p className="font-medium">{unsyncedItems?.length} élément(s) en attente de synchronisation.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Statistiques de l'agent ({MOCK_USER_ID})</h2>
                 <div className="mb-4">
                    <select onChange={(e) => setDateFilter({type: e.target.value as any})} className="p-2 border rounded-md">
                        <option value="today">Aujourd'hui</option>
                        <option value="all">Tout</option>
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <StatCard title="Cash à remettre" value={`${stats.cash_total_a_remettre.toFixed(2)}`} color="border-blue-500" />
                    <StatCard title="Total Dépôts Épargne" value={stats.montant_transactions_epargne_depot.toFixed(2)} color="border-green-500" />
                    <StatCard title="Total Retraits Épargne" value={stats.montant_transactions_epargne_retrait.toFixed(2)} color="border-red-500" />
                    <StatCard title="Total Paiements Crédit" value={stats.montant_transactions_credit_paiement.toFixed(2)} color="border-green-500" />
                    <StatCard title="Nouveaux Comptes Épargne" value={stats.comptes_epargne_crees} color="border-purple-500" />
                    <StatCard title="Nouveaux Comptes Crédit" value={stats.comptes_credit_crees} color="border-purple-500" />
                </div>
            </div>
        </div>
    );
};

export default Parametres;
