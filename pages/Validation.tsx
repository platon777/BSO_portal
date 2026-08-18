import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/authStore';
import { canAccessAdminReports } from '../types/auth';
import toast from 'react-hot-toast';

// Page de validation finance (réservée aux administrateurs, managers et finance).
// Liste les opérations en attente (dépôts 'D', paiements crédit 'Paiement', virements 'V')
// et permet de valider individuellement ou en bloc par agent.

const PAGE_SIZE = 50;

type Row = {
  key: string;
  table: 'transactions_epargne' | 'transactions_credit';
  id: string;
  kind: 'Dépôt' | 'Paiement' | 'Virement';
  no_compte: string;
  montant: number;
  declare?: number | null;
  date: string;
  clientName: string;
  clientCode: string;
  agentId: string;
  agentName: string;
  virement_from?: string;
  virement_to?: string;
};

const fmt = (n: number) => `${(Number(n) || 0).toFixed(2)} HTG`;
const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return d;
  }
};
const sortByDate = (a: Row, b: Row) => new Date(a.date).getTime() - new Date(b.date).getTime();

// Résout les noms client/agent pour un lot de lignes brutes (épargne + crédit).
const resolveNames = async (epgRows: any[], credRows: any[]): Promise<Row[]> => {
  const epgAccountIds = Array.from(new Set(epgRows.map((r) => r.id_compte_epargne).filter(Boolean)));
  const credAccountIds = Array.from(new Set(credRows.map((r) => r.id_compte_credit).filter(Boolean)));
  const creatorIds = Array.from(new Set([...epgRows, ...credRows].map((r) => r.created_by).filter(Boolean)));

  const [epgAcc, credAcc, profs] = await Promise.all([
    epgAccountIds.length
      ? supabase.from('comptes_epargne').select('id_compte_epargne,id_personne').in('id_compte_epargne', epgAccountIds)
      : Promise.resolve({ data: [] as any[] }),
    credAccountIds.length
      ? supabase.from('comptes_credit').select('id_compte_credit,id_personne').in('id_compte_credit', credAccountIds)
      : Promise.resolve({ data: [] as any[] }),
    creatorIds.length
      ? supabase.from('profiles').select('user_id,firstname,name').in('user_id', creatorIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const persByEpgAcc = new Map((epgAcc.data || []).map((a: any) => [a.id_compte_epargne, a.id_personne]));
  const persByCredAcc = new Map((credAcc.data || []).map((a: any) => [a.id_compte_credit, a.id_personne]));
  const personIds = Array.from(new Set([...persByEpgAcc.values(), ...persByCredAcc.values()].filter(Boolean)));
  const persRes = personIds.length
    ? await supabase.from('personnes').select('id_personne,prenom,nom,code_client').in('id_personne', personIds)
    : { data: [] as any[] };
  const persById = new Map((persRes.data || []).map((p: any) => [p.id_personne, p]));
  const profById = new Map((profs.data || []).map((p: any) => [p.user_id, p]));

  const person = (pid?: string) => {
    const p = pid ? persById.get(pid) : undefined;
    return p
      ? { name: `${p.prenom || ''} ${p.nom || ''}`.trim() || 'Client', code: p.code_client || '-' }
      : { name: 'Client', code: '-' };
  };
  const agent = (uid?: string) => {
    const p = uid ? profById.get(uid) : undefined;
    return p ? `${p.firstname || ''} ${p.name || ''}`.trim() || `Agent (${uid?.slice(0, 6)})` : `Agent (${uid?.slice(0, 6) || '-'})`;
  };

  const mapped: Row[] = [
    ...epgRows.map((r: any) => {
      const c = person(persByEpgAcc.get(r.id_compte_epargne));
      const kind: Row['kind'] = r.type_transaction === 'V' ? 'Virement' : 'Dépôt';
      return {
        key: 'e_' + r.id_transaction_epargne,
        table: 'transactions_epargne' as const,
        id: r.id_transaction_epargne,
        kind,
        no_compte: r.no_compte || '-',
        montant: Number(r.montant) || 0,
        declare: r.solde_apres_transaction_declare,
        date: r.date_transaction,
        clientName: c.name,
        clientCode: c.code,
        agentId: r.created_by || '',
        agentName: agent(r.created_by),
        virement_from: r.virement_from,
        virement_to: r.virement_to,
      };
    }),
    ...credRows.map((r: any) => {
      const c = person(persByCredAcc.get(r.id_compte_credit));
      return {
        key: 'c_' + r.id_transaction_credit,
        table: 'transactions_credit' as const,
        id: r.id_transaction_credit,
        kind: 'Paiement' as const,
        no_compte: r.no_compte || '-',
        montant: Number(r.montant) || 0,
        declare: r.versement_declare,
        date: r.date_transaction,
        clientName: c.name,
        clientCode: c.code,
        agentId: r.created_by || '',
        agentName: agent(r.created_by),
      };
    }),
  ];
  return mapped;
};

const Validation: React.FC = () => {
  const { profile } = useAuthStore();
  const isAdminOrManager = canAccessAdminReports(profile?.role);

  const [rows, setRows] = useState<Row[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<{ epg: number; cred: number }>({ epg: 0, cred: 0 });

  // Offsets de pagination (par table)
  const offsets = useRef<{ epg: number; cred: number }>({ epg: 0, cred: 0 });
  const [hasMore, setHasMore] = useState<{ epg: boolean; cred: boolean }>({ epg: false, cred: false });

  const fetchBatch = useCallback(async (reset: boolean) => {
    setError(null);
    if (reset) {
      offsets.current = { epg: 0, cred: 0 };
      setLoading(true);
      setSelectedKeys(new Set());
    } else {
      setLoadingMore(true);
    }

    try {
      const epgFrom = offsets.current.epg;
      const credFrom = offsets.current.cred;

      const requests: Promise<any>[] = [
        supabase
          .from('transactions_epargne')
          .select(
            'id_transaction_epargne,no_compte,montant,type_transaction,date_transaction,solde_apres_transaction_declare,created_by,id_compte_epargne,virement_from,virement_to'
          )
          .eq('validation_status', 'pending')
          .order('date_transaction', { ascending: true })
          .range(epgFrom, epgFrom + PAGE_SIZE - 1),
        supabase
          .from('transactions_credit')
          .select(
            'id_transaction_credit,no_compte,montant,type_transaction,date_transaction,versement_declare,created_by,id_compte_credit'
          )
          .eq('validation_status', 'pending')
          .order('date_transaction', { ascending: true })
          .range(credFrom, credFrom + PAGE_SIZE - 1),
      ];

      if (reset) {
        requests.push(
          supabase.from('transactions_epargne').select('*', { count: 'exact', head: true }).eq('validation_status', 'pending')
        );
        requests.push(
          supabase.from('transactions_credit').select('*', { count: 'exact', head: true }).eq('validation_status', 'pending')
        );
      }

      const res = await Promise.all(requests);
      const epg = res[0];
      const cred = res[1];
      if (epg.error) throw epg.error;
      if (cred.error) throw cred.error;

      if (reset) {
        setTotals({ epg: res[2]?.count || 0, cred: res[3]?.count || 0 });
      }

      const epgRows = epg.data || [];
      const credRows = cred.data || [];
      const batch = await resolveNames(epgRows, credRows);

      offsets.current = { epg: epgFrom + epgRows.length, cred: credFrom + credRows.length };
      setHasMore({ epg: epgRows.length === PAGE_SIZE, cred: credRows.length === PAGE_SIZE });

      setRows((prev) => (reset ? batch : [...prev, ...batch]).sort(sortByDate));
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement des opérations en attente.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (isAdminOrManager) fetchBatch(true);
  }, [isAdminOrManager, fetchBatch]);

  // Liste des agents uniques présents dans le lot
  const agentsInBatch = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.agentId) map.set(r.agentId, r.agentName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  // Filtrage des lignes
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedAgentFilter !== 'all' && r.agentId !== selectedAgentFilter) return false;
      if (selectedTypeFilter !== 'all' && r.kind !== selectedTypeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesClient = r.clientName.toLowerCase().includes(q) || r.clientCode.toLowerCase().includes(q);
        const matchesCompte = r.no_compte.toLowerCase().includes(q);
        const matchesAgent = r.agentName.toLowerCase().includes(q);
        if (!matchesClient && !matchesCompte && !matchesAgent) return false;
      }
      return true;
    });
  }, [rows, selectedAgentFilter, selectedTypeFilter, searchQuery]);

  // Statistiques de la vue filtrée / sélectionnée
  const filteredStats = useMemo(() => {
    let depots = 0;
    let depotsCount = 0;
    let paiements = 0;
    let paiementsCount = 0;
    let virements = 0;
    let virementsCount = 0;

    filteredRows.forEach((r) => {
      if (r.kind === 'Dépôt') {
        depots += r.montant;
        depotsCount++;
      } else if (r.kind === 'Paiement') {
        paiements += r.montant;
        paiementsCount++;
      } else if (r.kind === 'Virement') {
        virements += r.montant;
        virementsCount++;
      }
    });

    const totalCashPhysique = depots + paiements; // Cash physique remis par l'agent
    const totalGlobal = depots + paiements + virements;

    return {
      count: filteredRows.length,
      depots,
      depotsCount,
      paiements,
      paiementsCount,
      virements,
      virementsCount,
      totalCashPhysique,
      totalGlobal,
    };
  }, [filteredRows]);

  // Sélection / Désélection
  const handleToggleSelectRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedKeys.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredRows.map((r) => r.key)));
    }
  };

  // Validation ou rejet individuel
  const act = async (row: Row, status: 'confirmed' | 'rejected') => {
    let note: string | null = null;
    if (status === 'rejected') {
      note = window.prompt('Raison du rejet (ex. argent non reçu) — optionnel :') || null;
    }
    setBusyId(row.key);
    try {
      const { error: rpcError } = await supabase.rpc('set_transaction_validation', {
        p_table: row.table,
        p_id: row.id,
        p_status: status,
        p_note: note,
      });
      if (rpcError) throw rpcError;

      toast.success(status === 'confirmed' ? `${row.kind} validé ✔` : `${row.kind} rejeté ❌`);
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.key);
        return next;
      });
      setTotals((prev) =>
        row.table === 'transactions_epargne'
          ? { ...prev, epg: Math.max(0, prev.epg - 1) }
          : { ...prev, cred: Math.max(0, prev.cred - 1) }
      );
    } catch (err: any) {
      toast.error('Échec : ' + (err?.message || 'action impossible'));
    } finally {
      setBusyId(null);
    }
  };

  // Validation ou rejet en bloc
  const actBulk = async (status: 'confirmed' | 'rejected', targetRows?: Row[]) => {
    const rowsToProcess = targetRows || filteredRows.filter((r) => selectedKeys.has(r.key));
    if (rowsToProcess.length === 0) {
      toast.error('Aucune opération sélectionnée.');
      return;
    }

    const totalMontant = rowsToProcess.reduce((sum, r) => sum + r.montant, 0);
    const actionLabel = status === 'confirmed' ? 'VALIDER' : 'REJETER';

    const confirmed = window.confirm(
      `Confirmez-vous vouloir ${actionLabel} ${rowsToProcess.length} opération(s) pour un montant total de ${fmt(totalMontant)} ?`
    );
    if (!confirmed) return;

    let note: string | null = null;
    if (status === 'rejected') {
      note = window.prompt('Raison du rejet groupé — optionnel :') || null;
    }

    setIsBulkBusy(true);
    const toastId = toast.loading(`Traitement de ${rowsToProcess.length} opérations...`);

    try {
      const itemsPayload = rowsToProcess.map((r) => ({
        table: r.table,
        id: r.id,
      }));

      // 1. Essai via la RPC performante de masse
      const { data: bulkRes, error: bulkErr } = await supabase.rpc('set_bulk_transaction_validation', {
        p_items: itemsPayload,
        p_status: status,
        p_note: note,
      });

      if (!bulkErr) {
        const updatedCount = bulkRes?.updated ?? rowsToProcess.length;
        toast.success(`${updatedCount} opération(s) traitée(s) avec succès !`, { id: toastId });
      } else {
        // Fallback séquentiel/parallèle individuel si la RPC bulk n'était pas disponible
        console.warn('Fallback set_transaction_validation individuel:', bulkErr);
        let successCount = 0;
        for (const r of rowsToProcess) {
          try {
            await supabase.rpc('set_transaction_validation', {
              p_table: r.table,
              p_id: r.id,
              p_status: status,
              p_note: note,
            });
            successCount++;
          } catch (e) {
            console.error('Erreur validation item:', r.id, e);
          }
        }
        toast.success(`${successCount} opération(s) validée(s) avec succès !`, { id: toastId });
      }

      // Nettoyer l'état local
      const processedKeys = new Set(rowsToProcess.map((r) => r.key));
      setRows((prev) => prev.filter((r) => !processedKeys.has(r.key)));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        processedKeys.forEach((k) => next.delete(k));
        return next;
      });

      // Rafraîchir les compteurs
      fetchBatch(true);
    } catch (err: any) {
      toast.error('Erreur lors du traitement par lot : ' + (err?.message || 'Erreur inconnue'), { id: toastId });
    } finally {
      setIsBulkBusy(false);
    }
  };

  if (!isAdminOrManager) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <h1 className="text-xl font-bold text-gray-800 mb-2">Accès réservé</h1>
        <p className="text-gray-600">Cette page de validation est réservée aux administrateurs et managers.</p>
      </div>
    );
  }

  const isAllSelected = filteredRows.length > 0 && selectedKeys.size === filteredRows.length;
  const hasSelected = selectedKeys.size > 0;
  const currentAgentName =
    selectedAgentFilter !== 'all'
      ? agentsInBatch.find((a) => a.id === selectedAgentFilter)?.name || 'Agent sélectionné'
      : 'Tous les agents';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Validation des flux financiers</h1>
          <p className="text-sm text-gray-500">
            Contrôlez et validez en bloc le cash apporté par chaque agent (Dépôts, Paiements, Virements).
          </p>
        </div>
        <button
          onClick={() => fetchBatch(true)}
          disabled={loading || isBulkBusy}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 min-h-[44px]"
        >
          {loading ? 'Actualisation…' : 'Rafraîchir'}
        </button>
      </div>

      {/* Alert banner */}
      <div className="bg-amber-50 border-l-4 border-amber-400 rounded-md p-3 text-sm text-amber-800">
        Les opérations ci-dessous sont <strong>en attente</strong> : elles ne modifient pas encore le solde réel de la base.
        Vérifiez la concordance avec le cash physique remis par l'agent avant de valider en bloc.
      </div>

      {/* Barre de filtres & recherche */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Filtrer par Agent :</label>
          <select
            value={selectedAgentFilter}
            onChange={(e) => {
              setSelectedAgentFilter(e.target.value);
              setSelectedKeys(new Set());
            }}
            className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="all">Tous les agents ({rows.length} ops)</option>
            {agentsInBatch.map((a) => {
              const count = rows.filter((r) => r.agentId === a.id).length;
              return (
                <option key={a.id} value={a.id}>
                  {a.name} ({count} ops)
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Type d'opération :</label>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="all">Tous les types</option>
            <option value="Dépôt">Dépôt uniquement</option>
            <option value="Paiement">Paiement Crédit uniquement</option>
            <option value="Virement">Virement uniquement</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Recherche (Client / Compte / Code) :</label>
          <input
            type="text"
            placeholder="Nom, code client, no compte..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {/* Synthèse du Cash & Actions par Lot */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 p-4 rounded-lg shadow-sm border border-blue-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              Synthèse de Caisse — {currentAgentName}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-2xl font-extrabold text-emerald-800">
                Cash Physique Attendu : {fmt(filteredStats.totalCashPhysique)}
              </span>
              <span className="text-sm font-semibold text-gray-600">
                ({filteredStats.count} opération{filteredStats.count > 1 ? 's' : ''})
              </span>
            </div>
            <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1 pt-1">
              <span>Dépôts : <strong>{fmt(filteredStats.depots)}</strong> ({filteredStats.depotsCount})</span>
              <span>•</span>
              <span>Paiements Crédit : <strong>{fmt(filteredStats.paiements)}</strong> ({filteredStats.paiementsCount})</span>
              {filteredStats.virementsCount > 0 && (
                <>
                  <span>•</span>
                  <span>Virements : <strong>{fmt(filteredStats.virements)}</strong> ({filteredStats.virementsCount})</span>
                </>
              )}
            </div>
          </div>

          {/* Boutons d'action par lot */}
          <div className="flex flex-wrap gap-2 items-center">
            {selectedAgentFilter !== 'all' && filteredRows.length > 0 && (
              <button
                onClick={() => actBulk('confirmed', filteredRows)}
                disabled={isBulkBusy}
                className="px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:bg-gray-400 min-h-[44px]"
              >
                ⚡ Valider tout pour {currentAgentName} ({filteredRows.length})
              </button>
            )}

            {hasSelected && (
              <>
                <button
                  onClick={() => actBulk('confirmed')}
                  disabled={isBulkBusy}
                  className="px-4 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm disabled:bg-gray-400 min-h-[44px]"
                >
                  Valider la sélection ({selectedKeys.size})
                </button>
                <button
                  onClick={() => actBulk('rejected')}
                  disabled={isBulkBusy}
                  className="px-3 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:bg-gray-400 min-h-[44px]"
                >
                  Rejeter la sélection ({selectedKeys.size})
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm">{error}</div>}

      {/* Tableau des opérations */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
          Chargement des opérations en attente…
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-600">
          Aucune opération en attente pour ces critères. ✅
        </div>
      ) : (
        <div className="space-y-2">
          {/* Sélection globale bar */}
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 flex items-center justify-between flex-wrap gap-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleSelectAllFiltered}
                className="w-4 h-4 text-blue-600 rounded"
              />
              Tout sélectionner ({filteredRows.length} affichées)
            </label>
            {hasSelected && (
              <span className="text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-1 rounded">
                {selectedKeys.size} sélectionnée(s)
              </span>
            )}
          </div>

          {/* Cartes d'opérations */}
          <div className="grid grid-cols-1 gap-3">
            {filteredRows.map((row) => {
              const isSelected = selectedKeys.has(row.key);
              const isCreditMismatch =
                row.declare != null && Math.abs(Number(row.declare) - row.montant) > 0.01 && row.table === 'transactions_credit';

              const badgeColor =
                row.kind === 'Dépôt'
                  ? 'bg-green-100 text-green-800 border-green-300'
                  : row.kind === 'Paiement'
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-purple-100 text-purple-800 border-purple-300';

              return (
                <div
                  key={row.key}
                  className={`bg-white rounded-lg shadow-sm p-4 border transition-all ${
                    isSelected ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20' : 'border-gray-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(row.key)}
                        className="mt-1 w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0"
                      />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${badgeColor}`}>
                            {row.kind}
                          </span>
                          <span className="text-lg font-bold text-gray-900">{fmt(row.montant)}</span>
                        </div>

                        <div className="mt-1 text-sm font-medium text-gray-800">
                          {row.clientName} <span className="text-gray-400 font-normal">· Code: {row.clientCode}</span>
                        </div>

                        <div className="text-xs text-gray-500 font-mono mt-0.5 break-all">
                          Compte : {row.no_compte}
                        </div>

                        {row.kind === 'Virement' && (
                          <div className="text-xs text-purple-700 bg-purple-50 p-1.5 rounded mt-1 font-mono">
                            Émetteur : {row.virement_from || row.no_compte} → Bénéficiaire : {row.virement_to || 'N/A'}
                          </div>
                        )}

                        <div className="text-xs text-gray-500 mt-1">
                          Agent : <strong>{row.agentName}</strong> · Date : {fmtDate(row.date)}
                        </div>

                        {isCreditMismatch && (
                          <div className="text-xs text-red-600 font-medium mt-1">
                            ⚠ Versement déclaré ({fmt(Number(row.declare))}) différent du montant enregistré !
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions unitaires */}
                    <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
                      <button
                        onClick={() => act(row, 'confirmed')}
                        disabled={busyId === row.key || isBulkBusy}
                        className="px-3.5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:bg-gray-400 min-h-[40px]"
                      >
                        Valider
                      </button>
                      <button
                        onClick={() => act(row, 'rejected')}
                        disabled={busyId === row.key || isBulkBusy}
                        className="px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:bg-gray-400 min-h-[40px]"
                      >
                        Rejeter
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Charger plus */}
          {(hasMore.epg || hasMore.cred) && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => fetchBatch(false)}
                disabled={loadingMore}
                className="px-5 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-60 min-h-[44px]"
              >
                {loadingMore ? 'Chargement…' : `Charger plus (${PAGE_SIZE} par lot)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Validation;
