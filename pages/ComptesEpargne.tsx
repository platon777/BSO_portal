import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { CompteEpargneAvecPersonne, TransactionEpargneEnriched, TransactionEpargne } from '../types';
import { useModal } from '../contexts/ModalContext';
import CompteEpargneForm from '../components/modals/CompteEpargneForm';
import TransactionEpargneForm from '../components/modals/TransactionEpargneForm';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { PlusIcon, EditIcon, TrashIcon, ArrowRightLeftIcon, KeyIcon } from '../components/icons/Icons';
import Pagination from '../components/common/Pagination';
import SecureWrapper from '../components/common/SecureWrapper';
import { useAuthStore } from '../stores/authStore';
import { accessService } from '../services/accessService';
import { UserRole, UserProfile } from '../types/auth';
import AccessGrantModal from '../components/modals/AccessGrantModal';
import toast from 'react-hot-toast';
import * as authService from '../services/supabaseAuth';

const ComptesEpargne: React.FC = () => {
    const { showModal, hideModal } = useModal();
    const { profile } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPageComptes, setCurrentPageComptes] = useState(1);
    const [itemsPerPageComptes, setItemsPerPageComptes] = useState(10);
    const [currentPageTransactions, setCurrentPageTransactions] = useState(1);
    const [itemsPerPageTransactions, setItemsPerPageTransactions] = useState(10);
    const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());

    // Fetch all profiles to display agent names
    useEffect(() => {
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
    }, []);

    // Helper function to display agent name
    const getAgentName = (userId: string | undefined) => {
        if (!userId) return '-';
        return profilesMap.get(userId) || 'Agent';
    };

    const data = useLiveQuery(async () => {
        try {
            const allComptes = await db.comptes_epargne.toArray();
            const personnes = await db.personnes.toArray();
            const transactions = await db.transactions_epargne.orderBy('date_transaction').reverse().toArray();

            const personnesMap = new Map(personnes.map(p => [p.id_personne, p]));
            const comptesMap = new Map(allComptes.map(c => [c.id_compte_epargne, c]));

            let comptesAvecPersonne: CompteEpargneAvecPersonne[] = allComptes.map(compte => ({
                ...compte,
                personne: personnesMap.get(compte.id_personne),
            }));

            // Enrich transactions with client ID
            const transactionsEnriched: TransactionEpargneEnriched[] = transactions.map(tx => ({
                ...tx,
                id_personne: comptesMap.get(tx.id_compte_epargne)?.id_personne
            }));

            if (searchTerm) {
                const lowercasedFilter = searchTerm.toLowerCase();
                comptesAvecPersonne = comptesAvecPersonne.filter(c =>
                    c.no_compte?.toLowerCase().includes(lowercasedFilter) ||
                    c.personne?.nom?.toLowerCase().includes(lowercasedFilter) ||
                    c.personne?.prenom?.toLowerCase().includes(lowercasedFilter)
                );
            }
            return { comptes: comptesAvecPersonne, transactions: transactionsEnriched };
        } catch (error) {
            console.error("Error fetching savings accounts:", error);
            return { comptes: [], transactions: [] };
        }
    }, [searchTerm], { comptes: [], transactions: [] });

    const paginatedComptes = useMemo(() => {
        if (!data?.comptes) return [];
        const start = (currentPageComptes - 1) * itemsPerPageComptes;
        return data.comptes.slice(start, start + itemsPerPageComptes);
    }, [data?.comptes, currentPageComptes, itemsPerPageComptes]);

    const totalPagesComptes = Math.ceil((data?.comptes?.length || 0) / itemsPerPageComptes);

    const paginatedTransactions = useMemo(() => {
        if (!data?.transactions) return [];
        const start = (currentPageTransactions - 1) * itemsPerPageTransactions;
        return data.transactions.slice(start, start + itemsPerPageTransactions);
    }, [data?.transactions, currentPageTransactions, itemsPerPageTransactions]);

    const totalPagesTransactions = Math.ceil((data?.transactions?.length || 0) / itemsPerPageTransactions);

    const handleAddCompte = () => {
        showModal('Créer un compte épargne', <CompteEpargneForm onSave={hideModal} onCancel={hideModal} />);
    };

    const handleEditCompte = async (compte: CompteEpargneAvecPersonne) => {
        const hasAccess = await accessService.hasAccess(compte.id_personne);
        if (!hasAccess) {
            toast.error("Accès refusé. Demandez un accès temporaire à un administrateur.");
            return;
        }
        showModal('Modifier le compte épargne', <CompteEpargneForm compte={compte} onSave={hideModal} onCancel={hideModal} />);
    };

    const handleDeleteCompte = async (compte: CompteEpargneAvecPersonne) => {
        const hasAccess = await accessService.hasAccess(compte.id_personne);
        if (!hasAccess) {
            toast.error("Accès refusé. Demandez un accès temporaire à un administrateur.");
            return;
        }
        showModal('Confirmer la suppression', <ConfirmationModal
            title="Supprimer Compte Épargne"
            message={`Voulez-vous vraiment supprimer le compte ${compte.no_compte} ? Ceci supprimera également tous les comptes de crédit et transactions associés.`}
            onConfirm={async () => {
                await db.deleteCompteEpargneCascade(compte.id_compte_epargne);
                hideModal();
            }}
            onCancel={hideModal}
        />);
    }

    const handleGrantAccessCompte = (compte: CompteEpargneAvecPersonne) => {
        if (!compte.personne) {
            toast.error("Client introuvable");
            return;
        }
        showModal('Accorder accès', <AccessGrantModal
            clientId={compte.id_personne}
            clientName={`${compte.personne.prenom} ${compte.personne.nom}`}
            onClose={hideModal}
        />);
    };

    const handleAddTransaction = (compte: CompteEpargneAvecPersonne) => {
        showModal(`Transaction pour ${compte.no_compte}`, <TransactionEpargneForm compteEpargne={compte} onSave={hideModal} onCancel={hideModal} />);
    };

    const handleEditTransaction = async (tx: TransactionEpargneEnriched) => {
        if (!tx.id_personne) {
            toast.error("Impossible de vérifier l'accès");
            return;
        }
        const hasAccess = await accessService.hasAccess(tx.id_personne);
        if (!hasAccess) {
            toast.error("Accès refusé. Demandez un accès temporaire à un administrateur.");
            return;
        }

        // Find the account for this transaction
        const compte = data.comptes.find(c => c.id_compte_epargne === tx.id_compte_epargne);
        if (!compte) {
            toast.error("Compte introuvable");
            return;
        }

        showModal(`Modifier Transaction`, <TransactionEpargneForm compteEpargne={compte} transaction={tx as TransactionEpargne} onSave={hideModal} onCancel={hideModal} />);
    };

    const handleDeleteTransaction = async (tx: TransactionEpargneEnriched) => {
        if (!tx.id_personne) {
            toast.error("Impossible de vérifier l'accès");
            return;
        }
        const hasAccess = await accessService.hasAccess(tx.id_personne);
        if (!hasAccess) {
            toast.error("Accès refusé. Demandez un accès temporaire à un administrateur.");
            return;
        }
        showModal('Confirmer la suppression', <ConfirmationModal
            title="Supprimer Transaction"
            message={`Voulez-vous vraiment supprimer cette transaction de ${tx.montant} ?`}
            onConfirm={async () => {
                await db.transactions_epargne.delete(tx.id_transaction_epargne);
                hideModal();
            }}
            onCancel={hideModal}
        />);
    };

    return (
        <SecureWrapper>
            <div className="space-y-6">
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-2xl font-bold text-gray-800">Comptes d'Épargne</h1>
                        <button onClick={handleAddCompte} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                            <PlusIcon className="w-4 h-4 mr-2" />
                            Créer un compte
                        </button>
                    </div>
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Rechercher par N° de compte ou nom de client..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPageComptes(1); }}
                            className="w-full px-4 py-2 border rounded-md"
                        />
                    </div>
                    <div className="bg-white shadow-md rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Compte</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde Actuel</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fonds Garantie</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Création</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Succursale</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {paginatedComptes.map((compte) => (
                                        <tr key={compte.id_compte_epargne} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <div className="flex items-center space-x-3">
                                                    <button onClick={() => handleAddTransaction(compte)} className="text-blue-600 hover:text-blue-800" title="Nouvelle Transaction">
                                                        <ArrowRightLeftIcon className="w-5 h-5" />
                                                    </button>
                                                    <button onClick={() => handleEditCompte(compte)} className="text-indigo-600 hover:text-indigo-800" title="Modifier">
                                                        <EditIcon className="w-5 h-5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteCompte(compte)} className="text-red-600 hover:text-red-800" title="Supprimer">
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                    {profile?.role === UserRole.ADMIN && (
                                                        <button onClick={() => handleGrantAccessCompte(compte)} className="text-yellow-600 hover:text-yellow-900" title="Accorder accès temporaire">
                                                            <KeyIcon className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{compte.no_compte || '-'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{compte.personne ? `${compte.personne.prenom} ${compte.personne.nom}` : 'N/A'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-semibold">{(compte.solde_actuel ?? 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{(compte.fonds_garantie ?? 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                                {new Date(compte.date_creation).toLocaleDateString('fr-FR')}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.succursale || '-'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{getAgentName(compte.created_by)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {compte.statut}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination currentPage={currentPageComptes} totalPages={totalPagesComptes} onPageChange={setCurrentPageComptes} itemsPerPage={itemsPerPageComptes} totalItems={data?.comptes?.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageComptes(v); setCurrentPageComptes(1); }} />
                    </div>
                </div>

                <div>
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Dernières Transactions Épargne</h2>
                    <div className="bg-white shadow-md rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Heure</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Compte</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde Avant</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde Après</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {paginatedTransactions.map((tx) => {
                                        const typeLabels: Record<string, string> = { 'D': 'Dépôt', 'R': 'Retrait', 'FL': 'Frais Livret', 'S': 'Frais Service' };
                                        const typeColors: Record<string, string> = { 'D': 'bg-green-100 text-green-800', 'R': 'bg-red-100 text-red-800', 'FL': 'bg-orange-100 text-orange-800', 'S': 'bg-yellow-100 text-yellow-800' };
                                        return (
                                            <tr key={tx.id_transaction_epargne} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                                    <div className="flex items-center space-x-2">
                                                        <button onClick={() => handleEditTransaction(tx)} className="text-indigo-600 hover:text-indigo-900" title="Modifier">
                                                            <EditIcon className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDeleteTransaction(tx)} className="text-red-600 hover:text-red-900" title="Supprimer">
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                                    {tx.date_transaction ? new Date(tx.date_transaction).toLocaleString('fr-FR', {
                                                        dateStyle: 'short',
                                                        timeStyle: 'short'
                                                    }) : '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{tx.no_compte || '-'}</td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs font-semibold rounded ${typeColors[tx.type_transaction] || 'bg-gray-100 text-gray-800'}`}>
                                                        {typeLabels[tx.type_transaction] || tx.type_transaction}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{(tx.montant ?? 0).toFixed(2)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{(tx.solde_avant_transaction_declare ?? 0).toFixed(2)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{(tx.solde_apres_transaction_declare ?? 0).toFixed(2)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{getAgentName(tx.created_by)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination currentPage={currentPageTransactions} totalPages={totalPagesTransactions} onPageChange={setCurrentPageTransactions} itemsPerPage={itemsPerPageTransactions} totalItems={data?.transactions?.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageTransactions(v); setCurrentPageTransactions(1); }} />
                    </div>
                </div>
            </div>
        </SecureWrapper>
    );
};
export default ComptesEpargne;