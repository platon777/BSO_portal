import React, { useState, useEffect } from 'react';

interface CacheStatus {
  version: string;
  cacheCount: number;
  cachedUrls: string[];
  isLoading: boolean;
}

const CacheDiagnostic: React.FC = () => {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>({
    version: 'unknown',
    cacheCount: 0,
    cachedUrls: [],
    isLoading: true,
  });
  const [isOpen, setIsOpen] = useState(false);

  const loadCacheStatus = async () => {
    setCacheStatus(prev => ({ ...prev, isLoading: true }));

    try {
      const cacheNames = await caches.keys();
      console.log('[CacheDiag] Found caches:', cacheNames);

      // Get the main cache
      const mainCacheName = cacheNames.find(name => name.includes('bso-portal-cache'));
      if (mainCacheName) {
        const cache = await caches.open(mainCacheName);
        const keys = await cache.keys();
        const urls = keys.map(req => req.url);

        setCacheStatus({
          version: mainCacheName,
          cacheCount: keys.length,
          cachedUrls: urls,
          isLoading: false,
        });

        console.log('[CacheDiag] Cache contents:', urls);
      } else {
        setCacheStatus({
          version: 'No cache found',
          cacheCount: 0,
          cachedUrls: [],
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('[CacheDiag] Error loading cache:', error);
      setCacheStatus(prev => ({ ...prev, isLoading: false }));
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCacheStatus();
    }
  }, [isOpen]);

  const categorizeUrls = () => {
    const categories = {
      html: [] as string[],
      css: [] as string[],
      js: [] as string[],
      other: [] as string[],
    };

    cacheStatus.cachedUrls.forEach(url => {
      if (url.includes('.css')) categories.css.push(url);
      else if (url.includes('.js')) categories.js.push(url);
      else if (url.includes('.html') || url.endsWith('/')) categories.html.push(url);
      else categories.other.push(url);
    });

    return categories;
  };

  const clearAllCaches = async () => {
    if (!confirm('Voulez-vous vraiment vider TOUS les caches ?')) return;

    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      alert('Tous les caches ont été vidés. Rechargez la page.');
      window.location.reload();
    } catch (error) {
      console.error('[CacheDiag] Error clearing caches:', error);
      alert('Erreur lors du vidage des caches');
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-purple-700 transition-colors text-sm font-medium"
      >
        🔍 Diagnostic Cache
      </button>
    );
  }

  const categories = categorizeUrls();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-purple-600 text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">🔍 Diagnostic du Cache</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white hover:text-gray-200 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-700">Version du cache:</span>
              <span className="text-gray-900 font-mono text-sm">{cacheStatus.version}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-700">Nombre de fichiers en cache:</span>
              <span className={`text-2xl font-bold ${cacheStatus.cacheCount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {cacheStatus.cacheCount}
              </span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{categories.html.length}</div>
              <div className="text-sm text-gray-600 mt-1">HTML</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{categories.css.length}</div>
              <div className="text-sm text-gray-600 mt-1">CSS</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600">{categories.js.length}</div>
              <div className="text-sm text-gray-600 mt-1">JavaScript</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-purple-600">{categories.other.length}</div>
              <div className="text-sm text-gray-600 mt-1">Autres</div>
            </div>
          </div>

          {/* Warning if missing critical files */}
          {categories.js.length === 0 && (
            <div className="bg-red-50 border-l-4 border-red-600 p-4">
              <div className="flex items-start">
                <span className="text-2xl mr-3">⚠️</span>
                <div>
                  <h3 className="font-bold text-red-800">PROBLÈME CRITIQUE DÉTECTÉ</h3>
                  <p className="text-red-700 mt-1">
                    Aucun fichier JavaScript n'est en cache ! L'application NE FONCTIONNERA PAS en mode offline.
                  </p>
                  <p className="text-red-600 text-sm mt-2">
                    Le service worker doit charger et mettre en cache tous les fichiers JS au premier chargement.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* File Lists */}
          <div className="space-y-4">
            {categories.html.length > 0 && (
              <details className="bg-gray-50 rounded-lg p-4">
                <summary className="font-semibold text-gray-700 cursor-pointer">
                  📄 Fichiers HTML ({categories.html.length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm font-mono">
                  {categories.html.map((url, i) => (
                    <li key={i} className="text-gray-600 truncate">{url}</li>
                  ))}
                </ul>
              </details>
            )}

            {categories.css.length > 0 && (
              <details className="bg-gray-50 rounded-lg p-4">
                <summary className="font-semibold text-gray-700 cursor-pointer">
                  🎨 Fichiers CSS ({categories.css.length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm font-mono">
                  {categories.css.map((url, i) => (
                    <li key={i} className="text-gray-600 truncate">{url}</li>
                  ))}
                </ul>
              </details>
            )}

            {categories.js.length > 0 && (
              <details className="bg-gray-50 rounded-lg p-4">
                <summary className="font-semibold text-gray-700 cursor-pointer">
                  ⚙️ Fichiers JavaScript ({categories.js.length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm font-mono">
                  {categories.js.map((url, i) => (
                    <li key={i} className="text-gray-600 truncate">{url}</li>
                  ))}
                </ul>
              </details>
            )}

            {categories.other.length > 0 && (
              <details className="bg-gray-50 rounded-lg p-4">
                <summary className="font-semibold text-gray-700 cursor-pointer">
                  📦 Autres fichiers ({categories.other.length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm font-mono">
                  {categories.other.map((url, i) => (
                    <li key={i} className="text-gray-600 truncate">{url}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t p-4 flex gap-3">
          <button
            onClick={loadCacheStatus}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            🔄 Recharger
          </button>
          <button
            onClick={clearAllCaches}
            className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            🗑️ Vider les caches
          </button>
        </div>
      </div>
    </div>
  );
};

export default CacheDiagnostic;
