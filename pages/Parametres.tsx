
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAgentStats, AgentStats, DateFilter, getUnsyncedStats, initialStats } from '../services/statistics';
import { SyncQueueItem } from '../types';
import { RefreshCwIcon, UploadCloudIcon, DownloadCloudIcon, RotateCcwIcon, AlertTriangleIcon, TrashIcon, Trash2Icon } from '../components/icons/Icons';
import { db } from '../services/database';
import { useModal } from '../contexts/ModalContext';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import SyncProgressModal from '../components/modals/SyncProgressModal';
import { uploadPendingChanges, downloadUpdatesFromServer, retryFailedSyncItems, removeFromSyncQueue } from '../services/syncService';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import Dexie from 'dexie';
import AccessGrantsPanel from '../components/admin/AccessGrantsPanel';

const StatCard: React.FC<{ title: string; value: string | number; count?: number; amount?: string; color: string }> = ({ title, value, count, amount, color }) => (
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

const Parametres: React.FC = () => {
    const { profile } = useAuthStore();
    const userId = profile?.user_id || '';
    const [stats, setStats] = useState<AgentStats | null>(null);
    const [dateFilter, setDateFilter] = useState<DateFilter>({ type: 'today' });
    const [datePreset, setDatePreset] = useState<'today' | 'yesterday'>('today');
    const unsyncedItems = useLiveQuery(() => getUnsyncedStats(), []);
    const { showModal, hideModal } = useModal();

    // Sync progress state
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, message: '' });
    const [syncErrors, setSyncErrors] = useState<string[]>([]);

    useEffect(() => {
        const fetchStats = async () => {
            if (!userId) {
                console.warn('[Parametres] No user ID available, skipping stats fetch');
                setStats({ ...initialStats } as AgentStats);
                return;
            }
            const agentStats = await getAgentStats(userId, dateFilter);
            setStats(agentStats);
        };
        fetchStats();
    }, [dateFilter, userId]);

    const handleDatePresetChange = (preset: 'today' | 'yesterday') => {
        setDatePreset(preset);
        if (preset === 'today') {
            setDateFilter({ type: 'today' });
            return;
        }
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        setDateFilter({
            type: 'specific',
            date: toLocalDateISO(yesterday),
        });
    };

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
                const summary = [
                    result.added ? `${result.added} ajout(s)` : '',
                    result.updated ? `${result.updated} mise(s) à jour` : '',
                    result.deleted ? `${result.deleted} suppression(s)` : ''
                ].filter(Boolean).join(', ');

                toast.success(`✅ Téléchargement réussi ! ${summary || 'Aucun changement'}.`);
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

    const handleRemoveFromQueue = (item: SyncQueueItem) => {
        const confirmDelete = async () => {
            try {
                await removeFromSyncQueue(item.id!);
                hideModal();
                toast.success('Élément supprimé de la file de synchronisation.');
            } catch (error) {
                console.error('Error removing from sync queue:', error);
                toast.error('Erreur lors de la suppression de l\'élément.');
            }
        };

        showModal(
            'Confirmer la suppression',
            <ConfirmationModal
                title="Supprimer de la file"
                message={`Êtes-vous sûr de vouloir supprimer cette action (${item.action} sur ${item.table}) de la file de synchronisation ? Cette action ne sera JAMAIS envoyée au serveur.`}
                onConfirm={confirmDelete}
                onCancel={hideModal}
            />
        );
    };

    const handleClearDatabase = () => {
        const confirmClear = async () => {
            try {
                // Close the database connection
                db.close();
                // Delete the database
                await Dexie.delete(db.name);
                // Clear sync timestamps to force full download on next sync
                localStorage.removeItem('bso_last_download_sync');
                localStorage.removeItem('bso_last_upload_sync');
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
                hideModal();

                // Vérifier si Service Worker est disponible
                if ('serviceWorker' in navigator) {
                    try {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        console.log(`[Update] Found ${registrations.length} service worker(s)`);
                        for (const registration of registrations) {
                            const success = await registration.unregister();
                            console.log(`[Update] Unregistered service worker: ${success}`);
                        }
                    } catch (swError) {
                        console.warn('[Update] Service Worker unregister failed:', swError);
                        // Continue anyway
                    }
                }

                // Vérifier si Cache API est disponible
                if ('caches' in window) {
                    try {
                        const cacheNames = await caches.keys();
                        console.log(`[Update] Found ${cacheNames.length} cache(s)`);
                        await Promise.all(cacheNames.map(cacheName => {
                            console.log(`[Update] Deleting cache: ${cacheName}`);
                            return caches.delete(cacheName);
                        }));
                    } catch (cacheError) {
                        console.warn('[Update] Cache deletion failed:', cacheError);
                        // Continue anyway
                    }
                }

                // Show success message
                toast.success('Mise à jour effectuée ! L\'application va se recharger.', { duration: 3000 });

                // Reload to get the latest version after a short delay
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } catch (error) {
                console.error('[Update] Error updating app:', error);
                toast.error('Erreur lors de la mise à jour de l\'application');
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
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">Paramètres & Synchronisation</h1>

            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Actions de Synchronisation</h2>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4">
                    <button onClick={handleSync} className="flex items-center justify-center sm:justify-start px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 min-h-[44px]">
                        <RefreshCwIcon className="w-4 h-4 mr-2" />
                        Envoyer donnees
                    </button>
                    <button onClick={handleForceDownload} className="flex items-center justify-center sm:justify-start px-4 py-3 sm:py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 min-h-[44px]">
                        <DownloadCloudIcon className="w-4 h-4 mr-2" />
                        Recevoir donnees
                    </button>
                    <button onClick={handleRetryFailed} className="flex items-center justify-center sm:justify-start px-4 py-3 sm:py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:bg-gray-400 min-h-[44px]" disabled={!unsyncedItems?.some(i => i.status === 'failed')}>
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
                                <AlertTriangleIcon className="w-5 h-5 mr-2" />
                                <p className="font-medium">{unsyncedItems?.length} élément(s) en attente de synchronisation.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sync Queue Details */}
                {unsyncedItems && unsyncedItems.length > 0 && (
                    <div className="mt-6">
                        <h3 className="text-md font-semibold text-gray-700 mb-3">Détails de la queue de synchronisation</h3>

                        {/* Mobile card view */}
                        <div className="md:hidden space-y-3">
                            {unsyncedItems.map((item) => (
                                <div key={item.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                                {item.table}
                                            </span>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded ${item.action === 'add' ? 'bg-green-100 text-green-800' :
                                                item.action === 'update' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                {item.action === 'add' ? 'Ajout' : item.action === 'update' ? 'Modification' : 'Suppression'}
                                            </span>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded ${item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                item.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                {item.status === 'pending' ? 'En attente' : item.status === 'completed' ? 'Complété' : 'Échec'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveFromQueue(item)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                            title="Supprimer de la file"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span className="font-mono">{item.pk.substring(0, 8)}...</span>
                                        <span>{new Date(item.timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                    </div>
                                    {item.error && (
                                        <details className="cursor-pointer">
                                            <summary className="text-red-600 text-sm font-medium min-h-[44px] flex items-center">Voir l'erreur</summary>
                                            <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs">
                                                <pre className="whitespace-pre-wrap break-words text-red-800 font-mono">{item.error}</pre>
                                            </div>
                                        </details>
                                    )}
                                    <details className="cursor-pointer">
                                        <summary className="text-blue-600 text-sm font-medium min-h-[44px] flex items-center">Voir données</summary>
                                        <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">{JSON.stringify(item.data, null, 2)}</pre>
                                    </details>
                                </div>
                            ))}
                        </div>

                        {/* Desktop table view */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Table</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clé</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Erreur</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Données</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                                                <span className={`px-2 py-1 text-xs font-semibold rounded ${item.action === 'add' ? 'bg-green-100 text-green-800' :
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
                                                <span className={`px-2 py-1 text-xs font-semibold rounded ${item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
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
                                                {item.error ? (
                                                    <details className="cursor-pointer">
                                                        <summary className="text-red-600 hover:text-red-800 font-medium">Voir l'erreur</summary>
                                                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-xs max-w-md">
                                                            <pre className="whitespace-pre-wrap break-words text-red-800 font-mono">
                                                                {item.error}
                                                            </pre>
                                                        </div>
                                                    </details>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <details className="cursor-pointer">
                                                    <summary className="text-blue-600 hover:text-blue-800">Voir</summary>
                                                    <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-w-xs">
                                                        {JSON.stringify(item.data, null, 2)}
                                                    </pre>
                                                </details>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <button
                                                    onClick={() => handleRemoveFromQueue(item)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                    title="Supprimer de la file"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            <AccessGrantsPanel />

            {/* Maintenance & Updates Section */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Maintenance & Mises à jour</h2>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4">
                    <button
                        onClick={handleUpdateApp}
                        className="flex items-center justify-center sm:justify-start px-4 py-3 sm:py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 min-h-[44px]"
                    >
                        <RefreshCwIcon className="w-4 h-4 mr-2" />
                        Mettre à jour l'application
                    </button>
                    <button
                        onClick={handleClearDatabase}
                        className="flex items-center justify-center sm:justify-start px-4 py-3 sm:py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 min-h-[44px]"
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
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Statistiques de l'agent {profile ? `${profile.firstname} ${profile.name}` : '(Non connecté)'}
                </h2>
                {!userId && (
                    <div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-md">
                        <p className="text-sm text-yellow-800">
                            <strong>Note :</strong> Aucun utilisateur connecté. Les statistiques sont vides.
                        </p>
                    </div>
                )}
                <div className="mb-4">
                    <select
                        value={datePreset}
                        onChange={(e) => handleDatePresetChange(e.target.value as 'today' | 'yesterday')}
                        className="p-2 border rounded-md"
                    >
                        <option value="today">Aujourd'hui</option>
                        <option value="yesterday">Hier</option>
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 max-h-[60vh] overflow-y-auto overscroll-contain p-2 sm:p-3 pr-2 pb-24 md:pb-3">
                    {/* Ordre selon document: comptes, depot, retrait, solde cumule, nouveau carnet, virement, frais auto, frais service, credit, versement cumule, penalites, monnaie, remise, frais dossier, fonds garantie, total cash */}
                    <StatCard title="Comptes Épargne Créés" value="" count={stats.comptes_epargne_crees} amount="" color="border-blue-100" />
                    <StatCard title="Comptes Crédit Créés" value="" count={stats.comptes_credit_crees} amount="" color="border-blue-100" />

                    <StatCard title="Dépôt" value="" count={stats.transactions_epargne_depot} amount={`${stats.montant_transactions_epargne_depot.toFixed(2)} HTG`} color="border-green-100" />
                    <StatCard title="Retrait" value="" count={stats.transactions_epargne_retrait} amount={`${stats.montant_transactions_epargne_retrait.toFixed(2)} HTG`} color="border-red-100" />

                    <StatCard title="Solde Cumulé" value={`${stats.solde_cumule.toFixed(2)} HTG`} color="border-indigo-100" />
                    <StatCard title="Nouveau Carnet (Frais Livret)" value="" count={stats.transactions_frais_livret} amount={`${stats.montant_transactions_frais_livret.toFixed(2)} HTG`} color="border-orange-100" />

                    <StatCard title="Virement" value="" count={stats.transactions_virement} amount={`${stats.montant_transactions_virement.toFixed(2)} HTG`} color="border-blue-100" />
                    <StatCard title="Frais Auto" value="" count={stats.transactions_frais_auto} amount={`${stats.montant_transactions_frais_auto.toFixed(2)} HTG`} color="border-purple-100" />

                    <StatCard title="Frais Service" value="" count={stats.transactions_epargne_frais_service} amount={`${stats.montant_transactions_epargne_frais_service.toFixed(2)} HTG`} color="border-yellow-100" />
                    <StatCard title="Crédit (Paiement)" value="" count={stats.transactions_credit_paiement} amount={`${stats.montant_transactions_credit_paiement.toFixed(2)} HTG`} color="border-green-100" />

                    <StatCard title="Versement Cumulé" value={`${stats.versement_cumule.toFixed(2)} HTG`} color="border-indigo-100" />
                    <StatCard title="Pénalités" value="" count={stats.transactions_credit_penalite} amount={`${stats.montant_transactions_credit_penalite.toFixed(2)} HTG`} color="border-red-100" />

                    <StatCard title="Monnaie" value={`${stats.montant_monnaie_client.toFixed(2)} HTG`} color="border-teal-100" />
                    <StatCard title="Remise" value={`${stats.montant_remise_client.toFixed(2)} HTG`} color="border-pink-100" />

                    <StatCard title="Frais Dossier" value={`${stats.montant_frais_dossier.toFixed(2)} HTG`} color="border-amber-100" />
                    <StatCard title="Fonds Garantie" value="" count={stats.transactions_credit_garantie} amount={`${stats.montant_transactions_credit_garantie.toFixed(2)} HTG`} color="border-cyan-100" />

                    {/* Total Cash - highlighted */}
                    <div className="col-span-2">
                        <StatCard title="Total Cash" value={`${stats.total_cash.toFixed(2)} HTG`} color="border-emerald-500" />
                    </div>
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
                canCancel={false}
                onCancel={() => setIsSyncing(false)}
            />
        </div>
    );
};

export default Parametres;



