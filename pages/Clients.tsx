import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { Personne } from '../types';
import { useModal } from '../contexts/ModalContext';
import ClientForm from '../components/modals/ClientForm';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { PlusIcon, EditIcon, TrashIcon, KeyIcon } from '../components/icons/Icons';
import Pagination from '../components/common/Pagination';
import SecureWrapper from '../components/common/SecureWrapper';
import FAB from '../components/common/FAB';
import { useAuthStore } from '../stores/authStore';
import { accessService } from '../services/accessService';
import { UserRole, UserProfile } from '../types/auth';
import AccessGrantModal from '../components/modals/AccessGrantModal';
import toast from 'react-hot-toast';
import * as authService from '../services/supabaseAuth';
import { copyToClipboard } from '../utils/clipboard';

interface ClientAvatarProps {
    client: Personne;
    onPreview?: () => void;
}

const ClientAvatar: React.FC<ClientAvatarProps> = ({ client, onPreview }) => {
    const [loadError, setLoadError] = useState(false);
    const photo = client.photo_identification;
    const initials = `${client.prenom?.[0] || ''}${client.nom?.[0] || ''}`.toUpperCase() || 'CL';

    if (!photo || loadError) {
        return (
            <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-semibold border border-gray-300">
                {initials}
            </div>
        );
    }

    const canPreview = Boolean(photo && !loadError && onPreview);

    return (
        <button
            type="button"
            onClick={onPreview}
            disabled={!canPreview}
            title={canPreview ? 'Voir la photo' : 'Aucune photo disponible'}
            className={`rounded-full ${canPreview ? 'cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1' : 'cursor-default'}`}
        >
            <img
                src={photo}
                alt={`Photo ${client.prenom} ${client.nom}`}
                className="h-10 w-10 rounded-full object-cover border border-gray-300"
                onError={() => setLoadError(true)}
            />
        </button>
    );
};

const Clients: React.FC = () => {
    const { showModal, hideModal } = useModal();
    const { profile } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());

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

    const getAgentName = (userId: string | undefined) => {
        if (!userId) return '-';
        return profilesMap.get(userId) || 'Agent';
    };

    const clients = useLiveQuery(async () => {
        if (searchTerm) {
            return await db.personnes
                .where('nom').startsWithIgnoreCase(searchTerm)
                .or('prenom').startsWithIgnoreCase(searchTerm)
                .or('code_client').startsWithIgnoreCase(searchTerm)
                .toArray();
        }
        return await db.personnes.toArray();
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

    const handleEditClient = async (client: Personne) => {
        const hasAccess = await accessService.hasAccess(client.id_personne);
        if (!hasAccess) {
            toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
            return;
        }
        showModal('Modifier le client', <ClientForm client={client} onSave={hideModal} onCancel={hideModal} />);
    };

    const handleGrantAccess = (client: Personne) => {
        showModal('Accorder acces', <AccessGrantModal clientId={client.id_personne} clientName={client.prenom + ' ' + client.nom} onClose={hideModal} />);
    };

    const handlePreviewPhoto = (client: Personne) => {
        if (!client.photo_identification) {
            return;
        }
        showModal(
            `Photo - ${client.prenom} ${client.nom}`,
            <div className="flex justify-center">
                <img
                    src={client.photo_identification}
                    alt={`Photo ${client.prenom} ${client.nom}`}
                    className="w-full max-w-md max-h-[70vh] object-contain rounded-md border border-gray-200"
                />
            </div>
        );
    };

    const handleDeleteClient = async (client: Personne) => {
        const hasAccess = await accessService.hasAccess(client.id_personne);
        if (!hasAccess) {
            toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
            return;
        }

        const confirmDelete = async () => {
            await db.deletePersonCascade(client.id_personne);
            hideModal();
        };

        showModal(
            'Confirmer la suppression',
            <ConfirmationModal
                title="Supprimer le client"
                message={`Etes-vous sur de vouloir supprimer ${client.prenom} ${client.nom} ? Toutes les donnees associees (comptes, transactions) seront aussi supprimees.`}
                onConfirm={confirmDelete}
                onCancel={hideModal}
            />
        );
    };

    return (
        <SecureWrapper>
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Clients</h1>
                    <button
                        onClick={handleAddClient}
                        className="hidden md:flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                        <PlusIcon className="w-4 h-4 mr-2" />
                        Ajouter un client
                    </button>
                </div>

                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Rechercher par nom, prenom ou code client..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="w-full px-4 py-3 sm:py-2 text-base sm:text-sm border rounded-lg min-h-[44px]"
                    />
                </div>

                {/* Mobile: Card View */}
                <div className="space-y-3 md:hidden">
                    {paginatedClients.map((client) => (
                        <div key={client.id_personne} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <ClientAvatar client={client} onPreview={() => handlePreviewPhoto(client)} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-gray-900 truncate">{client.prenom} {client.nom}</p>
                                        <span className={`shrink-0 px-2 text-xs leading-5 font-semibold rounded-full ${client.statut === 'Actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {client.statut}
                                        </span>
                                    </div>
                                    <p className="text-xs text-blue-600 font-mono cursor-pointer" onClick={() => copyToClipboard(client.code_client, 'Code client')}>
                                        {client.code_client}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                                <div><span className="text-gray-500 text-xs">Tel</span><p className="text-gray-900">{client.numero_telephone}</p></div>
                                <div><span className="text-gray-500 text-xs">NIF/CIN</span><p className="text-gray-600">{client.nif_cin || '-'}</p></div>
                                <div><span className="text-gray-500 text-xs">Agent</span><p className="text-gray-700 truncate">{getAgentName(client.created_by)}</p></div>
                                <div><span className="text-gray-500 text-xs">Date</span><p className="text-gray-600">{new Date(client.date_creation).toLocaleDateString('fr-FR')}</p></div>
                            </div>
                            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                                <button onClick={() => handleEditClient(client)} className="flex-1 flex items-center justify-center gap-1 py-2 text-sm text-indigo-600 bg-indigo-50 rounded-lg min-h-[40px]">
                                    <EditIcon className="w-4 h-4" /> Modifier
                                </button>
                                <button onClick={() => handleDeleteClient(client)} className="flex-1 flex items-center justify-center gap-1 py-2 text-sm text-red-600 bg-red-50 rounded-lg min-h-[40px]">
                                    <TrashIcon className="w-4 h-4" /> Supprimer
                                </button>
                                {profile?.role === UserRole.ADMIN && (
                                    <button onClick={() => handleGrantAccess(client)} className="py-2 px-3 text-yellow-600 bg-yellow-50 rounded-lg min-h-[40px]" title="Accorder acces">
                                        <KeyIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} itemsPerPage={itemsPerPage} totalItems={clients?.length || 0} onItemsPerPageChange={(value) => { setItemsPerPage(value); setCurrentPage(1); }} />
                </div>

                {/* Desktop: Table View */}
                <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom & Prenom</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telephone</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">NIF/CIN</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Adresse</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Occupation</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date creation</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {paginatedClients.map((client) => (
                                    <tr key={client.id_personne} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600" onClick={() => copyToClipboard(client.code_client, 'Code client')} title="Cliquer pour copier">{client.code_client}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"><ClientAvatar client={client} onPreview={() => handlePreviewPhoto(client)} /></td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{`${client.prenom} ${client.nom}`}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{client.numero_telephone}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{client.nif_cin || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{client.adresse || '-'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{client.occupation || '-'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{new Date(client.date_creation).toLocaleDateString('fr-FR')}</td>
                                        <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${client.statut === 'Actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{client.statut}</span></td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{getAgentName(client.created_by)}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                            <button onClick={() => handleEditClient(client)} className="text-indigo-600 hover:text-indigo-900"><EditIcon className="w-5 h-5" /></button>
                                            <button onClick={() => handleDeleteClient(client)} className="text-red-600 hover:text-red-900"><TrashIcon className="w-5 h-5" /></button>
                                            {profile?.role === UserRole.ADMIN && (<button onClick={() => handleGrantAccess(client)} className="text-yellow-600 hover:text-yellow-900" title="Accorder acces temporaire"><KeyIcon className="w-5 h-5" /></button>)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} itemsPerPage={itemsPerPage} totalItems={clients?.length || 0} onItemsPerPageChange={(value) => { setItemsPerPage(value); setCurrentPage(1); }} />
                </div>

                <FAB onClick={handleAddClient} label="Ajouter un client" />
            </div>
        </SecureWrapper>
    );
};

export default Clients;

