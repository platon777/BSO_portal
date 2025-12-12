import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { CompteCreditEnriched, TransactionCredit } from '../types';
import { useModal } from '../contexts/ModalContext';
import CompteCreditForm from '../components/modals/CompteCreditForm';
import TransactionCreditForm from '../components/modals/TransactionCreditForm';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { PlusIcon, EditIcon, TrashIcon, ArrowRightLeftIcon } from '../components/icons/Icons';
import Pagination from '../components/common/Pagination';
import SecureWrapper from '../components/common/SecureWrapper';
import { useAuthStore } from '../stores/authStore';

const ComptesCredit: React.FC = () => {
    const { showModal, hideModal } = useModal();
    const { profile } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPageComptes, setCurrentPageComptes] = useState(1);
    const [itemsPerPageComptes, setItemsPerPageComptes] = useState(10);
    const [currentPageTransactions, setCurrentPageTransactions] = useState(1);
    const [itemsPerPageTransactions, setItemsPerPageTransactions] = useState(10);

    // Helper function to display agent name
    const getAgentName = (userId: string | undefined) => {
        if (!userId) return '-';
        if (profile?.user_id === userId) {
            return `${profile.firstname} ${profile.name}`;
        }
        return 'Agent';
    };

    const data = useLiveQuery(async () => {
        try {
            const allComptes = await db.comptes_credit.toArray();
            const personnes = await db.personnes.toArray();
            const transactions = await db.transactions_credit.orderBy('date_transaction').reverse().toArray();

            const personnesMap = new Map(personnes.map(p => [p.id_personne, p]));

            let comptesAvecPersonne: CompteCreditEnriched[] = allComptes.map(compte => ({
                ...compte,
                personne: personnesMap.get(compte.id_personne),
            }));

            if (searchTerm) {
                const lowercasedFilter = searchTerm.toLowerCase();
                comptesAvecPersonne = comptesAvecPersonne.filter(c =>
                    c.no_compte?.toLowerCase().includes(lowercasedFilter) ||
                    c.personne?.nom?.toLowerCase().includes(lowercasedFilter) ||
                    c.personne?.prenom?.toLowerCase().includes(lowercasedFilter)
                );
            }
            return { comptes: comptesAvecPersonne, transactions };
        } catch (error) {
            console.error("Error fetching credit accounts:", error);
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
        showModal('Créer un compte crédit', <CompteCreditForm onSave={hideModal} onCancel={hideModal} />);
    };

    const handleEditCompte = (compte: CompteCreditEnriched) => {
        showModal('Modifier le compte crédit', <CompteCreditForm compte={compte} onSave={hideModal} onCancel={hideModal} />);
    };

    const handleDeleteCompte = (compte: CompteCreditEnriched) => {
        showModal('Confirmer la suppression', <ConfirmationModal
            title="Supprimer Compte Crédit"
            message={`Voulez-vous vraiment supprimer le compte ${compte.no_compte} ? Ceci supprimera également toutes les transactions associées.`}
            onConfirm={async () => {
                await db.deleteCompteCreditCascade(compte.id_compte_credit);
                hideModal();
            }}
            onCancel={hideModal}
        />);
    }

    const handleAddTransaction = (compte: CompteCreditEnriched) => {
        showModal(`Transaction pour ${compte.no_compte}`, <TransactionCreditForm compteCredit={compte} onSave={hideModal} onCancel={hideModal} />);
    };

    return (
        <SecureWrapper>
            <div className="space-y-6">
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-800">Comptes de Crédit</h1>
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant Prêté</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remboursé</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Restant</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taux (%)</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paiement/Jour</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durée (mois)</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Garantie</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Création</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {paginatedComptes.map((compte) => {
                                    const restant = compte.montant_prete - compte.paiement_rembourse;
                                    return (
                                        <tr key={compte.id_compte_credit} className="hover:bg-gray-50">
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
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{compte.no_compte}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{compte.personne ? `${compte.personne.prenom} ${compte.personne.nom}` : 'N/A'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-semibold">{compte.montant_prete.toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-green-600">{compte.paiement_rembourse.toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600 font-semibold">{restant.toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.taux_interet}%</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.paiement_journalier.toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.duree_credit_mois}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.fonds_garantie.toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                                {new Date(compte.date_creation).toLocaleDateString('fr-FR')}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{getAgentName(compte.created_by)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : compte.statut === 'Payé' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {compte.statut}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={currentPageComptes} totalPages={totalPagesComptes} onPageChange={setCurrentPageComptes} itemsPerPage={itemsPerPageComptes} totalItems={data?.comptes?.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageComptes(v); setCurrentPageComptes(1); }} />
                </div>
            </div>

            <div>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Dernières Transactions Crédit</h2>
                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Heure</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Compte</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde Avant</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Versement Déclaré</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {paginatedTransactions.map((tx) => {
                                    const typeColors = { 'Paiement': 'bg-green-100 text-green-800', 'Penalite': 'bg-red-100 text-red-800', 'Garantie': 'bg-blue-100 text-blue-800' };
                                    return (
                                        <tr key={tx.id_transaction_credit} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                                {new Date(tx.date_transaction).toLocaleString('fr-FR', {
                                                    dateStyle: 'short',
                                                    timeStyle: 'short'
                                                })}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{tx.no_compte}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded ${typeColors[tx.type_transaction]}`}>
                                                    {tx.type_transaction}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{tx.montant.toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{tx.solde_avant_transaction.toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{tx.versement_declare ? tx.versement_declare.toFixed(2) : '-'}</td>
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

export default ComptesCredit;