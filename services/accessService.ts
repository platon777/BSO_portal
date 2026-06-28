import { supabase } from './supabase';
import { UserRole } from '../types/auth';
import { useAuthStore } from '../stores/authStore';

export const accessService = {
    /**
     * Check if current user has access to modify a client or a specific transaction.
     * Uses the local auth store to avoid network calls that can trigger logout.
     */
    async hasAccess(_clientId: string, _transactionId?: string): Promise<boolean> {
        // Decision produit: tout utilisateur authentifie peut modifier les donnees.
        // Le gating par grants temporaires (temporary_access_grants) n'est plus
        // utilise pour bloquer l'edition; le modal d'octroi reste disponible mais
        // n'est plus un prerequis. Voir migration 20260628_open_write_policies_for_authenticated.sql.
        const { user, profile } = useAuthStore.getState();
        return Boolean(user && profile);
    },

    async hasAccessToCompteEpargne(_clientId: string, _compteEpargneId: string): Promise<boolean> {
        const { user, profile } = useAuthStore.getState();
        return Boolean(user && profile);
    },

    async hasAccessToCompteCredit(_clientId: string, _compteCreditId: string): Promise<boolean> {
        const { user, profile } = useAuthStore.getState();
        return Boolean(user && profile);
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
