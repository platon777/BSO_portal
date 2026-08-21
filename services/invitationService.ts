import { supabase, isOnline } from './supabase';

export interface InvitationCodeRecord {
  id: string;
  code: string;
  role: number;
  created_by?: string;
  created_at: string;
  expires_at: string;
  is_used: boolean;
  used_by?: string;
  used_at?: string;
  note?: string;
  creator_name?: string;
  used_by_name?: string;
  used_by_email?: string;
}

export interface ValidateCodeResult {
  valid: boolean;
  role?: number;
  role_label?: string;
  expires_at?: string;
  message: string;
}

// 1. Valider un code d'invitation (accessible publiquement)
export const validateInvitationCode = async (code: string): Promise<ValidateCodeResult> => {
  if (!code || !code.trim()) {
    return { valid: false, message: 'Veuillez saisir un code d invitation.' };
  }

  if (!isOnline()) {
    return { valid: false, message: 'Connexion Internet requise pour vérifier le code d invitation.' };
  }

  try {
    const { data, error } = await supabase.rpc('validate_invitation_code', {
      p_code: code.trim(),
    });

    if (error) throw error;
    return data as ValidateCodeResult;
  } catch (err: any) {
    return {
      valid: false,
      message: err?.message || 'Erreur lors de la validation du code.',
    };
  }
};

// 2. Générer un nouveau code d'invitation (Admin ou Manager)
export const generateInvitationCode = async (
  role: number,
  note?: string,
  expiresDays: number = 14
): Promise<{ success: boolean; data?: any; error?: string }> => {
  if (!isOnline()) {
    return { success: false, error: 'Connexion Internet requise pour générer un code.' };
  }

  try {
    const { data, error } = await supabase.rpc('generate_invitation_code', {
      p_role: role,
      p_note: note?.trim() || null,
      p_expires_days: expiresDays,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Échec de génération du code.' };
  }
};

// 3. Récupérer la liste des codes d'invitation (Admin ou Manager)
export const fetchInvitationCodes = async (): Promise<InvitationCodeRecord[]> => {
  if (!isOnline()) return [];

  try {
    const { data, error } = await supabase
      .from('invitation_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data) return [];

    // Récupérer les profils pour afficher les noms des créateurs et utilisateurs
    const userIds = Array.from(
      new Set(
        data
          .flatMap((item: any) => [item.created_by, item.used_by])
          .filter(Boolean)
      )
    );

    let profilesMap = new Map<string, { name: string; email: string }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, firstname, name, email')
        .in('user_id', userIds);

      if (profiles) {
        profiles.forEach((p: any) => {
          const fullName = [p.firstname, p.name].filter(Boolean).join(' ').trim() || p.email || p.user_id;
          profilesMap.set(p.user_id, { name: fullName, email: p.email });
        });
      }
    }

    return data.map((item: any) => ({
      ...item,
      creator_name: item.created_by ? profilesMap.get(item.created_by)?.name || 'Admin' : 'Système',
      used_by_name: item.used_by ? profilesMap.get(item.used_by)?.name || 'Utilisateur' : undefined,
      used_by_email: item.used_by ? profilesMap.get(item.used_by)?.email || '' : undefined,
    }));
  } catch (err) {
    console.error('Erreur chargement codes invitation:', err);
    return [];
  }
};

// 4. Révoquer un code d'invitation
export const revokeInvitationCode = async (codeId: string): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('revoke_invitation_code', {
      p_code_id: codeId,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Erreur révocation code:', err);
    return false;
  }
};
