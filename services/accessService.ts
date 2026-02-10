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
                .gt('expires_at', new Date().toISOString())
                .limit(1);

            if (clientGrants && clientGrants.length > 0) return true;

            // Transaction-level grant
            if (transactionId) {
                const { data: txGrants } = await supabase
                    .from('temporary_access_grants')
                    .select('id')
                    .eq('agent_id', user.id)
                    .eq('transaction_id', transactionId)
                    .gt('expires_at', new Date().toISOString())
                    .limit(1);

                if (txGrants && txGrants.length > 0) return true;
            }
        } catch (error) {
            console.error('[accessService] Erreur lors de la verification des acces:', error);
        }

        return false;
    },

    /**
     * Grant temporary access to an agent
     */
    async grantAccess(agentId: string, clientId: string, durationMinutes: number = 60, transactionId?: string): Promise<{ error?: string }> {
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        const { user } = useAuthStore.getState();

        if (!user) return { error: 'Non authentifie' };

        const { error } = await supabase
            .from('temporary_access_grants')
            .insert({
                agent_id: agentId,
                client_id: clientId,
                transaction_id: transactionId || null,
                granted_by: user.id,
                expires_at: expiresAt
            });

        if (error) return { error: error.message };
        return {};
    }
};
