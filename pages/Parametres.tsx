
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAgentStats, AgentStats, DateFilter, getUnsyncedStats } from '../services/statistics';
import { SyncQueueItem } from '../types';
import { RefreshCwIcon, UploadCloudIcon, DownloadCloudIcon, RotateCcwIcon, AlertTriangleIcon, TrashIcon, Trash2Icon } from '../components/icons/Icons';
import { db } from '../services/database';
import { useModal } from '../contexts/ModalContext';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import SyncProgressModal from '../components/modals/SyncProgressModal';
import { uploadPendingChanges, downloadUpdatesFromServer, retryFailedSyncItems } from '../services/syncService';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import Dexie from 'dexie';

const StatCard: React.FC<{ title: string; value: string | number; color: string }> = ({ title, value, color }) => (
    <div className={`bg-white p-4 rounded-lg shadow-md border-l-4 ${color}`}>
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
);

const Parametres: React.FC = () => {
    const { profile } = useAuthStore();
    const userId = profile?.user_id || 'test27';
    const [stats, setStats] = useState<AgentStats | null>(null);
    const [dateFilter, setDateFilter] = useState<DateFilter>({ type: 'today' });
    const unsyncedItems = useLiveQuery(() => getUnsyncedStats(), []);
    const { showModal, hideModal } = useModal();

    // Sync progress state
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, message: '' });
    const [syncErrors, setSyncErrors] = useState<string[]>([]);

    useEffect(() => {
        const fetchStats = async () => {
            const agentStats = await getAgentStats(userId, dateFilter);
            setStats(agentStats);
        };
        fetchStats();
    }, [dateFilter, userId]);

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncErrors([]);
        setSyncProgress({ current: 0, total: 0, message: 'Démarrage de la synchronisation...' });

        try {
            const result = await uploadPendingChanges((current, total, message) => {
                setSyncProgress({ current, total, message });
            });

            setIsSyncing(false);

            if (result.failed === 0) {
                toast.success(`✅ Synchronisation réussie ! ${result.success} élément(s) synchronisé(s).`);
            } else {
                toast.error(`⚠️ Synchronisation partielle : ${result.success} réussi(s), ${result.failed} échec(s).`);
                setSyncErrors(result.errors);
            }
        } catch (error: any) {
            setIsSyncing(false);
            toast.error(`❌ Erreur de synchronisation : ${error.message}`);
        }
    };

    const handleForceDownload = async () => {
        // Check if there are pending items
        const pendingCount = unsyncedItems?.filter(i => i.status === 'pending').length || 0;

        if (pendingCount > 0) {
            showModal(
                'Confirmer le téléchargement',
                <ConfirmationModal
                    title="Attention : Données non synchronisées"
                    message={`Vous avez ${pendingCount} élément(s) en attente de synchronisation. Le téléchargement forcé pourrait écraser ces modifications locales. Voulez-vous continuer ?`}
                    onConfirm={async () => {
                        hideModal();
                        await performDownload();
                    }}
                    onCancel={hideModal}
                />
            );
        } else {
            await performDownload();
        }
    };

    const performDownload = async () => {
        setIsSyncing(true);
        setSyncErrors([]);
        setSyncProgress({ current: 0, total: 0, message: 'Démarrage du téléchargement...' });

        try {
            const result = await downloadUpdatesFromServer((current, total, message) => {
                setSyncProgress({ current, total, message });
            });

            setIsSyncing(false);

            if (result.failed === 0) {
                toast.success(`✅ Téléchargement réussi ! ${result.success} élément(s) téléchargé(s).`);
            } else {
                toast.error(`⚠️ Téléchargement partiel : ${result.success} réussi(s), ${result.failed} échec(s).`);
                setSyncErrors(result.errors);
            }
        } catch (error: any) {
            setIsSyncing(false);
            toast.error(`❌ Erreur de téléchargement : ${error.message}`);
        }
    };

    const handleRetryFailed = async () => {
        setIsSyncing(true);
        setSyncErrors([]);
        setSyncProgress({ current: 0, total: 0, message: 'Relance des éléments en échec...' });

        try {
            const result = await retryFailedSyncItems((current, total, message) => {
                setSyncProgress({ current, total, message });
            });

            setIsSyncing(false);

            if (result.failed === 0) {
                toast.success(`✅ Relance réussie ! ${result.success} élément(s) synchronisé(s).`);
            } else {
                toast.error(`⚠️ Relance partielle : ${result.success} réussi(s), ${result.failed} encore en échec.`);
                setSyncErrors(result.errors);
            }
        } catch (error: any) {
            setIsSyncing(false);
            toast.error(`❌ Erreur lors de la relance : ${error.message}`);
        }
    };

    const handleClearDatabase = () => {
        const confirmClear = async () => {
            try {
                // Close the database connection
                db.close();
                // Delete the database
                await Dexie.delete(db.name);
                hideModal();
                // Reload the page to reinitialize the database
                window.location.reload();
            } catch (error) {
                console.error('Error clearing database:', error);
                alert('Erreur lors de la suppression de la base de données');
            }
        };

        showModal(
            'Confirmer la suppression',
            <ConfirmationModal
                title="Vider la base de données"
                message="⚠️ ATTENTION : Cette action est IRRÉVERSIBLE ! Toutes les données locales seront supprimées définitivement (clients, comptes, transactions). Êtes-vous absolument sûr de vouloir continuer ?"
                onConfirm={confirmClear}
                onCancel={hideModal}
            />
        );
    };

    const handleUpdateApp = () => {
        const confirmUpdate = async () => {
            try {
                // Unregister all service workers
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }

                // Clear all caches
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));

                hideModal();

                // Show success message
                alert('✅ Mise à jour effectuée ! L\'application va se recharger pour appliquer les changements.');

                // Reload to get the latest version
                window.location.reload();
            } catch (error) {
                console.error('Error updating app:', error);
                alert('Erreur lors de la mise à jour de l\'application');
            }
        };

        showModal(
            'Confirmer la mise à jour',
            <ConfirmationModal
                title="Mettre à jour l'application"
                message="Cette action va réenregistrer le service worker et vider le cache pour obtenir la dernière version de l'application. L'application sera rechargée automatiquement. Continuer ?"
                onConfirm={confirmUpdate}
                onCancel={hideModal}
            />
        );
    };

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

                {/* Sync Queue Details */}
                {unsyncedItems && unsyncedItems.length > 0 && (
                    <div className="mt-6">
                        <h3 className="text-md font-semibold text-gray-700 mb-3">Détails de la queue de synchronisation</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Table</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clé</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Données</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {unsyncedItems.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-900">{item.id}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                                    {item.table}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                                    item.action === 'add' ? 'bg-green-100 text-green-800' :
                                                    item.action === 'update' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                    {item.action === 'add' ? 'Ajout' : item.action === 'update' ? 'Modification' : 'Suppression'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">
                                                {item.pk.substring(0, 8)}...
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                                    item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                    item.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                    {item.status === 'pending' ? 'En attente' : item.status === 'completed' ? 'Complété' : 'Échec'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {new Date(item.timestamp).toLocaleString('fr-FR', {
                                                    dateStyle: 'short',
                                                    timeStyle: 'short'
                                                })}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <details className="cursor-pointer">
                                                    <summary className="text-blue-600 hover:text-blue-800">Voir</summary>
                                                    <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-w-xs">
                                                        {JSON.stringify(item.data, null, 2)}
                                                    </pre>
                                                </details>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Maintenance & Updates Section */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Maintenance & Mises à jour</h2>
                <div className="flex flex-wrap gap-4">
                    <button
                        onClick={handleUpdateApp}
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                    >
                        <RefreshCwIcon className="w-4 h-4 mr-2" />
                        Mettre à jour l'application
                    </button>
                    <button
                        onClick={handleClearDatabase}
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    >
                        <Trash2Icon className="w-4 h-4 mr-2" />
                        Vider la base de données
                    </button>
                </div>
                <div className="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-md">
                    <p className="text-sm text-yellow-800">
                        <strong>Note :</strong> Utilisez "Mettre à jour" pour obtenir la dernière version de l'application.
                        Utilisez "Vider la base" uniquement en cas de problème majeur (toutes les données seront perdues).
                    </p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Statistiques de l'agent ({userId})</h2>
                 <div className="mb-4">
                    <select onChange={(e) => setDateFilter({type: e.target.value as any})} className="p-2 border rounded-md">
                        <option value="today">Aujourd'hui</option>
                        <option value="all">Tout</option>
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Cash Summary */}
                    <StatCard title="💰 Cash à remettre" value={`${stats.cash_total_a_remettre.toFixed(2)}`} color="border-blue-600" />

                    {/* Account Creation */}
                    <StatCard title="📁 Nouveaux Comptes Épargne" value={stats.comptes_epargne_crees} color="border-purple-500" />
                    <StatCard title="📁 Nouveaux Comptes Crédit" value={stats.comptes_credit_crees} color="border-purple-500" />

                    {/* Savings Transactions - Amounts */}
                    <StatCard title="⬆️ Total Dépôts Épargne" value={`${stats.montant_transactions_epargne_depot.toFixed(2)} (${stats.transactions_epargne_depot})`} color="border-green-500" />
                    <StatCard title="⬇️ Total Retraits Épargne" value={`${stats.montant_transactions_epargne_retrait.toFixed(2)} (${stats.transactions_epargne_retrait})`} color="border-red-500" />
                    <StatCard title="📖 Frais Livret" value={`${stats.montant_transactions_frais_livret.toFixed(2)} (${stats.transactions_frais_livret})`} color="border-orange-500" />
                    <StatCard title="🔧 Frais Service" value={`${stats.montant_transactions_epargne_frais_service.toFixed(2)} (${stats.transactions_epargne_frais_service})`} color="border-yellow-500" />

                    {/* Credit Transactions - Amounts */}
                    <StatCard title="💳 Paiements Crédit" value={`${stats.montant_transactions_credit_paiement.toFixed(2)} (${stats.transactions_credit_paiement})`} color="border-green-600" />
                    <StatCard title="⚠️ Pénalités" value={`${stats.montant_transactions_credit_penalite.toFixed(2)} (${stats.transactions_credit_penalite})`} color="border-red-600" />
                    <StatCard title="🛡️ Fonds Garantie" value={`${stats.montant_transactions_credit_garantie.toFixed(2)} (${stats.transactions_credit_garantie})`} color="border-indigo-500" />

                    {/* Transaction Totals (Net) */}
                    <StatCard title="💵 Net Transactions Épargne" value={stats.montant_comptes_epargne.toFixed(2)} color="border-teal-500" />
                    <StatCard title="💵 Total Transactions Crédit" value={stats.montant_comptes_credit.toFixed(2)} color="border-cyan-500" />

                    {/* Guarantee Funds */}
                    <StatCard title="🛡️ Garantie Épargne" value={stats.total_fonds_garantie_epargne.toFixed(2)} color="border-indigo-400" />
                    <StatCard title="🛡️ Garantie Crédit" value={stats.total_fonds_garantie_credit.toFixed(2)} color="border-indigo-400" />
                    <StatCard title="🛡️ Garantie Totale" value={stats.total_fonds_garantie_global.toFixed(2)} color="border-indigo-600" />
                </div>
            </div>

            {/* Sync Progress Modal */}
            <SyncProgressModal
                isOpen={isSyncing}
                title="Synchronisation en cours"
                currentStep={syncProgress.current}
                totalSteps={syncProgress.total}
                currentMessage={syncProgress.message}
                errors={syncErrors}
                onClose={() => setIsSyncing(false)}
                canCancel={false}
            />
        </div>
    );
};

export default Parametres;
