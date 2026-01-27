import { supabase } from './supabase';
import { UserRole } from '../types/auth';

export const accessService = {
    /**
     * Check if current user has access to modify a client
     */
    /**
     * Check if current user has access to modify a client or a specific transaction
     */
    async hasAccess(clientId: string, transactionId?: string): Promise<boolean> {
        // 1. Check if Admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (profile?.role === UserRole.ADMIN) return true;

        // 2. Check for temporary grant (Client Level)
        const { data: clientGrants } = await supabase
            .from('temporary_access_grants')
            .select('id')
            .eq('agent_id', user.id)
            .eq('client_id', clientId)
            .is('transaction_id', null) // Explicitly check for NULL transaction_id for client-level access
            .gt('expires_at', new Date().toISOString())
            .limit(1);

        if (clientGrants && clientGrants.length > 0) return true;

        // 3. Check for temporary grant (Transaction Level)
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

        return false;
    },

    /**
     * Grant temporary access to an agent
     */
    async grantAccess(agentId: string, clientId: string, durationMinutes: number = 60, transactionId?: string): Promise<{ error?: string }> {
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return { error: 'Not authenticated' };

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
