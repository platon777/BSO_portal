import { supabase } from './supabase';
import { UserRole } from '../types/auth';

export const accessService = {
    /**
     * Check if current user has access to modify a client
     */
    async hasAccess(clientId: string): Promise<boolean> {
        // 1. Check if Admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (profile?.role === UserRole.ADMIN) return true;

        // 2. Check for temporary grant
        const { data: grant } = await supabase
            .from('temporary_access_grants')
            .select('id')
            .eq('agent_id', user.id)
            .eq('client_id', clientId)
            .gt('expires_at', new Date().toISOString())
            .single();

        return !!grant;
    },

    /**
     * Grant temporary access to an agent
     */
    async grantAccess(agentId: string, clientId: string, durationMinutes: number = 60): Promise<{ error?: string }> {
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return { error: 'Not authenticated' };

        const { error } = await supabase
            .from('temporary_access_grants')
            .insert({
                agent_id: agentId,
                client_id: clientId,
                granted_by: user.id,
                expires_at: expiresAt
            });

        if (error) return { error: error.message };
        return {};
    }
};
