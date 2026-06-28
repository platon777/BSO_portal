import { supabase } from './supabase';
import { UserRole } from '../types/auth';
import { useAuthStore } from '../stores/authStore';

export const accessService = {
    /**
     * Check if current user has access to modify a client or a specific transaction.
     * Uses the local auth store to avoid network calls that can trigger logout.
     */
    async hasAccess(clientId: string, transactionId?: string): Promise<boolean> {
        // 1. Use local auth store (no network call = no disconnection risk)
        const { user, profile } = useAuthStore.getState();
        if (!user || !profile) return false;

        // 2. Admin always has access
        if (profile.role === UserRole.ADMIN) return true;

        // 3. Check for temporary grants via Supabase (wrapped in try-catch)
        try {
            // Client-level grant
            const { data: clientGrants } = await supabase
                .from('temporary_access_grants')
                .select('id')
                .eq('agent_id', user.id)
                .eq('client_id', clientId)
                .is('transaction_id', null)
                .is('transaction_credit_id', null)
                .gt('expires_at', new Date().toISOString())
                .limit(1);

            if (clientGrants && clientGrants.length > 0) return true;

            // Transaction-level grant
            if (transactionId) {
                const { data: txGrants } = await supabase
                    .from('temporary_access_grants')
                    .select('id')
                    .eq('agent_id', user.id)
                    // Some deployments store savings tx in `transaction_id` and credit tx in `transaction_credit_id`.
                    .or(`transaction_id.eq.${transactionId},transaction_credit_id.eq.${transactionId}`)
                    .gt('expires_at', new Date().toISOString())
                    .limit(1);

                if (txGrants && txGrants.length > 0) return true;
            }
        } catch (error) {
            console.error('[accessService] Erreur lors de la verification des acces:', error);
        }

        return false;
    },

    async hasAccessToCompteEpargne(clientId: string, compteEpargneId: string): Promise<boolean> {
        const { user, profile } = useAuthStore.getState();
        if (!user || !profile) return false;
        if (profile.role === UserRole.ADMIN) return true;

        try {
            const nowIso = new Date().toISOString();

            const { data: accountGrants } = await supabase
                .from('temporary_access_grants')
                .select('id')
                .eq('agent_id', user.id)
                .eq('compte_epargne_id', compteEpargneId)
                .gt('expires_at', nowIso)
                .limit(1);

            if (accountGrants && accountGrants.length > 0) return true;

            return await this.hasAccess(clientId);
        } catch (error) {
            console.error('[accessService] Erreur lors de la verification des acces (compte epargne):', error);
            return false;
        }
    },

    async hasAccessToCompteCredit(clientId: string, compteCreditId: string): Promise<boolean> {
        const { user, profile } = useAuthStore.getState();
        if (!user || !profile) return false;
        if (profile.role === UserRole.ADMIN) return true;

        try {
            const nowIso = new Date().toISOString();

            const { data: accountGrants } = await supabase
                .from('temporary_access_grants')
                .select('id')
                .eq('agent_id', user.id)
                .eq('compte_credit_id', compteCreditId)
                .gt('expires_at', nowIso)
                .limit(1);

            if (accountGrants && accountGrants.length > 0) return true;

            return await this.hasAccess(clientId);
        } catch (error) {
            console.error('[accessService] Erreur lors de la verification des acces (compte credit):', error);
            return false;
        }
    },

    /**
     * Grant temporary access to an agent
     */
    async grantAccess(
        agentId: string,
        clientId: string,
        durationMinutes: number = 60,
        transactionId?: string,
        transactionType?: 'epargne' | 'credit',
        reason?: string,
        scopeType?: 'client' | 'compte_epargne' | 'compte_credit' | 'transaction_epargne' | 'transaction_credit',
        compteEpargneId?: string,
        compteCreditId?: string,
        resourceLabel?: string
    ): Promise<{ error?: string }> {
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        const { user } = useAuthStore.getState();

        if (!user) return { error: 'Non authentifie' };

        const payload: any = {
            agent_id: agentId,
            client_id: clientId,
            granted_by: user.id,
            expires_at: expiresAt,
            reason: reason || null,
            duration_minutes: durationMinutes,
            scope_type: scopeType || null,
            compte_epargne_id: compteEpargneId || null,
            compte_credit_id: compteCreditId || null,
            resource_label: resourceLabel || null,
        };

        if (transactionId) {
            if (transactionType === 'credit') {
                payload.transaction_credit_id = transactionId;
                payload.transaction_id = null;
            } else {
                payload.transaction_id = transactionId;
                payload.transaction_credit_id = null;
            }
        } else {
            payload.transaction_id = null;
            payload.transaction_credit_id = null;
        }

        const { error } = await supabase
            .from('temporary_access_grants')
            .insert(payload);

        if (error) return { error: error.message };
        return {};
    }
};
