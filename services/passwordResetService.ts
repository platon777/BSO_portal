import { supabase, handleSupabaseError, isOnline } from './supabase';
import { UserProfile } from '../types/auth';

export interface RecoveryLinkResult {
  success: boolean;
  action_link?: string;
  email_otp?: string;
  message?: string;
  error?: string;
}

export interface AdminUserListItem {
  id: string; // auth.users id (or profile id)
  user_id: string;
  email: string;
  firstname: string;
  name: string;
  role: number;
  created_at: string;
}

/**
 * Service to manage password resets and admin recovery link generation
 */

/**
 * Fetches all user profiles for admin user management
 */
export const fetchAllUsersWithProfiles = async (): Promise<AdminUserListItem[]> => {
  if (!isOnline()) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, email, firstname, name, role, created_at')
      .order('firstname', { ascending: true });

    if (error) {
      console.error('Error fetching users:', error);
      throw error;
    }

    return (data || []) as AdminUserListItem[];
  } catch (err: any) {
    console.error('fetchAllUsersWithProfiles failed:', err);
    return [];
  }
};

/**
 * Admin: Generate a direct password recovery link (Edge Function)
 * This allows an admin to copy the link and share it directly via WhatsApp/SMS
 */
export const adminGenerateRecoveryLink = async (
  email: string,
  redirectTo?: string
): Promise<RecoveryLinkResult> => {
  if (!isOnline()) {
    return { success: false, error: 'Vous devez être en ligne pour générer un lien.' };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      return { success: false, error: 'Session administrateur introuvable. Veuillez vous reconnecter.' };
    }

    const defaultRedirect = redirectTo || (typeof window !== 'undefined' ? `${window.location.origin}` : undefined);

    // Call Supabase Edge Function admin-reset-password
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL || 'https://fdsuyqbscrnityotpmbc.supabase.co'}/functions/v1/admin-reset-password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkc3V5cWJzY3JuaXR5b3RwbWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTQ0OTIsImV4cCI6MjEwMzQzMDQ5Mn0.wgreFjDyFxVkoq9m5K8Sndr7CQCGA2SbmLIgOW1OYAQ',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          redirectTo: defaultRedirect,
          sendEmail: false,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || result.error) {
      return {
        success: false,
        error: result.error || 'Erreur lors de la génération du lien de réinitialisation.',
      };
    }

    return {
      success: true,
      action_link: result.action_link,
      email_otp: result.email_otp,
      message: 'Lien de réinitialisation généré avec succès.',
    };
  } catch (err: any) {
    console.error('adminGenerateRecoveryLink error:', err);
    return {
      success: false,
      error: err.message || 'Impossible de contacter le serveur.',
    };
  }
};

/**
 * Admin: Send a password recovery email to a user
 */
export const adminSendRecoveryEmail = async (
  email: string,
  redirectTo?: string
): Promise<RecoveryLinkResult> => {
  if (!isOnline()) {
    return { success: false, error: 'Vous devez être en ligne pour envoyer un email.' };
  }

  try {
    const defaultRedirect = redirectTo || (typeof window !== 'undefined' ? `${window.location.origin}` : undefined);

    // 1. Try using the Edge Function first
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (token) {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://fdsuyqbscrnityotpmbc.supabase.co'}/functions/v1/admin-reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkc3V5cWJzY3JuaXR5b3RwbWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTQ0OTIsImV4cCI6MjEwMzQzMDQ5Mn0.wgreFjDyFxVkoq9m5K8Sndr7CQCGA2SbmLIgOW1OYAQ',
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            redirectTo: defaultRedirect,
            sendEmail: true,
          }),
        }
      );

      const result = await response.json();
      if (response.ok && result.success) {
        return {
          success: true,
          message: result.message || `Email envoyé avec succès à ${email}`,
        };
      }
    }

    // 2. Fallback: standard client resetPasswordForEmail
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: defaultRedirect,
    });

    if (error) {
      return {
        success: false,
        error: handleSupabaseError(error).message,
      };
    }

    return {
      success: true,
      message: `Email de réinitialisation envoyé à ${email}.`,
    };
  } catch (err: any) {
    console.error('adminSendRecoveryEmail error:', err);
    return {
      success: false,
      error: err.message || 'Échec de l envoi de l email.',
    };
  }
};

/**
 * Public: Request a password reset for self (from Login page)
 */
export const requestSelfPasswordReset = async (
  email: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  if (!isOnline()) {
    return { success: false, error: 'Connexion Internet requise.' };
  }

  try {
    const defaultRedirect = typeof window !== 'undefined' ? `${window.location.origin}` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: defaultRedirect,
    });

    if (error) {
      return { success: false, error: handleSupabaseError(error).message };
    }

    return {
      success: true,
      message: 'Un email contenant le lien de réinitialisation a été envoyé (vérifiez vos spams).',
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erreur lors de la demande.' };
  }
};

/**
 * Update user password (when in recovery session or logged in)
 */
export const updateUserPassword = async (
  newPassword: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isOnline()) {
    return { success: false, error: 'Connexion Internet requise pour changer le mot de passe.' };
  }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Le mot de passe doit comporter au moins 6 caractères.' };
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: handleSupabaseError(error).message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Impossible de mettre à jour le mot de passe.' };
  }
};
