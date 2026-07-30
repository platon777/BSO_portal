import path from 'path';
import { defineConfig } from 'vitest/config';

// Tests unitaires de la logique metier (aucune dependance DOM/IndexedDB reelle :
// les modules qui touchent Dexie/Supabase sont mockes dans les tests concernes).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    globals: true,
    // happy-dom fournit window/localStorage (requis par services/supabase.ts au chargement).
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
});
