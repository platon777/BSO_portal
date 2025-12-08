import { supabase } from './supabase';
import { generateDeviceFingerprint, getDeviceInfo } from './deviceFingerprint';
import { isOnline } from './networkMonitor';

/**
 * Session Manager Service
 * Gère les sessions actives pour la connexion single-device
 */

/**
 * Vérifie si l'utilisateur a une session active existante
 */
export const checkExistingSession = async (userId: string): Promise<boolean> => {
  if (!isOnline()) return false;

  try {
    const { data, error } = await supabase
      .from('active_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('[SessionManager] Error checking existing session:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('[SessionManager] Exception checking existing session:', error);
    return false;
  }
};

/**
 * Invalide toutes les sessions actives pour un utilisateur
 */
const invalidateAllSessions = async (userId: string): Promise<void> => {
  if (!isOnline()) return;

  try {
    const { error } = await supabase
      .from('active_sessions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('[SessionManager] Error invalidating sessions:', error);
    }
  } catch (error) {
    console.error('[SessionManager] Exception invalidating sessions:', error);
  }
};

/**
 * Crée une nouvelle session active (invalide les anciennes)
 */
export const createActiveSession = async (userId: string): Promise<boolean> => {
  if (!isOnline()) {
    console.log('[SessionManager] Offline - skipping session creation');
    return false;
  }

  try {
    const fingerprint = generateDeviceFingerprint();
    const deviceInfo = getDeviceInfo();

    // Invalider les sessions existantes d'abord
    await invalidateAllSessions(userId);

    // Créer la nouvelle session
    const { error } = await supabase
      .from('active_sessions')
      .insert({
        user_id: userId,
        device_fingerprint: fingerprint,
        device_info: deviceInfo,
        is_active: true,
      });

    if (error) {
      console.error('[SessionManager] Error creating session:', error);
      return false;
    }

    // Stocker le fingerprint localement
    localStorage.setItem('bso_device_fingerprint', fingerprint);
    console.log('[SessionManager] Session created successfully');
    return true;
  } catch (error) {
    console.error('[SessionManager] Exception creating session:', error);
    return false;
  }
};

/**
 * Valide que la session actuelle de l'appareil est toujours valide
 */
export const validateCurrentSession = async (userId: string): Promise<boolean> => {
  if (!isOnline()) {
    console.log('[SessionManager] Offline - skipping session validation');
    return true; // Considérer comme valide hors ligne
  }

  try {
    const storedFingerprint = localStorage.getItem('bso_device_fingerprint');
    if (!storedFingerprint) {
      console.log('[SessionManager] No stored fingerprint found');
      return false;
    }

    const { data, error } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('device_fingerprint', storedFingerprint)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('[SessionManager] Error validating session:', error);
      return false;
    }

    if (!data) {
      console.log('[SessionManager] No active session found for this device');
      return false;
    }

    // Mettre à jour last_active
    await updateSessionActivity(userId);
    return true;
  } catch (error) {
    console.error('[SessionManager] Exception validating session:', error);
    return false;
  }
};

/**
 * Met à jour l'activité de la session
 */
export const updateSessionActivity = async (userId: string): Promise<void> => {
  if (!isOnline()) return;

  try {
    const storedFingerprint = localStorage.getItem('bso_device_fingerprint');
    if (!storedFingerprint) return;

    await supabase
      .from('active_sessions')
      .update({ last_active: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('device_fingerprint', storedFingerprint)
      .eq('is_active', true);
  } catch (error) {
    console.error('[SessionManager] Exception updating session activity:', error);
  }
};

/**
 * Nettoie la session lors de la déconnexion
 */
export const cleanupSession = async (userId: string): Promise<void> => {
  if (!isOnline()) {
    // Nettoyer quand même localement
    localStorage.removeItem('bso_device_fingerprint');
    return;
  }

  try {
    const storedFingerprint = localStorage.getItem('bso_device_fingerprint');
    if (!storedFingerprint) return;

    await supabase
      .from('active_sessions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('device_fingerprint', storedFingerprint);

    localStorage.removeItem('bso_device_fingerprint');
    console.log('[SessionManager] Session cleaned up successfully');
  } catch (error) {
    console.error('[SessionManager] Exception cleaning up session:', error);
  }
};
