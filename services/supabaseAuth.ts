import { supabase, handleSupabaseError, isOnline as isOnlineSupabase } from './supabase';
import { LoginCredentials, UserProfile, AuthError } from '../types/auth';
import { User } from '@supabase/supabase-js';
import { executeWithTimeout } from './networkMonitor';
import * as sessionManager from './sessionManager';

/**
 * Authentication service for Supabase
 * Handles login, logout, session management, and profile fetching
 */

// Storage keys for offline mode
const STORAGE_KEYS = {
  USER: 'bso_offline_user',
  PROFILE: 'bso_offline_profile',
  LAST_SYNC: 'bso_last_auth_sync',
};

/**
 * Register new user with email and password
 */
export const register = async (
  email: string,
  password: string,
  firstname: string,
  lastname: string
): Promise<{ user: User; profile: UserProfile } | AuthError> => {
  try {
    console.log('Attempting registration for:', email);

    // Offline-first: block registration when offline to avoid long waits
    if (!isOnlineSupabase()) {
      return { message: 'Vous êtes hors ligne. Impossible de créer un compte.' };
    }
    // 1. Create auth user
    const { data, error } = await executeWithTimeout(
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            firstname,
            lastname,
          }
        }
      }),
      10000
    );

    if (error) {
      console.error('Registration error:', error);
      return handleSupabaseError(error);
    }

    if (!data.user) {
      console.error('Registration failed: No user data returned');
      return { message: 'Échec de la création du compte' };
    }

    console.log('User created successfully:', data.user.id);

    // 2. Create profile in database
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: data.user.id,
        email,
        firstname,
        name: lastname,
        role: 4, // Default role (Agent)
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Don't throw - profile might be created by trigger
    }

    // Fetch the created profile
    const profile = await fetchUserProfile(data.user.id);

    if ('message' in profile) {
      // Profile creation failed, but user was created
      return {
        user: data.user,
        profile: {
          id: 0,
          user_id: data.user.id,
          email,
          firstname,
          name: lastname,
          role: 4,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      };
    }

    // Store for offline access
    storeOfflineAuthData(data.user, profile);

    console.log('Registration completed successfully');
    return { user: data.user, profile };
  } catch (error: any) {
    console.error('Registration catch error:', error);
    return handleSupabaseError(error);
  }
};

/**
 * Login with email and password
 */
export const login = async (credentials: LoginCredentials): Promise<{ user: User; profile: UserProfile; hadPreviousSession?: boolean } | AuthError> => {
  try {
    console.log('Attempting login for:', credentials.email);

    // Offline-first: fail fast offline (UI peut basculer en mode hors ligne)
    if (!isOnlineSupabase()) {
      return { message: 'Vous êtes hors ligne. Connectez-vous lorsque la connexion est disponible.' };
    }

    const { data, error } = await executeWithTimeout(supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    }), 10000);

    if (error) {
      console.error('Login error:', error);
      return handleSupabaseError(error);
    }

    if (!data.user) {
      console.error('Login failed: No user data returned');
      return { message: 'Échec de la connexion - utilisateur non trouvé' };
    }

    console.log('User logged in successfully:', data.user.id);

    // Fetch user profile from database
    const profile = await fetchUserProfile(data.user.id);

    if ('message' in profile) {
      console.error('Profile fetch failed:', profile.message);
      return profile; // Error occurred
    }

    // Gestion des sessions - vérifier la session existante
    const existingSession = await sessionManager.checkExistingSession(data.user.id);

    // Créer une nouvelle session (ceci invalidera l'ancienne)
    const sessionCreated = await sessionManager.createActiveSession(data.user.id);

    if (!sessionCreated) {
      console.warn('[Auth] Failed to create session - continuing anyway');
    }

    // Store for offline access
    storeOfflineAuthData(data.user, profile);

    console.log('Login completed successfully');
    return { user: data.user, profile, hadPreviousSession: existingSession };
  } catch (error: any) {
    console.error('Login catch error:', error);
    return handleSupabaseError(error);
  }
};

/**
 * Logout current user
 */
export const logout = async (): Promise<void | AuthError> => {
  try {
    // Récupérer l'ID utilisateur avant la déconnexion
    const { data: { user } } = await supabase.auth.getUser();

    // Si hors ligne, on efface localement sans appeler le réseau
    if (!isOnlineSupabase()) {
      clearOfflineAuthData();
      if (user) {
        await sessionManager.cleanupSession(user.id);
      }
      return;
    }

    const { error } = await executeWithTimeout(supabase.auth.signOut(), 8000);

    if (error) {
      return handleSupabaseError(error);
    }

    // Nettoyer la session
    if (user) {
      await sessionManager.cleanupSession(user.id);
    }

    // Clear offline storage
    clearOfflineAuthData();
  } catch (error: any) {
    return handleSupabaseError(error);
  }
};

/**
 * Get current session
 */
export const getCurrentSession = async () => {
  try {
    // Hors ligne: pas de session réseau
    if (!isOnlineSupabase()) {
      return { session: null, error: null };
    }

    const { data: { session }, error } = await executeWithTimeout(supabase.auth.getSession(), 8000);

    if (error) {
      return { session: null, error: handleSupabaseError(error) };
    }

    return { session, error: null };
  } catch (error: any) {
    return { session: null, error: handleSupabaseError(error) };
  }
};

/**
 * Get current user
 */
export const getCurrentUser = async (): Promise<{ user: User | null; profile: UserProfile | null }> => {
  try {
    // Offline-first: retourner immédiatement les données locales
    if (!isOnlineSupabase()) {
      return getOfflineAuthData();
    }

    const { data: { user }, error } = await executeWithTimeout(supabase.auth.getUser(), 8000);

    if (error || !user) {
      // Try to get from offline storage
      return getOfflineAuthData();
    }

    // Fetch fresh profile
    const profile = await fetchUserProfile(user.id);

    if ('message' in profile) {
      // If profile fetch fails, try offline data
      return getOfflineAuthData();
    }

    // Update offline storage
    storeOfflineAuthData(user, profile);

    return { user, profile };
  } catch (error) {
    // Fallback to offline data
    return getOfflineAuthData();
  }
};

/**
 * Fetch user profile from Supabase
 */
export const fetchUserProfile = async (userId: string): Promise<UserProfile | AuthError> => {
  try {
    if (!isOnlineSupabase()) {
      return { message: 'Hors ligne' };
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      return handleSupabaseError(error);
    }

    if (!data) {
      return { message: 'Profil utilisateur non trouvé' };
    }

    return data as UserProfile;
  } catch (error: any) {
    return handleSupabaseError(error);
  }
};

/**
 * Refresh user session
 */
export const refreshSession = async () => {
  try {
    if (!isOnlineSupabase()) {
      return { session: null, error: { message: 'Hors ligne', code: 'OFFLINE' } };
    }
    const { data, error } = await executeWithTimeout(supabase.auth.refreshSession(), 8000);

    if (error) {
      return { session: null, error: handleSupabaseError(error) };
    }

    return { session: data.session, error: null };
  } catch (error: any) {
    return { session: null, error: handleSupabaseError(error) };
  }
};

/**
 * Listen to auth state changes
 */
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });
};

/**
 * Store auth data for offline access
 */
const storeOfflineAuthData = (user: User, profile: UserProfile): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());
  } catch (error) {
    console.error('Failed to store offline auth data:', error);
  }
};

/**
 * Get auth data from offline storage
 */
const getOfflineAuthData = (): { user: User | null; profile: UserProfile | null } => {
  try {
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    const profileStr = localStorage.getItem(STORAGE_KEYS.PROFILE);

    if (!userStr || !profileStr) {
      return { user: null, profile: null };
    }

    const user = JSON.parse(userStr) as User;
    const profile = JSON.parse(profileStr) as UserProfile;

    return { user, profile };
  } catch (error) {
    console.error('Failed to retrieve offline auth data:', error);
    return { user: null, profile: null };
  }
};

/**
 * Clear offline auth data
 */
const clearOfflineAuthData = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
  } catch (error) {
    console.error('Failed to clear offline auth data:', error);
  }
};

/**
 * Check if user is authenticated (online or offline)
 */
export const isAuthenticated = async (): Promise<boolean> => {
  const { user, profile } = await getCurrentUser();
  return !!(user && profile);
};
