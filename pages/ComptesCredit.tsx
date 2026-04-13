import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/database';
import { CompteCreditEnriched, TransactionCreditEnriched, TransactionCredit } from '../types';
import { useModal } from '../contexts/ModalContext';
import CompteCreditForm from '../components/modals/CompteCreditForm';
import TransactionCreditForm from '../components/modals/TransactionCreditForm';
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
import { getCreditFinalCapital, getCreditMontantRestant, getCreditTotalRembourse } from '../utils/creditCalculations';

type SortOption = 'created_desc' | 'created_asc' | 'updated_desc' | 'updated_asc';
type ViewMode = 'comptes' | 'transactions';

interface ComptesCreditProps {
  onViewDetails?: (id: string) => void;
}

const getSortTimestamp = (compte: CompteCreditEnriched, sortOption: SortOption) => {
  const createdAt = new Date(compte.created_at || compte.date_creation || '').getTime() || 0;
  const updatedAt = new Date(compte.updated_at || compte.created_at || compte.date_creation || '').getTime() || createdAt;
  return sortOption.startsWith('updated') ? updatedAt : createdAt;
};

const computeMissedPayments = (compte: CompteCreditEnriched, paymentsCount: number) => {
  if (!compte.date_debut) return 0;

  const start = new Date(compte.date_debut);
  if (Number.isNaN(start.getTime())) return 0;

  const end = compte.date_fin ? new Date(compte.date_fin) : new Date();
  const effectiveEnd = end.getTime() < Date.now() ? end : new Date();
  const daysPassed = Math.max(0, Math.floor((effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  return Math.max(0, daysPassed - paymentsCount);
};

const ComptesCredit: React.FC<ComptesCreditProps> = ({ onViewDetails }) => {
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
      const allComptes = await db.comptes_credit.toArray();
      const personnes = await db.personnes.toArray();
      const transactions = await db.transactions_credit.orderBy('date_transaction').reverse().toArray();

      const personnesMap = new Map(personnes.map(p => [p.id_personne, p]));
      const comptesMap = new Map(allComptes.map(c => [c.id_compte_credit, c]));

      let comptesAvecPersonne: CompteCreditEnriched[] = allComptes.map(compte => ({
        ...compte,
        personne: personnesMap.get(compte.id_personne),
      }));

      const transactionsEnriched: TransactionCreditEnriched[] = transactions.map(tx => {
        const idPersonne = comptesMap.get(tx.id_compte_credit)?.id_personne;
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
          c.ancien_code?.toLowerCase().includes(lower) ||
          c.personne?.nom?.toLowerCase().includes(lower) ||
          c.personne?.prenom?.toLowerCase().includes(lower)
        );
      }

      return { comptes: comptesAvecPersonne, transactions: transactionsEnriched };
    } catch (error) {
      console.error('Error fetching credit accounts:', error);
      return { comptes: [], transactions: [] };
    }
  }, [searchTerm], { comptes: [], transactions: [] });

  const paymentsByCompte = useMemo(() => {
    const map = new Map<string, number>();
    (data?.transactions || []).forEach(tx => {
      if (tx.type_transaction === 'Paiement') {
        map.set(tx.id_compte_credit, (map.get(tx.id_compte_credit) || 0) + 1);
      }
    });
    return map;
  }, [data?.transactions]);

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
    showModal('Creer un compte credit', <CompteCreditForm onSave={hideModal} onCancel={hideModal} />);
  };

  const handleEditCompte = async (compte: CompteCreditEnriched) => {
    const hasAccess = await accessService.hasAccessToCompteCredit(compte.id_personne, compte.id_compte_credit);
    if (!hasAccess) {
      toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
      return;
    }
    showModal('Modifier le compte credit', <CompteCreditForm compte={compte} onSave={hideModal} onCancel={hideModal} />);
  };

  const handleDeleteCompte = async (compte: CompteCreditEnriched) => {
    const hasAccess = await accessService.hasAccessToCompteCredit(compte.id_personne, compte.id_compte_credit);
    if (!hasAccess) {
      toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
      return;
    }
    showModal('Confirmer la suppression', <ConfirmationModal
      title="Supprimer Compte Credit"
      message={`Voulez-vous vraiment supprimer le compte ${compte.no_compte} ? Ceci supprimera egalement toutes les transactions associees.`}
      onConfirm={async () => {
        await db.deleteCompteCreditCascade(compte.id_compte_credit);
        hideModal();
      }}
      onCancel={hideModal}
    />);
  };

  const handleGrantAccessCompte = (compte: CompteCreditEnriched) => {
    if (!compte.personne) {
      toast.error('Client introuvable');
      return;
    }
    showModal('Accorder acces', <AccessGrantModal
      clientId={compte.id_personne}
      clientName={`${compte.personne.prenom} ${compte.personne.nom}`}
      scopeType="compte_credit"
      compteCreditId={compte.id_compte_credit}
      resourceLabel={`Compte crédit ${compte.no_compte || ''}`.trim()}
      onClose={hideModal}
    />);
  };

  const handleAddTransaction = (compte: CompteCreditEnriched) => {
    showModal(`Transaction pour ${compte.no_compte}`, <TransactionCreditForm compteCredit={compte} onSave={hideModal} onCancel={hideModal} />);
  };

  const handleEditTransaction = async (tx: TransactionCreditEnriched) => {
    if (!tx.id_personne) {
      toast.error('Impossible de verifier l acces');
      return;
    }
    const hasAccess = await accessService.hasAccess(tx.id_personne, tx.id_transaction_credit);
    if (!hasAccess) {
      toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
      return;
    }

    const compte = data.comptes.find(c => c.id_compte_credit === tx.id_compte_credit);
    if (!compte) {
      toast.error('Compte introuvable');
      return;
    }

    showModal('Modifier Transaction', <TransactionCreditForm compteCredit={compte} transaction={tx as TransactionCredit} onSave={hideModal} onCancel={hideModal} />);
  };

  const handleDeleteTransaction = async (tx: TransactionCreditEnriched) => {
    if (!tx.id_personne) {
      toast.error('Impossible de verifier l acces');
      return;
    }
    const hasAccess = await accessService.hasAccess(tx.id_personne, tx.id_transaction_credit);
    if (!hasAccess) {
      toast.error('Acces refuse. Demandez un acces temporaire a un administrateur.');
      return;
    }
    showModal('Confirmer la suppression', <ConfirmationModal
      title="Supprimer Transaction"
      message={`Voulez-vous vraiment supprimer cette transaction de ${tx.montant} ?`}
      onConfirm={async () => {
        await db.deleteRecord('transactions_credit', tx.id_transaction_credit);
        hideModal();
      }}
      onCancel={hideModal}
    />);
  };

  const handleGrantAccessTransaction = (tx: TransactionCreditEnriched) => {
    if (!tx.id_personne) {
      toast.error('Client introuvable');
      return;
    }

    showModal('Accorder acces transaction', <AccessGrantModal
      clientId={tx.id_personne}
      clientName={tx.client_name || 'Client inconnu'}
      transactionId={tx.id_transaction_credit}
      transactionType="credit"
      scopeType="transaction_credit"
      onClose={hideModal}
    />);
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
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Comptes de Credit</h1>
            <button onClick={handleAddCompte} className="hidden md:flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
              <PlusIcon className="w-4 h-4 mr-2" />
              Creer un compte
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Rechercher par numero de compte, code ancien ou nom de client..."
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
              const paiementManuel = compte.montant_deja_paye_manuellement || 0;
              const totalRembourse = getCreditTotalRembourse(compte);
              const capitalFinal = getCreditFinalCapital(compte);
              const restant = getCreditMontantRestant(compte);
              const missedPayments = computeMissedPayments(compte, paymentsByCompte.get(compte.id_compte_credit) || 0);

              return (
                <div key={compte.id_compte_credit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className={`flex justify-between items-start mb-2 ${onViewDetails ? 'cursor-pointer' : ''}`} onClick={() => onViewDetails?.(compte.id_compte_credit)}>
                    <div>
                      <p className="font-mono text-sm font-semibold text-gray-900 cursor-pointer" onClick={(e) => { e.stopPropagation(); copyToClipboard(compte.no_compte, 'Numero de compte'); }}>{compte.no_compte}</p>
                      <p className="text-sm text-gray-700">{compte.personne ? `${compte.personne.prenom} ${compte.personne.nom}` : 'N/A'}</p>
                    </div>
                    <span className={`px-2 text-xs font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : (compte.statut === 'Paye' || compte.statut === 'Payé') ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{compte.statut}</span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
                    {canViewBalances && <div className="flex justify-between text-sm"><span className="text-gray-600">Prete</span><span className="font-semibold">{(compte.montant_prete || 0).toFixed(2)}</span></div>}
                    {canViewBalances && <div className="flex justify-between text-sm"><span className="text-gray-600">Capital final</span><span className="font-semibold">{capitalFinal.toFixed(2)}</span></div>}
                    {canViewBalances && <div className="flex justify-between text-sm"><span className="text-gray-600">Rembourse</span><span className="text-green-600 font-semibold">{totalRembourse.toFixed(2)}</span></div>}
                    {canViewBalances && <div className="flex justify-between text-sm border-t pt-1"><span className="text-gray-800 font-semibold">Restant</span><span className="text-red-600 font-bold">{restant.toFixed(2)}</span></div>}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div><span className="text-gray-500 text-xs">Date fin</span><p>{compte.date_fin ? new Date(compte.date_fin).toLocaleDateString('fr-FR') : '-'}</p></div>
                    <div><span className="text-gray-500 text-xs">Versements rates</span><p>{missedPayments}</p></div>
                    <div><span className="text-gray-500 text-xs">Code ancien</span><p>{compte.ancien_code || '-'}</p></div>
                    <div><span className="text-gray-500 text-xs">Paiement/Jour</span><p>{(compte.paiement_journalier || 0).toFixed(2)}</p></div>
                    <div><span className="text-gray-500 text-xs">Agent</span><p className="truncate">{getAgentName(compte.created_by)}</p></div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <button onClick={() => onViewDetails?.(compte.id_compte_credit)} disabled={!onViewDetails} className="flex-1 py-2 text-sm text-blue-700 bg-blue-100 rounded-lg min-h-[40px] disabled:opacity-60">Details</button>
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
                <thead className="bg-gray-50"><tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N Compte</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code Ancien</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant Prete</th>}
                  {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capital Final</th>}
                  {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paye Manuel</th>}
                  {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rembourse Total</th>}
                  {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Restant</th>}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Fin</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                </tr></thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedComptes.map((compte) => {
                    const paiementManuel = compte.montant_deja_paye_manuellement || 0;
                    const totalRembourse = getCreditTotalRembourse(compte);
                    const capitalFinal = getCreditFinalCapital(compte);
                    const restant = getCreditMontantRestant(compte);
                    return (
                      <tr key={compte.id_compte_credit} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium"><div className="flex items-center space-x-3">
                          <button onClick={() => onViewDetails?.(compte.id_compte_credit)} className="text-blue-700 hover:text-blue-900 disabled:opacity-60" title="Voir details" disabled={!onViewDetails}>Details</button>
                          <button onClick={() => handleAddTransaction(compte)} className="text-blue-600 hover:text-blue-800" title="Nouvelle Transaction"><ArrowRightLeftIcon className="w-5 h-5" /></button>
                          <button onClick={() => handleEditCompte(compte)} className="text-indigo-600 hover:text-indigo-800" title="Modifier"><EditIcon className="w-5 h-5" /></button>
                          <button onClick={() => handleDeleteCompte(compte)} className="text-red-600 hover:text-red-800" title="Supprimer"><TrashIcon className="w-5 h-5" /></button>
                          {profile?.role === UserRole.ADMIN && (<button onClick={() => handleGrantAccessCompte(compte)} className="text-yellow-600 hover:text-yellow-900" title="Accorder acces temporaire"><KeyIcon className="w-5 h-5" /></button>)}
                        </div></td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600" onClick={() => copyToClipboard(compte.no_compte, 'Numero de compte')} title="Cliquer pour copier">{compte.no_compte}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.ancien_code || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{compte.personne ? `${compte.personne.prenom} ${compte.personne.nom}` : 'N/A'}</td>
                        {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-semibold">{(compte.montant_prete || 0).toFixed(2)}</td>}
                        {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">{capitalFinal.toFixed(2)}</td>}
                        {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-blue-600">{paiementManuel.toFixed(2)}</td>}
                        {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-green-600">{totalRembourse.toFixed(2)}</td>}
                        {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600 font-semibold">{restant.toFixed(2)}</td>}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{compte.date_fin ? new Date(compte.date_fin).toLocaleDateString('fr-FR') : '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{getAgentName(compte.created_by)}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${compte.statut === 'Actif' ? 'bg-green-100 text-green-800' : (compte.statut === 'Paye' || compte.statut === 'Payé') ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{compte.statut}</span></td>
                      </tr>);
                  })}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={currentPageComptes} totalPages={totalPagesComptes} onPageChange={setCurrentPageComptes} itemsPerPage={itemsPerPageComptes} totalItems={sortedComptes.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageComptes(v); setCurrentPageComptes(1); }} />
          </div>

          <FAB onClick={handleAddCompte} label="Creer un compte credit" />
        </div>
        )}

        {activeView === 'transactions' && (
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">Dernieres Transactions Credit</h2>

          <div className="space-y-2 md:hidden">
            {paginatedTransactions.map((tx) => {
              const typeColors: Record<string, string> = { Paiement: 'bg-green-100 text-green-800', Penalite: 'bg-red-100 text-red-800', Garantie: 'bg-blue-100 text-blue-800' };
              return (
                <div key={tx.id_transaction_credit} className="bg-white rounded-lg shadow-sm border p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${typeColors[tx.type_transaction] || 'bg-gray-100 text-gray-800'}`}>{tx.type_transaction}</span>
                    <span className="text-xs text-gray-500">{new Date(tx.date_transaction).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs text-gray-500">Compte: {tx.no_compte}</p>
                      <p className="text-xs text-gray-500">Client: {tx.client_name || '-'}</p>
                      <p className="font-semibold text-lg">{tx.montant.toFixed(2)} HTG</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEditTransaction(tx)} className="p-2 text-indigo-600 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"><EditIcon className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteTransaction(tx)} className="p-2 text-red-600 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"><TrashIcon className="w-4 h-4" /></button>
                      {profile?.role === UserRole.ADMIN && (<button onClick={() => handleGrantAccessTransaction(tx)} className="p-2 text-yellow-600 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"><KeyIcon className="w-4 h-4" /></button>)}
                    </div>
                  </div>
                </div>
              );
            })}
            <Pagination currentPage={currentPageTransactions} totalPages={totalPagesTransactions} onPageChange={setCurrentPageTransactions} itemsPerPage={itemsPerPageTransactions} totalItems={data?.transactions?.length || 0} onItemsPerPageChange={(v) => { setItemsPerPageTransactions(v); setCurrentPageTransactions(1); }} />
          </div>

          <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Heure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N Compte</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                  {canViewBalances && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solde Avant</th>}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Versement Declare</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                </tr></thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedTransactions.map((tx) => {
                    const typeColors: Record<string, string> = { Paiement: 'bg-green-100 text-green-800', Penalite: 'bg-red-100 text-red-800', Garantie: 'bg-blue-100 text-blue-800' };
                    return (
                      <tr key={tx.id_transaction_credit} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium"><div className="flex items-center space-x-2">
                          <button onClick={() => handleEditTransaction(tx)} className="text-indigo-600 hover:text-indigo-900" title="Modifier"><EditIcon className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteTransaction(tx)} className="text-red-600 hover:text-red-900" title="Supprimer"><TrashIcon className="w-4 h-4" /></button>
                          {profile?.role === UserRole.ADMIN && (<button onClick={() => handleGrantAccessTransaction(tx)} className="text-yellow-600 hover:text-yellow-900" title="Accorder acces transaction"><KeyIcon className="w-4 h-4" /></button>)}
                        </div></td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{new Date(tx.date_transaction).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{tx.no_compte}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{tx.client_name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-semibold rounded ${typeColors[tx.type_transaction] || 'bg-gray-100 text-gray-800'}`}>{tx.type_transaction}</span></td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{tx.montant.toFixed(2)}</td>
                        {canViewBalances && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{tx.solde_avant_transaction.toFixed(2)}</td>}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{tx.versement_declare !== undefined && tx.versement_declare !== null ? tx.versement_declare.toFixed(2) : '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{getAgentName(tx.created_by)}</td>
                      </tr>);
                  })}
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

export default ComptesCredit;
