import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/authStore';
import { UserRole } from '../types/auth';
import toast from 'react-hot-toast';

// Page de validation finance (reservee aux admins).
// Liste les ENTREES d'argent en attente (depots epargne 'D', paiements credit 'Paiement')
// et permet de Valider / Rejeter via la fonction serveur set_transaction_validation,
// qui applique le montant au solde reel et trace qui a valide quoi et quand.

type Row = {
  key: string;
  table: 'transactions_epargne' | 'transactions_credit';
  id: string;
  kind: 'Dépôt' | 'Paiement';
  no_compte: string;
  montant: number;
  declare?: number | null;
  date: string;
  clientName: string;
  clientCode: string;
  agentName: string;
};

const fmt = (n: number) => `${(Number(n) || 0).toFixed(2)} HTG`;
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return d; }
};

const Validation: React.FC = () => {
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === UserRole.ADMIN;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: epg, error: e1 }, { data: cred, error: e2 }] = await Promise.all([
        supabase.from('transactions_epargne')
          .select('id_transaction_epargne,no_compte,montant,date_transaction,solde_apres_transaction_declare,created_by,id_compte_epargne')
          .eq('validation_status', 'pending').order('date_transaction', { ascending: true }).limit(500),
        supabase.from('transactions_credit')
          .select('id_transaction_credit,no_compte,montant,date_transaction,versement_declare,created_by,id_compte_credit')
          .eq('validation_status', 'pending').order('date_transaction', { ascending: true }).limit(500),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const epgRows = epg || [];
      const credRows = cred || [];

      // Resolution des noms (client + agent) en masse.
      const epgAccountIds = Array.from(new Set(epgRows.map((r: any) => r.id_compte_epargne).filter(Boolean)));
      const credAccountIds = Array.from(new Set(credRows.map((r: any) => r.id_compte_credit).filter(Boolean)));
      const creatorIds = Array.from(new Set([...epgRows, ...credRows].map((r: any) => r.created_by).filter(Boolean)));

      const [epgAcc, credAcc, profs] = await Promise.all([
        epgAccountIds.length ? supabase.from('comptes_epargne').select('id_compte_epargne,id_personne').in('id_compte_epargne', epgAccountIds) : Promise.resolve({ data: [] as any[] }),
        credAccountIds.length ? supabase.from('comptes_credit').select('id_compte_credit,id_personne').in('id_compte_credit', credAccountIds) : Promise.resolve({ data: [] as any[] }),
        creatorIds.length ? supabase.from('profiles').select('user_id,firstname,name').in('user_id', creatorIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      const persByEpgAcc = new Map((epgAcc.data || []).map((a: any) => [a.id_compte_epargne, a.id_personne]));
      const persByCredAcc = new Map((credAcc.data || []).map((a: any) => [a.id_compte_credit, a.id_personne]));
      const personIds = Array.from(new Set([...persByEpgAcc.values(), ...persByCredAcc.values()].filter(Boolean)));
      const persRes = personIds.length ? await supabase.from('personnes').select('id_personne,prenom,nom,code_client').in('id_personne', personIds) : { data: [] as any[] };
      const persById = new Map((persRes.data || []).map((p: any) => [p.id_personne, p]));
      const profById = new Map((profs.data || []).map((p: any) => [p.user_id, p]));

      const nameOfPerson = (pid?: string) => {
        const p = pid ? persById.get(pid) : undefined;
        return p ? { name: `${p.prenom || ''} ${p.nom || ''}`.trim() || 'Client', code: p.code_client || '-' } : { name: 'Client', code: '-' };
      };
      const nameOfAgent = (uid?: string) => {
        const p = uid ? profById.get(uid) : undefined;
        return p ? `${p.firstname || ''} ${p.name || ''}`.trim() || 'Agent' : 'Agent';
      };

      const mapped: Row[] = [
        ...epgRows.map((r: any) => {
          const c = nameOfPerson(persByEpgAcc.get(r.id_compte_epargne));
          return {
            key: 'e_' + r.id_transaction_epargne, table: 'transactions_epargne' as const, id: r.id_transaction_epargne,
            kind: 'Dépôt' as const, no_compte: r.no_compte || '-', montant: Number(r.montant) || 0,
            declare: r.solde_apres_transaction_declare, date: r.date_transaction,
            clientName: c.name, clientCode: c.code, agentName: nameOfAgent(r.created_by),
          };
        }),
        ...credRows.map((r: any) => {
          const c = nameOfPerson(persByCredAcc.get(r.id_compte_credit));
          return {
            key: 'c_' + r.id_transaction_credit, table: 'transactions_credit' as const, id: r.id_transaction_credit,
            kind: 'Paiement' as const, no_compte: r.no_compte || '-', montant: Number(r.montant) || 0,
            declare: r.versement_declare, date: r.date_transaction,
            clientName: c.name, clientCode: c.code, agentName: nameOfAgent(r.created_by),
          };
        }),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setRows(mapped);
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const act = async (row: Row, status: 'confirmed' | 'rejected') => {
    let note: string | null = null;
    if (status === 'rejected') {
      note = window.prompt('Raison du rejet (ex. argent non reçu) — optionnel :') || null;
    }
    setBusyId(row.key);
    try {
      const { error: rpcError } = await supabase.rpc('set_transaction_validation', {
        p_table: row.table, p_id: row.id, p_status: status, p_note: note,
      });
      if (rpcError) throw rpcError;
      toast.success(status === 'confirmed' ? 'Opération validée ✔' : 'Opération rejetée');
      setRows(prev => prev.filter(r => r.key !== row.key));
    } catch (err: any) {
      toast.error('Échec : ' + (err?.message || 'action impossible'));
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <h1 className="text-xl font-bold text-gray-800 mb-2">Accès réservé</h1>
        <p className="text-gray-600">Cette page de validation est réservée aux administrateurs.</p>
      </div>
    );
  }

  const totalPending = rows.reduce((s, r) => s + r.montant, 0);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Validation des entrées d'argent</h1>
        <button onClick={load} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 min-h-[44px]">
          Rafraîchir
        </button>
      </div>

      <div className="bg-amber-50 border-l-4 border-amber-400 rounded-md p-3 mb-4 text-sm text-amber-800">
        Les dépôts et paiements ci-dessous sont <strong>en attente</strong> : ils ne comptent pas encore dans les soldes ni les rapports.
        Validez ceux dont l'argent est réellement rentré ; rejetez les autres. Chaque décision est tracée.
      </div>

      {!loading && rows.length > 0 && (
        <div className="text-sm text-gray-600 mb-3">
          <strong>{rows.length}</strong> opération(s) en attente · Total : <strong>{fmt(totalPending)}</strong>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 mb-4 text-sm">{error}</div>}

      {loading ? (
        <div className="text-gray-600 p-4">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-600">
          Aucune opération en attente de validation. ✅
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {rows.map(row => {
            const mismatch = row.declare != null && Math.abs(Number(row.declare) - row.montant) > 0.01 && row.table === 'transactions_credit';
            return (
              <div key={row.key} className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${row.kind === 'Dépôt' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{row.kind}</span>
                    <span className="ml-2 text-lg font-bold text-gray-900">{fmt(row.montant)}</span>
                    <div className="mt-1 text-sm text-gray-700">{row.clientName} <span className="text-gray-400">·</span> {row.clientCode}</div>
                    <div className="text-xs text-gray-500 mt-0.5 font-mono">{row.no_compte}</div>
                    <div className="text-xs text-gray-500 mt-1">Agent : {row.agentName} · {fmtDate(row.date)}</div>
                    {mismatch && (
                      <div className="text-xs text-red-600 mt-1">⚠ Versement déclaré ({fmt(Number(row.declare))}) différent du montant enregistré</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(row, 'confirmed')}
                      disabled={busyId === row.key}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-400 min-h-[44px]"
                    >
                      Valider
                    </button>
                    <button
                      onClick={() => act(row, 'rejected')}
                      disabled={busyId === row.key}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-400 min-h-[44px]"
                    >
                      Rejeter
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Validation;
