import { db } from '../services/database';

export const OLD_SUPABASE_PROJECT_REF = 'cdfqltezhcssutyjtyjb';
export const NEW_SUPABASE_PROJECT_REF = 'fdsuyqbscrnityotpmbc';

/**
 * Normalise l'URL d'une photo pour s'assurer qu'elle pointe vers le bon projet Supabase.
 * Corrige automatiquement les URLs qui pointent encore vers l'ancien projet cdfqltezhcssutyjtyjb.
 */
export const normalizePhotoUrl = (url?: string | null): string | undefined => {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes(OLD_SUPABASE_PROJECT_REF)) {
    return trimmed.replace(new RegExp(OLD_SUPABASE_PROJECT_REF, 'g'), NEW_SUPABASE_PROJECT_REF);
  }
  return trimmed;
};

/**
 * Migre les URLs de photos stockées localement dans Dexie (IndexedDB)
 * sans attendre une resynchronisation réseau complète.
 */
export const migrateOldPhotoUrlsInDexie = async (): Promise<{ personnesFixed: number; epargneFixed: number }> => {
  let personnesFixed = 0;
  let epargneFixed = 0;

  try {
    const personnes = await db.personnes
      .filter((p) => Boolean(p.photo_identification && p.photo_identification.includes(OLD_SUPABASE_PROJECT_REF)))
      .toArray();

    for (const p of personnes) {
      if (p.photo_identification) {
        const normalized = normalizePhotoUrl(p.photo_identification);
        if (normalized && normalized !== p.photo_identification) {
          await db.personnes.update(p.id_personne, { photo_identification: normalized });
          personnesFixed++;
        }
      }
    }

    const comptesEpargne = await db.comptes_epargne
      .filter((c) =>
        Boolean(
          (c.photo_personne_autorisee && c.photo_personne_autorisee.includes(OLD_SUPABASE_PROJECT_REF)) ||
          (c.photo_allowed && c.photo_allowed.includes(OLD_SUPABASE_PROJECT_REF))
        )
      )
      .toArray();

    for (const c of comptesEpargne) {
      const updates: Partial<typeof c> = {};
      if (c.photo_personne_autorisee && c.photo_personne_autorisee.includes(OLD_SUPABASE_PROJECT_REF)) {
        updates.photo_personne_autorisee = normalizePhotoUrl(c.photo_personne_autorisee);
      }
      if (c.photo_allowed && c.photo_allowed.includes(OLD_SUPABASE_PROJECT_REF)) {
        updates.photo_allowed = normalizePhotoUrl(c.photo_allowed);
      }
      if (Object.keys(updates).length > 0) {
        await db.comptes_epargne.update(c.id_compte_epargne, updates);
        epargneFixed++;
      }
    }

    if (personnesFixed > 0 || epargneFixed > 0) {
      console.log(`[Dexie] Migration photos terminee: ${personnesFixed} personnes, ${epargneFixed} comptes epargne.`);
    }
  } catch (error) {
    console.warn('[Dexie] Erreur lors de la migration locale des URLs photos:', error);
  }

  return { personnesFixed, epargneFixed };
};
