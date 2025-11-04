/**
 * Error Handler Service
 * Provides detailed error messages for Supabase and sync operations
 */

export interface ParsedError {
  title: string;
  message: string;
  details?: string;
  hint?: string;
  code?: string;
  userFriendly: string;
}

/**
 * Parse Supabase/PostgreSQL error into user-friendly message
 */
export function parseSupabaseError(error: any): ParsedError {
  const errorCode = error?.code || error?.error_code || '';
  const errorMessage = error?.message || error?.error || 'Erreur inconnue';
  const errorDetails = error?.details || '';
  const errorHint = error?.hint || '';

  // Common PostgreSQL error codes
  const errorMappings: Record<string, { title: string; userMessage: string }> = {
    // Constraint violations
    '23502': {
      title: 'Champ obligatoire manquant',
      userMessage: 'Un champ obligatoire est vide ou manquant.',
    },
    '23503': {
      title: 'Référence invalide',
      userMessage: 'Cette opération fait référence à un élément qui n\'existe pas.',
    },
    '23505': {
      title: 'Donnée déjà existante',
      userMessage: 'Cette donnée existe déjà dans la base de données.',
    },
    '23514': {
      title: 'Validation échouée',
      userMessage: 'Les données ne respectent pas les règles de validation.',
    },

    // Data type errors
    '22P02': {
      title: 'Format de données invalide',
      userMessage: 'Le format des données envoyées est incorrect.',
    },
    '22003': {
      title: 'Valeur numérique hors limites',
      userMessage: 'Un nombre est trop grand ou trop petit.',
    },
    '22001': {
      title: 'Texte trop long',
      userMessage: 'Un champ de texte dépasse la longueur maximale autorisée.',
    },

    // Permission errors
    '42501': {
      title: 'Permission insuffisante',
      userMessage: 'Vous n\'avez pas les permissions nécessaires pour cette opération.',
    },
    '42P01': {
      title: 'Table inexistante',
      userMessage: 'La table demandée n\'existe pas dans la base de données.',
    },

    // Connection errors
    '08000': {
      title: 'Erreur de connexion',
      userMessage: 'Impossible de se connecter à la base de données.',
    },
    '08006': {
      title: 'Connexion interrompue',
      userMessage: 'La connexion à la base de données a été interrompue.',
    },

    // Timeout errors
    '57014': {
      title: 'Opération annulée',
      userMessage: 'L\'opération a pris trop de temps et a été annulée.',
    },
  };

  const mapping = errorMappings[errorCode];

  // Extract field name from error details if available
  let fieldName = '';
  const fieldMatch = errorDetails.match(/column\s+"?(\w+)"?/i) ||
                     errorMessage.match(/column\s+"?(\w+)"?/i) ||
                     errorDetails.match(/Key\s+\((\w+)\)/i);
  if (fieldMatch) {
    fieldName = fieldMatch[1];
  }

  // Build user-friendly message
  let userFriendly = mapping?.userMessage || errorMessage;
  if (fieldName) {
    userFriendly += ` (Champ concerné: ${fieldName})`;
  }

  // Add hint if available
  let hint = errorHint;
  if (!hint && errorCode === '23502' && fieldName) {
    hint = `Veuillez renseigner le champ "${fieldName}"`;
  }

  return {
    title: mapping?.title || 'Erreur de synchronisation',
    message: errorMessage,
    details: errorDetails || undefined,
    hint: hint || undefined,
    code: errorCode || undefined,
    userFriendly,
  };
}

/**
 * Format error for display in UI
 */
export function formatErrorForDisplay(error: ParsedError, context?: string): string {
  let formatted = `❌ ${error.title}`;

  if (context) {
    formatted += `\n📍 Contexte: ${context}`;
  }

  formatted += `\n💬 ${error.userFriendly}`;

  if (error.hint) {
    formatted += `\n💡 ${error.hint}`;
  }

  if (error.code) {
    formatted += `\n🔢 Code: ${error.code}`;
  }

  return formatted;
}

/**
 * Format error for logging
 */
export function formatErrorForLog(error: ParsedError, context?: string): string {
  let log = `[${error.title}]`;

  if (context) {
    log += ` ${context}:`;
  }

  log += ` ${error.message}`;

  if (error.details) {
    log += ` | Details: ${error.details}`;
  }

  if (error.hint) {
    log += ` | Hint: ${error.hint}`;
  }

  if (error.code) {
    log += ` | Code: ${error.code}`;
  }

  return log;
}

/**
 * Create context string for sync operations
 */
export function createSyncContext(table: string, action: string, pk?: string): string {
  let context = `${table} (${action})`;
  if (pk) {
    context += ` - ID: ${pk.substring(0, 8)}...`;
  }
  return context;
}

/**
 * Parse network errors
 */
export function parseNetworkError(error: any): ParsedError {
  if (!navigator.onLine) {
    return {
      title: 'Pas de connexion Internet',
      message: 'Aucune connexion Internet disponible',
      userFriendly: 'Vous êtes hors ligne. Veuillez vérifier votre connexion Internet.',
    };
  }

  if (error?.message?.includes('fetch') || error?.message?.includes('network')) {
    return {
      title: 'Erreur réseau',
      message: error.message,
      userFriendly: 'Impossible de joindre le serveur. Vérifiez votre connexion Internet.',
    };
  }

  return {
    title: 'Erreur de communication',
    message: error?.message || 'Erreur inconnue',
    userFriendly: 'Une erreur est survenue lors de la communication avec le serveur.',
  };
}
