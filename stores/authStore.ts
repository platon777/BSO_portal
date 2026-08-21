import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { UserProfile } from '../types/auth';
import * as authService from '../services/supabaseAuth';
import * as sessionManager from '../services/sessionManager';
import toast from 'react-hot-toast';

interface AuthStore {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isOffline: boolean;
  isLoading: boolean;
  sessionValidationInterval: NodeJS.Timeout | null;

  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, firstname: string, lastname: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setOfflineMode: (offline: boolean) => void;
  validateSession: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  isAuthenticated: false,
  isOffline: !navigator.onLine,
  isLoading: true,
  sessionValidationInterval: null,

  /**
   * Login user
   */
  login: async (email: string, password: string) => {
    set({ isLoading: true });

    const result = await authService.login({ email, password });

    if ('message' in result) {
      set({ isLoading: false });
      return { success: false, error: result.message };
    }

    set({
      user: result.user,
      profile: result.profile,
      isAuthenticated: true,
      isLoading: false,
    });

    // Afficher une notification si un autre appareil a été déconnecté
    if (result.hadPreviousSession) {
      toast.success(
        'Connexion réussie. Votre session précédente a été déconnectée.',
        { duration: 5000 }
      );
    }

    // Démarrer la validation de session
    get().validateSession();

    return { success: true };
  },

  /**
   * Register new user
   */
  register: async (email: string, password: string, firstname: string, lastname: string, invitationCode: string) => {
    set({ isLoading: true });

    const result = await authService.register(email, password, firstname, lastname, invitationCode);

    if ('message' in result) {
      set({ isLoading: false });
      return { success: false, error: result.message };
    }

    set({
      user: result.user,
      profile: result.profile,
      isAuthenticated: true,
      isLoading: false,
    });

    return { success: true };
  },

  /**
   * Logout user
   */
  logout: async () => {
    // Effacer l'intervalle de validation de session
    const interval = get().sessionValidationInterval;
    if (interval) {
      clearInterval(interval);
      set({ sessionValidationInterval: null });
    }

    await authService.logout();
    set({
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  /**
   * Refresh current user data
   */
  refreshUser: async () => {
    set({ isLoading: true });

    const { user, profile } = await authService.getCurrentUser();

    set({
      user,
      profile,
      isAuthenticated: !!(user && profile),
      isLoading: false,
    });
  },

  /**
   * Set offline mode
   */
  setOfflineMode: (offline: boolean) => {
    set({ isOffline: offline });
  },

  /**
   * Validate session and set up periodic validation
   */
  validateSession: async () => {
    const user = get().user;
    if (!user) return;

    // Effacer l'intervalle existant
    const existingInterval = get().sessionValidationInterval;
    if (existingInterval) clearInterval(existingInterval);

    // Valider immédiatement
    const isValid = await sessionManager.validateCurrentSession(user.id);
    if (!isValid && get().isAuthenticated) {
      toast.error(
        'Votre session a été déconnectée car vous vous êtes connecté depuis un autre appareil.',
        { duration: 6000 }
      );
      get().logout();
      return;
    }

    // Mettre en place une validation périodique (toutes les 30 secondes)
    const interval = setInterval(async () => {
      const currentUser = get().user;
      if (!currentUser || !get().isAuthenticated) {
        clearInterval(interval);
        set({ sessionValidationInterval: null });
        return;
      }

      const isStillValid = await sessionManager.validateCurrentSession(currentUser.id);
      if (!isStillValid) {
        toast.error(
          'Votre session a été déconnectée car vous vous êtes connecté depuis un autre appareil.',
          { duration: 6000 }
        );
        clearInterval(interval);
        set({ sessionValidationInterval: null });
        get().logout();
      }
    }, 30000);

    set({ sessionValidationInterval: interval });
  },

  /**
   * Initialize auth state on app load
   */
  initialize: async () => {
    set({ isLoading: true });

    // Get current user (online or offline)
    const { user, profile } = await authService.getCurrentUser();

    set({
      user,
      profile,
      isAuthenticated: !!(user && profile),
      isOffline: !navigator.onLine,
      isLoading: false,
    });

    // Démarrer la validation de session si authentifié
    if (user && profile) {
      get().validateSession();
    }

    // Listen to auth changes
    authService.onAuthStateChange(async (user) => {
      if (user) {
        const profile = await authService.fetchUserProfile(user.id);
        if (!('message' in profile)) {
          set({
            user,
            profile,
            isAuthenticated: true,
          });
        }
      } else {
        set({
          user: null,
          profile: null,
          isAuthenticated: false,
        });
      }
    });

    // Listen to online/offline events
    const handleOnline = () => {
      set({ isOffline: false });
      // Refresh user when coming back online
      get().refreshUser();
    };

    const handleOffline = () => {
      set({ isOffline: true });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  },
}));
