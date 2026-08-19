import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { db } from '../services/database';
import { useAuthStore } from '../stores/authStore';
import { canAccessAdminReports } from '../types/auth';
import AgentSearchSelect, { AgentOption } from '../components/common/AgentSearchSelect';
import { SearchIcon, CheckIcon, AlertTriangleIcon, RefreshCwIcon } from '../components/icons/Icons';
import toast from 'react-hot-toast';

// Page de validation finance (réservée aux administrateurs, managers et finance).
// Liste les opérations en attente (dépôts 'D', paiements crédit 'Paiement', virements 'V')
// et permet de valider individuellement ou en bloc par agent.

const PAGE_SIZE = 50;
const CACHED_PROFILES_KEY = 'bso_cached_profiles';

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
      ? supabase.from('profiles').select('user_id,firstname,name,email,role').in('user_id', creatorIds)
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
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'all'>('today');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [allAgents, setAllAgents] = useState<AgentOption[]>(() => {
    try {
      const cached = localStorage.getItem(CACHED_PROFILES_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<{ epg: number; cred: number }>({ epg: 0, cred: 0 });

  // Offsets de pagination (par table)
  const offsets = useRef<{ epg: number; cred: number }>({ epg: 0, cred: 0 });
  const [hasMore, setHasMore] = useState<{ epg: boolean; cred: boolean }>({ epg: false, cred: false });

  // Charger la liste complète des profils agents
  useEffect(() => {
    if (!isAdminOrManager) return;
    const fetchProfiles = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, firstname, name, email, role')
          .order('firstname', { ascending: true });
        if (data && data.length > 0) {
          const list: AgentOption[] = data
            .filter((p: any) => p.user_id)
            .map((p: any) => ({
              id: p.user_id,
              name: [p.firstname, p.name].filter(Boolean).join(' ').trim() || p.email || `Agent (${p.user_id.slice(0, 8)})`,
              email: p.email,
              role: p.role,
            }));
          setAllAgents(list);
          try {
            localStorage.setItem(CACHED_PROFILES_KEY, JSON.stringify(list));
          } catch {}
        }
      } catch (err) {
        console.warn('Erreur chargement profiles pour validation:', err);
      }
    };
    fetchProfiles();
  }, [isAdminOrManager]);

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

  // Liste des agents combinée (profils globaux + agents ayant des opérations dans le lot)
  const agentsOptionsList: AgentOption[] = useMemo(() => {
    const list: AgentOption[] = [{ id: 'all', name: 'Tous les agents' }];
    const map = new Map<string, AgentOption>();

    // 1. D'abord les profils connus
    allAgents.forEach((a) => map.set(a.id, a));

    // 2. Puis ceux présents dans les opérations
    rows.forEach((r) => {
      if (r.agentId && !map.has(r.agentId)) {
        map.set(r.agentId, { id: r.agentId, name: r.agentName });
      }
    });

    return [...list, ...Array.from(map.values())];
  }, [allAgents, rows]);

  // Filtrage des lignes par agent, période/date, type et recherche
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // 1. Filtre Agent
      if (selectedAgentFilter !== 'all' && r.agentId !== selectedAgentFilter) return false;

      // 2. Filtre Période / Date
      if (datePreset === 'today') {
        const rowDate = new Date(r.date).toDateString();
        const today = new Date().toDateString();
        if (rowDate !== today) return false;
      } else if (datePreset === 'yesterday') {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        if (new Date(r.date).toDateString() !== d.toDateString()) return false;
      }

      // 3. Filtre Type
      if (selectedTypeFilter !== 'all' && r.kind !== selectedTypeFilter) return false;

      // 4. Recherche texte
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesClient = r.clientName.toLowerCase().includes(q) || r.clientCode.toLowerCase().includes(q);
        const matchesCompte = r.no_compte.toLowerCase().includes(q);
        const matchesAgent = r.agentName.toLowerCase().includes(q);
        if (!matchesClient && !matchesCompte && !matchesAgent) return false;
      }
      return true;
    });
  }, [rows, selectedAgentFilter, datePreset, selectedTypeFilter, searchQuery]);

  // Statistiques de la vue filtrée
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

      // Mise à jour immédiate dans la base locale Dexie pour que les rapports / stats reflètent instantanément la validation
      try {
        if (row.table === 'transactions_epargne') {
          await db.transactions_epargne.update(row.id, {
            validation_status: status,
            validated_by: profile?.user_id,
            validated_at: new Date().toISOString(),
            validation_note: note || undefined,
          });
        } else if (row.table === 'transactions_credit') {
          await db.transactions_credit.update(row.id, {
            validation_status: status,
            validated_by: profile?.user_id,
            validated_at: new Date().toISOString(),
            validation_note: note || undefined,
          });
        }
      } catch (e) {
        console.warn('Mise à jour locale Dexie ignorée:', e);
      }

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
    const toastId = toast.loading(`${actionLabel} de ${rowsToProcess.length} opérations en cours...`);

    try {
      const itemsPayload = rowsToProcess.map((r) => ({
        table: r.table,
        id: r.id,
      }));

      const { data: bulkRes, error: bulkErr } = await supabase.rpc('set_bulk_transaction_validation', {
        p_items: itemsPayload,
        p_status: status,
        p_note: note,
      });

      if (!bulkErr) {
        toast.success(`${rowsToProcess.length} opération(s) traitée(s) avec succès !`, { id: toastId });
      } else {
        // Fallback individuel si la RPC bulk n'était pas disponible
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

      // Mise à jour immédiate dans la base locale Dexie pour synchroniser l'affichage des rapports instantanément
      for (const r of rowsToProcess) {
        try {
          if (r.table === 'transactions_epargne') {
            await db.transactions_epargne.update(r.id, {
              validation_status: status,
              validated_by: profile?.user_id,
              validated_at: new Date().toISOString(),
              validation_note: note || undefined,
            });
          } else if (r.table === 'transactions_credit') {
            await db.transactions_credit.update(r.id, {
              validation_status: status,
              validated_by: profile?.user_id,
              validated_at: new Date().toISOString(),
              validation_note: note || undefined,
            });
          }
        } catch (e) {
          // Ignorer erreur locale unitaire
        }
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
        <p className="text-gray-600">Cette page de validation est réservée aux administrateurs, managers et finance.</p>
      </div>
    );
  }

  const isAllSelected = filteredRows.length > 0 && selectedKeys.size === filteredRows.length;
  const hasSelected = selectedKeys.size > 0;
  const currentAgentName =
    selectedAgentFilter !== 'all'
      ? agentsOptionsList.find((a) => a.id === selectedAgentFilter)?.name || 'Agent sélectionné'
      : null;

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>🛡️</span> Validation Finance & Contrôle Caisse
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Total en attente sur le système :{' '}
            <span className="font-semibold text-gray-800">{totals.epg + totals.cred} opération(s)</span> ({totals.epg} épargne / {totals.cred} crédit)
          </p>
        </div>
        <button
          onClick={() => fetchBatch(true)}
          disabled={loading || isBulkBusy}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 min-h-[44px]"
        >
          <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Rafraîchir</span>
        </button>
      </div>

      {/* Note d'information */}
      <div className="p-3.5 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg text-xs sm:text-sm text-amber-900">
        <strong>Important :</strong> Les opérations ci-dessous sont <em>en attente</em>. Vérifiez la concordance avec le cash physique remis par l'agent avant de valider en bloc.
      </div>

      {/* Barre de filtres harmonisée avec les Rapports */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Sélecteur d'agent interactif avec recherche */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Filtrer par Agent :</label>
            <AgentSearchSelect
              agents={agentsOptionsList}
              selectedAgentId={selectedAgentFilter}
              onSelect={(id) => setSelectedAgentFilter(id)}
              currentUserId={profile?.user_id}
            />
          </div>

          {/* 2. Filtre Période / Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Période :</label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as any)}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[44px]"
            >
              <option value="today">Aujourd'hui</option>
              <option value="yesterday">Hier</option>
              <option value="all">Toutes les dates</option>
            </select>
          </div>

          {/* 3. Type d'opération */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Type d'opération :</label>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[44px]"
            >
              <option value="all">Tous les types</option>
              <option value="Dépôt">Dépôts uniquement</option>
              <option value="Paiement">Paiements crédit uniquement</option>
              <option value="Virement">Virements uniquement</option>
            </select>
          </div>

          {/* 4. Recherche texte */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Recherche rapide :</label>
            <div className="relative">
              <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Client, compte..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[44px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Synthèse de caisse & actions en bloc */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              {currentAgentName ? `SYNTHÈSE DE CAISSE — ${currentAgentName.toUpperCase()}` : 'SYNTHÈSE DE CAISSE — TOUS LES AGENTS'}
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-900">
              Cash Physique Attendu : {fmt(filteredStats.totalCashPhysique)}
            </div>
            <div className="text-xs text-emerald-700 flex flex-wrap gap-x-4 gap-y-1">
              <span>{filteredStats.count} opération(s) filtrée(s)</span>
              <span>Dépôts ({filteredStats.depotsCount}) : <strong>{fmt(filteredStats.depots)}</strong></span>
              <span>Paiements Crédit ({filteredStats.paiementsCount}) : <strong>{fmt(filteredStats.paiements)}</strong></span>
              {filteredStats.virementsCount > 0 && (
                <span>Virements ({filteredStats.virementsCount}) : <strong>{fmt(filteredStats.virements)}</strong></span>
              )}
            </div>
          </div>

          {/* Boutons d'action par lot */}
          <div className="flex flex-wrap items-center gap-2">
            {currentAgentName && filteredRows.length > 0 && (
              <button
                type="button"
                onClick={() => actBulk('confirmed', filteredRows)}
                disabled={isBulkBusy}
                className="px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 min-h-[44px] flex items-center gap-2"
              >
                <span>⚡</span>
                <span>Valider tout pour {currentAgentName.split(' ')[0]} ({filteredRows.length})</span>
              </button>
            )}

            {hasSelected && (
              <button
                type="button"
                onClick={() => actBulk('confirmed')}
                disabled={isBulkBusy}
                className="px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50 min-h-[44px]"
              >
                Valider la sélection ({selectedKeys.size})
              </button>
            )}

            {hasSelected && (
              <button
                type="button"
                onClick={() => actBulk('rejected')}
                disabled={isBulkBusy}
                className="px-4 py-2.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg disabled:opacity-50 min-h-[44px]"
              >
                Rejeter la sélection ({selectedKeys.size})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm border border-red-200 flex items-center gap-2">
          <AlertTriangleIcon className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Liste des opérations */}
      {loading ? (
        <div className="p-8 text-center bg-white rounded-xl border border-gray-200 text-gray-500">
          <RefreshCwIcon className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
          <span>Chargement des opérations en attente...</span>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-gray-200">
          <CheckIcon className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-gray-700 font-medium">Aucune opération en attente pour les critères sélectionnés.</p>
          <p className="text-xs text-gray-500 mt-1">Toutes les opérations ont été validées ou aucun enregistrement ne correspond au filtre.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Barre de sélection globale */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded-lg text-xs font-semibold text-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleSelectAllFiltered}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span>Tout sélectionner ({filteredRows.length})</span>
            </label>
            <span>{selectedKeys.size} sélectionné(s)</span>
          </div>

          {/* Grille des cartes d'opérations */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredRows.map((row) => {
              const isSelected = selectedKeys.has(row.key);
              return (
                <div
                  key={row.key}
                  className={`p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-blue-50/50 border-blue-400 shadow-md ring-1 ring-blue-400'
                      : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(row.key)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 shrink-0"
                      />
                      <div className="min-w-0">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded-full uppercase tracking-wider ${
                            row.kind === 'Dépôt'
                              ? 'bg-green-100 text-green-800'
                              : row.kind === 'Paiement'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {row.kind}
                        </span>
                        <h3 className="font-bold text-gray-900 text-base mt-1 truncate">{row.clientName}</h3>
                        <p className="text-xs text-gray-500">
                          Code : {row.clientCode} | Compte : <span className="font-mono">{row.no_compte}</span>
                        </p>
                      </div>
                    </label>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-extrabold text-gray-900">{fmt(row.montant)}</div>
                      <div className="text-[11px] text-gray-400">{fmtDate(row.date)}</div>
                    </div>
                  </div>

                  {/* Virement details */}
                  {row.kind === 'Virement' && (row.virement_from || row.virement_to) && (
                    <div className="mt-2.5 p-2 bg-purple-50 rounded-lg text-xs text-purple-900 border border-purple-100">
                      <div>Émetteur : <span className="font-mono font-medium">{row.virement_from || row.no_compte}</span></div>
                      <div>Bénéficiaire : <span className="font-mono font-medium">{row.virement_to || 'N/A'}</span></div>
                    </div>
                  )}

                  {/* Solde déclaré info */}
                  {row.declare !== undefined && row.declare !== null && (
                    <div className="mt-2 text-xs text-gray-500">
                      Solde déclaré par l'agent : <span className="font-medium text-gray-700">{fmt(row.declare)}</span>
                    </div>
                  )}

                  {/* Agent badge & actions individuelles */}
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <div className="text-xs text-gray-600 truncate">
                      Agent : <strong className="text-gray-800">{row.agentName}</strong>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => act(row, 'rejected')}
                        disabled={busyId === row.key || isBulkBusy}
                        className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50 min-h-[36px]"
                      >
                        Rejeter
                      </button>
                      <button
                        type="button"
                        onClick={() => act(row, 'confirmed')}
                        disabled={busyId === row.key || isBulkBusy}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 min-h-[36px]"
                      >
                        {busyId === row.key ? '...' : 'Valider'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Charger plus de lots */}
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
