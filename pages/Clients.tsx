import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { Personne } from '../types';
import { useModal } from '../contexts/ModalContext';
import ClientForm from '../components/modals/ClientForm';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { PlusIcon, EditIcon, TrashIcon } from '../components/icons/Icons';
import Pagination from '../components/common/Pagination';

const Clients: React.FC = () => {
    const { showModal, hideModal } = useModal();
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const clients = useLiveQuery(async () => {
        try {
            if (searchTerm) {
                return await db.personnes
                    .where('nom').startsWithIgnoreCase(searchTerm)
                    .or('prenom').startsWithIgnoreCase(searchTerm)
                    .or('code_client').startsWithIgnoreCase(searchTerm)
                    .toArray();
            }
            return await db.personnes.toArray();
        } catch (error) {
            console.error("Error fetching clients:", error);
            return [];
        }
    }, [searchTerm], []);

    const paginatedClients = useMemo(() => {
        if (!clients) return [];
        const start = (currentPage - 1) * itemsPerPage;
        return clients.slice(start, start + itemsPerPage);
    }, [clients, currentPage, itemsPerPage]);

    const totalPages = clients ? Math.ceil(clients.length / itemsPerPage) : 0;

    const handleAddClient = () => {
        showModal('Ajouter un client', <ClientForm onSave={hideModal} onCancel={hideModal} />);
    };

    const handleEditClient = (client: Personne) => {
        showModal('Modifier le client', <ClientForm client={client} onSave={hideModal} onCancel={hideModal} />);
    };

    const handleDeleteClient = (client: Personne) => {
        const confirmDelete = async () => {
            await db.deletePersonCascade(client.id_personne);
            hideModal();
        };

        showModal(
            'Confirmer la suppression',
            <ConfirmationModal
                title="Supprimer le client"
                message={`Êtes-vous sûr de vouloir supprimer ${client.prenom} ${client.nom} ? Toutes les données associées (comptes, transactions) seront également supprimées.`}
                onConfirm={confirmDelete}
                onCancel={hideModal}
            />
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold text-gray-800">Clients</h1>
                <button
                    onClick={handleAddClient}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Ajouter un client
                </button>
            </div>

            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Rechercher par nom, prénom ou code client..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full px-4 py-2 border rounded-md"
                />
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom & Prénom</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">NIF/CIN</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Adresse</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Occupation</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Création</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {paginatedClients.map((client) => (
                                <tr key={client.id_personne} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{client.code_client}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{`${client.prenom} ${client.nom}`}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{client.numero_telephone}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{client.nif_cin || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{client.adresse || '-'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{client.occupation || '-'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                        {new Date(client.date_creation).toLocaleDateString('fr-FR')}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${client.statut === 'Actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {client.statut}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{client.created_by}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button onClick={() => handleEditClient(client)} className="text-indigo-600 hover:text-indigo-900"><EditIcon className="w-5 h-5" /></button>
                                        <button onClick={() => handleDeleteClient(client)} className="text-red-600 hover:text-red-900"><TrashIcon className="w-5 h-5" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={clients?.length || 0}
                    onItemsPerPageChange={(value) => { setItemsPerPage(value); setCurrentPage(1); }}
                />
            </div>
        </div>
    );
};

export default Clients;