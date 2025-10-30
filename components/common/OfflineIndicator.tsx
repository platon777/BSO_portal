import React, { useState, useEffect } from 'react';

interface ServiceWorkerInfo {
  isRegistered: boolean;
  isOnline: boolean;
  swVersion: string | null;
  updateAvailable: boolean;
}

const OfflineIndicator: React.FC = () => {
  const [swInfo, setSwInfo] = useState<ServiceWorkerInfo>({
    isRegistered: false,
    isOnline: navigator.onLine,
    swVersion: null,
    updateAvailable: false,
  });
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Check service worker registration
    const checkServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            setSwInfo(prev => ({
              ...prev,
              isRegistered: true,
              swVersion: registration.active ? 'v9' : null,
            }));

            // Check for updates
            registration.addEventListener('updatefound', () => {
              setSwInfo(prev => ({ ...prev, updateAvailable: true }));
            });
          }
        } catch (error) {
          console.error('Error checking service worker:', error);
        }
      }
    };

    checkServiceWorker();

    // Listen for online/offline events
    const handleOnline = () => setSwInfo(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setSwInfo(prev => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleUpdate = async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      }
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Main indicator badge */}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg cursor-pointer transition-all ${
          swInfo.isOnline
            ? 'bg-green-500 text-white'
            : 'bg-red-500 text-white animate-pulse'
        }`}
        onClick={() => setShowDetails(!showDetails)}
      >
        <div
          className={`w-3 h-3 rounded-full ${
            swInfo.isOnline ? 'bg-white' : 'bg-white animate-ping'
          }`}
        />
        <span className="text-sm font-medium">
          {swInfo.isOnline ? 'En ligne' : 'Hors ligne'}
        </span>
      </div>

      {/* Details panel */}
      {showDetails && (
        <div className="absolute bottom-14 right-0 w-80 bg-white rounded-lg shadow-xl border border-gray-200 p-4 space-y-3">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="font-semibold text-gray-900">État de l'application</h3>
            <button
              onClick={() => setShowDetails(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Connexion:</span>
              <span
                className={`font-medium ${
                  swInfo.isOnline ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {swInfo.isOnline ? 'En ligne' : 'Hors ligne'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Service Worker:</span>
              <span
                className={`font-medium ${
                  swInfo.isRegistered ? 'text-green-600' : 'text-yellow-600'
                }`}
              >
                {swInfo.isRegistered ? 'Actif' : 'Inactif'}
              </span>
            </div>

            {swInfo.swVersion && (
              <div className="flex justify-between">
                <span className="text-gray-600">Version:</span>
                <span className="font-medium text-gray-900">{swInfo.swVersion}</span>
              </div>
            )}

            {swInfo.updateAvailable && (
              <div className="pt-2 border-t">
                <button
                  onClick={handleUpdate}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Mettre à jour
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 border-t space-y-2">
            <p className="text-xs text-gray-500">
              {swInfo.isOnline
                ? 'Toutes les fonctionnalités sont disponibles.'
                : 'Mode hors ligne activé. Les données seront synchronisées lors de la reconnexion.'}
            </p>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const cacheNames = await caches.keys();
                  console.log('Caches actifs:', cacheNames);
                  alert(`Caches: ${cacheNames.length}\n${cacheNames.join('\n')}`);
                }}
                className="flex-1 text-xs bg-gray-100 text-gray-700 py-1 px-2 rounded hover:bg-gray-200"
              >
                Voir cache
              </button>
              <button
                onClick={async () => {
                  if (
                    confirm(
                      'Voulez-vous vider le cache ? Cela peut rendre l\'application inaccessible hors ligne.'
                    )
                  ) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                    window.location.reload();
                  }
                }}
                className="flex-1 text-xs bg-red-100 text-red-700 py-1 px-2 rounded hover:bg-red-200"
              >
                Vider cache
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineIndicator;
