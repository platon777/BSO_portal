import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { UserProfile } from '../types/auth';
import * as authService from '../services/supabaseAuth';

interface AuthStore {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isOffline: boolean;
  isLoading: boolean;

  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setOfflineMode: (offline: boolean) => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  isAuthenticated: false,
  isOffline: !navigator.onLine,
  isLoading: true,

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

    return { success: true };
  },

  /**
   * Logout user
   */
  logout: async () => {
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
