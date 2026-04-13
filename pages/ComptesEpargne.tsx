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
import FAB from '../components/common/FAB';
import { useAuthStore } from '../stores/authStore';
import { accessService } from '../services/accessService';
import { UserRole, UserProfile } from '../types/auth';
import AccessGrantModal from '../components/modals/AccessGrantModal';
import toast from 'react-hot-toast';
import * as authService from '../services/supabaseAuth';
import { copyToClipboard } from '../utils/clipboard';
import { getSuccursaleLabel } from '../utils/succursale';

type SortOption = 'created_desc' | 'created_asc' | 'updated_desc' | 'updated_asc';
type ViewMode = 'comptes' | 'transactions';

interface ComptesEpargneProps {
  onViewDetails?: (id: string) => void;
}

const typeLabels: Record<string, string> = {
  D: 'Depot',
  R: 'Retrait',
  FL: 'Nouveau Livret',
  S: 'Frais Service',
  FA: 'Frais Auto',
  V: 'Virement',
};

const typeColors: Record<string, string> = {
  D: 'bg-green-100 text-green-800',
  R: 'bg-red-100 text-red-800',
  FL: 'bg-orange-100 text-orange-800',
  S: 'bg-yellow-100 text-yellow-800',
  FA: 'bg-purple-100 text-purple-800',
  V: 'bg-blue-100 text-blue-800',
};

const getSortTimestamp = (compte: CompteEpargneAvecPersonne, sortOption: SortOption) => {
  const createdAt = new Date(compte.created_at || compte.date_creation || '').getTime() || 0;
  const updatedAt = new Date(compte.updated_at || compte.created_at || compte.date_creation || '').getTime() || createdAt;
  return sortOption.startsWith('updated') ? updatedAt : createdAt;
};

const ComptesEpargne: React.FC<ComptesEpargneProps> = ({ onViewDetails }) => {
  const { showModal, hideModal } = useModal();
  const { profile } = useAuthStore();
  const canViewBalances = profile?.role === UserRole.ADMIN;
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('created_desc');
  const [activeView, setActiveView] = useState<ViewMode>('comptes');
  const [currentPageComptes, setCurrentPageComptes] = useState(1);
  const [itemsPerPageComptes, setItemsPerPageComptes] = useState(10);
  const [currentPageTransactions, setCurrentPageTransactions] = useState(1);
  const [itemsPerPageTransactions, setItemsPerPageTransactions] = useState(10);
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

      const transactionsEnriched: TransactionEpargneEnriched[] = transactions.map(tx => {
        const idPersonne = comptesMap.get(tx.id_compte_epargne)?.id_personne;
        const personne = idPersonne ? personnesMap.get(idPersonne) : undefined;
        return {
          ...tx,
          id_personne: idPersonne,
          client_name: personne ? `${personne.prenom} ${personne.nom}` : undefined,
        };
      });

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        comptesAvecPersonne = comptesAvecPersonne.filter(c =>
          c.no_compte?.toLowerCase().includes(lower) ||
          c.no_compte_ancien?.toLowerCase().includes(lower) ||
          c.type_compte_epargne?.toLowerCase().includes(lower) ||
          c.categorie_compte_epargne?.toLowerCase().includes(lower) ||
          c.personne?.nom?.toLowerCase().includes(lower) ||
          c.personne?.prenom?.toLowerCase().includes(lower)
        );
      }

      return { comptes: comptesAvecPersonne, transactions: transactionsEnriched };
    } catch (error) {
      console.error('Error fetching savings accounts:', error);
      return { comptes: [], transactions: [] };
    }
  }, [searchTerm], { comptes: [], transactions: [] });

  const sortedComptes = useMemo(() => {
    const comptes = data?.comptes || [];
    const isAsc = sortOption.endsWith('_asc');
    return [...comptes].sort((a, b) => {
      const dateA = getSortTimestamp(a, sortOption);
      const dateB = getSortTimestamp(b, sortOption);
      return isAsc ? dateA - dateB : dateB - dateA;
    });
  }, [data?.comptes, sortOption]);

  const paginatedComptes = useMemo(() => {
    const start = (currentPageComptes - 1) * itemsPerPageComptes;
    return sortedComptes.slice(start, start + itemsPerPageComptes);
  }, [sortedComptes, currentPageComptes, itemsPerPageComptes]);

  const totalPagesComptes = Math.ceil((sortedComptes.length || 0) / itemsPerPageComptes);

  const paginatedTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    const start = (currentPageTransactions - 1) * itemsPerPageTransactions;
    return data.transactions.slice(start, start + itemsPerPageTransactions);
  }, [data?.transactions, currentPageTransactions, itemsPerPageTransactions]);

  const totalPagesTransactions = Math.ceil((data?.transactions?.length || 0) / itemsPerPageTransactions);

  const handleAddCompte = () => {
    showModal('Creer un compte epargne', <CompteEpargneForm onSave={hideModal} onCancel={hideModal} />);
  };

  const handleEditCompte = async (compte: CompteEpargneAvecPersonne) => {
    const hasAccess = await accessService.hasAccessToCompteEpargne(compte.id_personne, compte.id_compte_epargne);
    if (!hasAccess) {
      toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
      return;
    }
    showModal('Modifier le compte epargne', <CompteEpargneForm compte={compte} onSave={hideModal} onCancel={hideModal} />);
  };

  const handleDeleteCompte = async (compte: CompteEpargneAvecPersonne) => {
    const hasAccess = await accessService.hasAccessToCompteEpargne(compte.id_personne, compte.id_compte_epargne);
    if (!hasAccess) {
      toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
      return;
    }

    showModal('Confirmer la suppression', <ConfirmationModal
      title="Supprimer Compte Epargne"
      message={`Voulez-vous vraiment supprimer le compte ${compte.no_compte} ? Ceci supprimera egalement tous les comptes de credit et transactions associes.`}
      onConfirm={async () => {
        await db.deleteCompteEpargneCascade(compte.id_compte_epargne);
        hideModal();
      }}
      onCancel={hideModal}
    />);
  };

  const handleGrantAccessCompte = (compte: CompteEpargneAvecPersonne) => {
    if (!compte.personne) {
      toast.error('Client introuvable');
      return;
    }
    showModal('Accorder acces', <AccessGrantModal
      clientId={compte.id_personne}
      clientName={`${compte.personne.prenom} ${compte.personne.nom}`}
      scopeType="compte_epargne"
      compteEpargneId={compte.id_compte_epargne}
      resourceLabel={`Compte épargne ${compte.no_compte || ''}`.trim()}
      onClose={hideModal}
    />);
  };

  const handleAddTransaction = (compte: CompteEpargneAvecPersonne) => {
    showModal(`Transaction pour ${compte.no_compte}`, <TransactionEpargneForm compteEpargne={compte} onSave={hideModal} onCancel={hideModal} />);
  };

  const handleEditTransaction = async (tx: TransactionEpargneEnriched) => {
    if (!tx.id_personne) {
      toast.error('Impossible de verifier l acces');
      return;
    }
    const hasAccess = await accessService.hasAccess(tx.id_personne, tx.id_transaction_epargne);
    if (!hasAccess) {
      toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
      return;
    }

    const compte = data.comptes.find(c => c.id_compte_epargne === tx.id_compte_epargne);
    if (!compte) {
      toast.error('Compte introuvable');
      return;
    }

    showModal('Modifier Transaction', <TransactionEpargneForm compteEpargne={compte} transaction={tx as TransactionEpargne} onSave={hideModal} onCancel={hideModal} />);
  };

  const handleDeleteTransaction = async (tx: TransactionEpargneEnriched) => {
    if (!tx.id_personne) {
      toast.error('Impossible de verifier l acces');
      return;
    }
    const hasAccess = await accessService.hasAccess(tx.id_personne, tx.id_transaction_epargne);
    if (!hasAccess) {
      toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
      return;
    }

    showModal('Confirmer la suppression', <ConfirmationModal
      title="Supprimer Transaction"
      message={`Voulez-vous vraiment supprimer cette transaction de ${tx.montant} ?`}
      onConfirm={async () => {
        await db.deleteRecord('transactions_epargne', tx.id_transaction_epargne);
        hideModal();
      }}
      onCancel={hideModal}
    />);
  };

  const handleGrantAccessTransaction = (tx: TransactionEpargneEnriched) => {
    if (!tx.id_personne) {
      toast.error('Client introuvable');
      return;
    }
    showModal('Accorder acces', <AccessGrantModal
      clientId={tx.id_personne}
      clientName={tx.client_name || 'Client'}
      transactionId={tx.id_transaction_epargne}
      transactionType="epargne"
      scopeType="transaction_epargne"
      onClose={hideModal}
    />);
  };

  const openPhotoPreview = (title: string, photoUrl: string) => {
    showModal(
      title,
      <div className="space-y-3">
        <div className="w-full max-h-[70vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
          <img src={photoUrl} alt={title} className="w-full h-auto rounded-md object-contain" />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={hideModal}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  };

  return (
    <SecureWrapper>
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-1 inline-flex w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveView('comptes')}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'comptes' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            Comptes ({sortedComptes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('transactions')}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'transactions' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            Transactions ({data?.transactions?.length || 0})
          </button>
        </div>

        {activeView === 'comptes' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Comptes d'Epargne</h1>
            <button onClick={handleAddCompte} className="hidden md:flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
              <PlusIcon className="w-4 h-4 mr-2" />
              Creer un compte
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Rechercher par numero de compte, compte ancien, type, categorie ou client..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPageComptes(1); }}
              className="w-full md:col-span-2 px-4 py-3 sm:py-2 text-base sm:text-sm border rounded-lg min-h-[44px]"
            />
            <select
              value={sortOption}
              onChange={(e) => {
                setSortOption(e.target.value as SortOption);
                setCurrentPageComptes(1);
              }}
              className="w-full px-4 py-3 sm:py-2 text-base sm:text-sm border rounded-lg min-h-[44px] bg-white"
            >
              <option value="created_desc">Creation: plus recent</option>
              <option value="created_asc">Creation: plus ancien</option>
              <option value="updated_desc">Modification: plus recente</option>
              <option value="updated_asc">Modification: plus ancienne</option>
            </select>
          </div>

          <div className="space-y-3 md:hidden">
            {paginatedComptes.map((compte) => {
              const succursaleLabel = getSuccursaleLabel(compte.succursale) || compte.succursale || '-';
              const clientPhoto = compte.personne?.photo_identification;
              const authorizedPhoto = compte.photo_personne_autorisee;

              return (
                <div key={compte.id_compte_epargne} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className={`flex justify-between items-start mb-2 ${onViewDetails ? 'cursor-pointer' : ''}`} onClick={() => onViewDetails?.(compte.id_compte_epargne)}>
                  <div>
                    <p className="font-mono text-sm font-semibold text-gray-900 cursor-pointer" onClick={(e) => { e.stopPropagation(); copyToClipboard(compte.no_compte, 'Numero de compte'); }}>{compte.no_compte || '-'}</p>
                    <p className="text-sm text-gray-700">{compte.personne ? `${compte.personne.prenom} ${compte.personne.nom}` : 'N/A'}</p>
                    <p className="text-xs text-gray-500">Code ancien: {compte.no_compte_ancien || '-'}</p>
                  </div>
                  <span className={`px-2 text-xs font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{compte.statut}</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    disabled={!clientPhoto}
                    onClick={() => clientPhoto && openPhotoPreview('Photo client', clientPhoto)}
                    className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Photo client
                  </button>
                  <button
                    type="button"
                    disabled={!authorizedPhoto}
                    onClick={() => authorizedPhoto && openPhotoPreview('Photo personne autorisee', authorizedPhoto)}
                    className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Photo autorisee
                  </button>
                </div>

                {canViewBalances && (
                  <div className="bg-blue-50 rounded-lg p-3 mb-3">
                    <p className="text-xs text-blue-600">Solde Actuel</p>
                    <p className="text-xl font-bold text-blue-900">{(compte.solde_actuel ?? 0).toFixed(2)} HTG</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div><span className="text-gray-500 text-xs">Categorie</span><p>{compte.categorie_compte_epargne || '-'}</p></div>
                  <div><span className="text-gray-500 text-xs">Type</span><p>{compte.type_compte_epargne || '-'}</p></div>
                  <div><span className="text-gray-500 text-xs">Succursale</span><p>{succursaleLabel}</p></div>
                  <div><span className="text-gray-500 text-xs">Agent</span><p className="truncate">{getAgentName(compte.created_by)}</p></div>
                  <div><span className="text-gray-500 text-xs">Date</span><p>{new Date(compte.date_creation).toLocaleDateString('fr-FR')}</p></div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => onViewDetails?.(compte.id_compte_epargne)} disabled={!onViewDetails} className="flex-1 py-2 text-sm text-blue-700 bg-blue-100 rounded-lg min-h-[40px] disabled:opacity-60">Details</button>
                  <button onClick={() => handleAddTransaction(compte)} className="flex-1 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg min-h-[40px] flex items-center justify-center gap-1"><ArrowRightLeftIcon className="w-4 h-4" /> Transaction</button>
                  <button onClick={() => handleEditCompte(compte)} className="py-2 px-3 text-indigo-600 bg-indigo-50 rounded-lg min-h-[40px]"><EditIcon className="w-4 h-4" /></button>
                  <button onClick={() => handleDeleteCompte(compte)} className="py-2 px-3 text-red-600 bg-red-50 rounded-lg min-h-[40px]"><TrashIcon className="w-4 h-4" /></button>
                  {profile?.role === UserRole.ADMIN && (<button onClick={() => handleGrantAccessCompte(compte)} className="py-2 px-3 text-yellow-600 bg-yellow-50 rounded-lg min-h-[40px]"><KeyIcon className="w-4 h-4" /></button>)}
                </div>
                </div>
              );
            })}
            <Pagination currentPage={currentPageComptes} totalPages={totalPagesComptes} onPageChange={setCurrentPageComptes} itemsPerPage={itemsPerPageComptes} totalItems={sortedComptes.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageComptes(v); setCurrentPageComptes(1); }} />
          </div>

          <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N Compte</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N Ancien</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Photo Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Photo Autorisee</th>
                    {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde Actuel</th>}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categorie</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Creation</th>
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
                          <button onClick={() => onViewDetails?.(compte.id_compte_epargne)} className="text-blue-700 hover:text-blue-900 disabled:opacity-60" title="Voir details" disabled={!onViewDetails}>Details</button>
                          <button onClick={() => handleAddTransaction(compte)} className="text-blue-600 hover:text-blue-800" title="Nouvelle Transaction"><ArrowRightLeftIcon className="w-5 h-5" /></button>
                          <button onClick={() => handleEditCompte(compte)} className="text-indigo-600 hover:text-indigo-800" title="Modifier"><EditIcon className="w-5 h-5" /></button>
                          <button onClick={() => handleDeleteCompte(compte)} className="text-red-600 hover:text-red-800" title="Supprimer"><TrashIcon className="w-5 h-5" /></button>
                          {profile?.role === UserRole.ADMIN && (<button onClick={() => handleGrantAccessCompte(compte)} className="text-yellow-600 hover:text-yellow-900" title="Accorder acces temporaire"><KeyIcon className="w-5 h-5" /></button>)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600" onClick={() => copyToClipboard(compte.no_compte, 'Numero de compte')} title="Cliquer pour copier">{compte.no_compte || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.no_compte_ancien || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{compte.personne ? `${compte.personne.prenom} ${compte.personne.nom}` : 'N/A'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {compte.personne?.photo_identification ? (
                          <button
                            type="button"
                            onClick={() => openPhotoPreview('Photo client', compte.personne!.photo_identification!)}
                            className="text-blue-700 hover:text-blue-900"
                          >
                            Voir
                          </button>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {compte.photo_personne_autorisee ? (
                          <button
                            type="button"
                            onClick={() => openPhotoPreview('Photo personne autorisee', compte.photo_personne_autorisee!)}
                            className="text-indigo-700 hover:text-indigo-900"
                          >
                            Voir
                          </button>
                        ) : '-'}
                      </td>
                      {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-semibold">{(compte.solde_actuel ?? 0).toFixed(2)}</td>}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.categorie_compte_epargne || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.type_compte_epargne || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{new Date(compte.date_creation).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{getSuccursaleLabel(compte.succursale) || compte.succursale || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{getAgentName(compte.created_by)}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{compte.statut}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={currentPageComptes} totalPages={totalPagesComptes} onPageChange={setCurrentPageComptes} itemsPerPage={itemsPerPageComptes} totalItems={sortedComptes.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageComptes(v); setCurrentPageComptes(1); }} />
          </div>

          <FAB onClick={handleAddCompte} label="Creer un compte epargne" />
        </div>
        )}

        {activeView === 'transactions' && (
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">Dernieres Transactions Epargne</h2>

          <div className="space-y-2 md:hidden">
            {paginatedTransactions.map((tx) => (
              <div key={tx.id_transaction_epargne} className="bg-white rounded-lg shadow-sm border p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded ${typeColors[tx.type_transaction] || 'bg-gray-100 text-gray-800'}`}>{typeLabels[tx.type_transaction] || tx.type_transaction}</span>
                  <span className="text-xs text-gray-500">{tx.date_transaction ? new Date(tx.date_transaction).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-500">Compte: {tx.no_compte || '-'}</p>
                    <p className="text-xs text-gray-500">Client: {tx.client_name || '-'}</p>
                    <p className="font-semibold text-lg">{(tx.montant ?? 0).toFixed(2)} HTG</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleEditTransaction(tx)} className="p-2 text-indigo-600 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"><EditIcon className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteTransaction(tx)} className="p-2 text-red-600 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"><TrashIcon className="w-4 h-4" /></button>
                    {profile?.role === UserRole.ADMIN && (<button onClick={() => handleGrantAccessTransaction(tx)} className="p-2 text-yellow-600 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"><KeyIcon className="w-4 h-4" /></button>)}
                  </div>
                </div>
              </div>
            ))}
            <Pagination currentPage={currentPageTransactions} totalPages={totalPagesTransactions} onPageChange={setCurrentPageTransactions} itemsPerPage={itemsPerPageTransactions} totalItems={data?.transactions?.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageTransactions(v); setCurrentPageTransactions(1); }} />
          </div>

          <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Heure</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N Compte</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                    {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde Avant (Declare)</th>}
                    {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde Apres (Declare)</th>}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedTransactions.map((tx) => (
                    <tr key={tx.id_transaction_epargne} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button onClick={() => handleEditTransaction(tx)} className="text-indigo-600 hover:text-indigo-900" title="Modifier"><EditIcon className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteTransaction(tx)} className="text-red-600 hover:text-red-900" title="Supprimer"><TrashIcon className="w-4 h-4" /></button>
                          {profile?.role === UserRole.ADMIN && (<button onClick={() => handleGrantAccessTransaction(tx)} className="text-yellow-600 hover:text-yellow-900" title="Accorder acces transaction"><KeyIcon className="w-4 h-4" /></button>)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{tx.date_transaction ? new Date(tx.date_transaction).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{tx.no_compte || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{tx.client_name || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-semibold rounded ${typeColors[tx.type_transaction] || 'bg-gray-100 text-gray-800'}`}>{typeLabels[tx.type_transaction] || tx.type_transaction}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{(tx.montant ?? 0).toFixed(2)}</td>
                      {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{(tx.solde_avant_transaction_declare ?? 0).toFixed(2)}</td>}
                      {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{(tx.solde_apres_transaction_declare ?? 0).toFixed(2)}</td>}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{getAgentName(tx.created_by)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={currentPageTransactions} totalPages={totalPagesTransactions} onPageChange={setCurrentPageTransactions} itemsPerPage={itemsPerPageTransactions} totalItems={data?.transactions?.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageTransactions(v); setCurrentPageTransactions(1); }} />
          </div>
        </div>
        )}
      </div>
    </SecureWrapper>
  );
};

export default ComptesEpargne;
