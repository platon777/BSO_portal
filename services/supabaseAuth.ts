import { supabase, handleSupabaseError } from './supabase';
import { LoginCredentials, UserProfile, AuthError } from '../types/auth';
import { User } from '@supabase/supabase-js';

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
    // 1. Create auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          firstname,
          lastname,
        }
      }
    });

    if (error) {
      return handleSupabaseError(error);
    }

    if (!data.user) {
      return { message: 'Échec de la création du compte' };
    }

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

    return { user: data.user, profile };
  } catch (error: any) {
    return handleSupabaseError(error);
  }
};

/**
 * Login with email and password
 */
export const login = async (credentials: LoginCredentials): Promise<{ user: User; profile: UserProfile } | AuthError> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      return handleSupabaseError(error);
    }

    if (!data.user) {
      return { message: 'Échec de la connexion - utilisateur non trouvé' };
    }

    // Fetch user profile from database
    let profile = await fetchUserProfile(data.user.id);

    if ('message' in profile) {
      // Profile doesn't exist, create it automatically
      console.log('Profile not found, creating one...');

      const { error: createError } = await supabase
        .from('profiles')
        .insert({
          user_id: data.user.id,
          email: data.user.email || credentials.email,
          firstname: data.user.user_metadata?.firstname || '',
          name: data.user.user_metadata?.lastname || data.user.user_metadata?.name || '',
          role: 4, // Default role
        });

      if (createError) {
        console.error('Failed to create profile:', createError);
      }

      // Try to fetch again
      profile = await fetchUserProfile(data.user.id);

      if ('message' in profile) {
        // Still failed, create a temporary profile
        profile = {
          id: 0,
          user_id: data.user.id,
          email: data.user.email || credentials.email,
          firstname: data.user.user_metadata?.firstname || 'User',
          name: data.user.user_metadata?.lastname || data.user.user_metadata?.name || 'Unknown',
          role: 4,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    }

    // Store for offline access
    storeOfflineAuthData(data.user, profile);

    return { user: data.user, profile };
  } catch (error: any) {
    return handleSupabaseError(error);
  }
};

/**
 * Logout current user
 */
export const logout = async (): Promise<void | AuthError> => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return handleSupabaseError(error);
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
    const { data: { session }, error } = await supabase.auth.getSession();

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
    const { data: { user }, error } = await supabase.auth.getUser();

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
    const { data, error } = await supabase.auth.refreshSession();

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
