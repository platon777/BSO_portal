import { createClient } from '@supabase/supabase-js';

// Supabase configuration from .mcp.json
const SUPABASE_URL = 'https://cdfqltezhcssutyjtyjb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkZnFsdGV6aGNzc3V0eWp0eWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY5NzgzNjksImV4cCI6MjA1MjU1NDM2OX0.yTyD5MBf3bE-Fko4rOzY0dGIEPyDYCBnG79GfGFLHFs';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

// Helper to check if we're online
export const isOnline = (): boolean => {
  return navigator.onLine;
};

// Helper to handle network errors gracefully
export const handleSupabaseError = (error: any): { message: string; code?: string } => {
  if (!isOnline()) {
    return {
      message: 'Vous êtes hors ligne. Veuillez vérifier votre connexion Internet.',
      code: 'OFFLINE',
    };
  }

  if (error?.message) {
    return {
      message: error.message,
      code: error.code || error.status,
    };
  }

  return {
    message: 'Une erreur inconnue s\'est produite',
    code: 'UNKNOWN',
  };
};
