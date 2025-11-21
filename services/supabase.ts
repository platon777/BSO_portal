import { createClient } from '@supabase/supabase-js';

// Supabase configuration from .mcp.json
const SUPABASE_URL = 'https://cdfqltezhcssutyjtyjb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkZnFsdGV6aGNzc3V0eWp0eWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUyMjM4ODksImV4cCI6MjA1MDc5OTg4OX0.UrlM7GogBnQZnkZkHH9F_jCQ8gDC06oPi78gBCEzivk';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

//test deploy

// Helper to check if we're online
export const isOnline = (): boolean => {
  return navigator.onLine;
};

// Helper to handle network errors gracefully
export const handleSupabaseError = (error: any): { message: string; code?: string } => {
  console.error('Supabase Error:', error);

  if (!isOnline()) {
    return {
      message: 'Vous êtes hors ligne. Veuillez vérifier votre connexion Internet.',
      code: 'OFFLINE',
    };
  }

  // Handle timeout errors
  if (error?.name === 'TimeoutError' || error?.message?.includes('timeout')) {
    return {
      message: 'La requête a expiré. Vérifiez votre connexion Internet.',
      code: 'TIMEOUT',
    };
  }

  // Handle network errors
  if (error?.message?.includes('fetch') || error?.message?.includes('network')) {
    return {
      message: 'Erreur de connexion au serveur. Vérifiez votre connexion Internet.',
      code: 'NETWORK_ERROR',
    };
  }

  // Map common Supabase error messages to French
  const errorMessage = error?.message || '';
  const errorCode = error?.code || error?.status || '';

  // Authentication errors
  if (errorMessage.includes('User already registered') || errorMessage.includes('already been registered')) {
    return {
      message: 'Cet email est déjà enregistré. Veuillez vous connecter ou utiliser un autre email.',
      code: errorCode,
    };
  }

  if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('Invalid credentials')) {
    return {
      message: 'Email ou mot de passe incorrect. Veuillez réessayer.',
      code: errorCode,
    };
  }

  if (errorMessage.includes('Email not confirmed')) {
    return {
      message: 'Veuillez confirmer votre email avant de vous connecter.',
      code: errorCode,
    };
  }

  if (errorMessage.includes('Password should be at least')) {
    return {
      message: 'Le mot de passe doit contenir au moins 6 caractères.',
      code: errorCode,
    };
  }

  if (errorMessage.includes('Unable to validate email address')) {
    return {
      message: 'Adresse email invalide. Veuillez vérifier votre email.',
      code: errorCode,
    };
  }

  if (errorMessage.includes('Email rate limit exceeded')) {
    return {
      message: 'Trop de tentatives. Veuillez réessayer dans quelques minutes.',
      code: errorCode,
    };
  }

  if (errorMessage.includes('Signup disabled')) {
    return {
      message: 'Les inscriptions sont temporairement désactivées.',
      code: errorCode,
    };
  }

  if (errorMessage.includes('Database error') || errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
    return {
      message: 'Erreur de base de données. Veuillez contacter l\'administrateur.',
      code: errorCode,
    };
  }

  // Return the original error message if no match found
  if (error?.message) {
    return {
      message: error.message,
      code: errorCode,
    };
  }

  return {
    message: 'Une erreur inconnue s\'est produite. Veuillez réessayer.',
    code: 'UNKNOWN',
  };
};
