import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/layout/MobileNav';
import Header from './components/layout/Header';
import Clients from './pages/Clients';
import ComptesEpargne from './pages/ComptesEpargne';
import ComptesCredit from './pages/ComptesCredit';
import ClientDetails from './pages/ClientDetails';
import CompteEpargneDetails from './pages/CompteEpargneDetails';
import CompteCreditDetails from './pages/CompteCreditDetails';
import Parametres from './pages/Parametres';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { ModalProvider } from './contexts/ModalContext';
import { db, seedDatabase } from './services/database';
import ModalRoot from './components/common/ModalRoot';
import OfflineIndicator from './components/common/OfflineIndicator';
import { useAuthStore } from './stores/authStore';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/common/ErrorBoundary';

type Page =
  | 'dashboard'
  | 'clients'
  | 'epargne'
  | 'credit'
  | 'recouvrement'
  | 'rapports'
  | 'parametres'
  | 'client_details'
  | 'epargne_details'
  | 'credit_details'
  | 'login'
  | 'signup';
type NavPage = 'dashboard' | 'clients' | 'epargne' | 'credit' | 'recouvrement' | 'rapports' | 'parametres';

// Export a simple navigation hook for use in child components
let navigateFn: ((page: Page) => void) | null = null;

export const useNavigate = () => {
  return navigateFn || (() => { });
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('clients');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedEpargneId, setSelectedEpargneId] = useState<string | null>(null);
  const [selectedCreditId, setSelectedCreditId] = useState<string | null>(null);
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    const APP_BUILD_VERSION = '2026-02-11-credit-fix-hotpatch-1';
    const APP_BUILD_VERSION_KEY = 'bso_app_build_version';

    const refreshPwaBundleIfNeeded = async (): Promise<boolean> => {
      const previousVersion = localStorage.getItem(APP_BUILD_VERSION_KEY);
      if (previousVersion === APP_BUILD_VERSION) {
        return false;
      }

      localStorage.setItem(APP_BUILD_VERSION_KEY, APP_BUILD_VERSION);

      // First install: no forced reload needed.
      if (!previousVersion) {
        return false;
      }

      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
        }
      } catch (error) {
        console.warn('[App] Failed to fully refresh PWA cache', error);
      }

      window.location.reload();
      return true;
    };

    (async () => {
      const didReload = await refreshPwaBundleIfNeeded();
      if (didReload) return;

      // Initialize authentication
      initialize();

      // Populate database with fake data on first load
      seedDatabase();

      // Service Worker is now auto-registered by vite-plugin-pwa
      console.log('[App] PWA initialized - Service Worker auto-registered');
    })();
  }, [initialize]);

  // Update navigate function
  useEffect(() => {
    navigateFn = (page: Page) => setCurrentPage(page);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && currentPage !== 'login' && currentPage !== 'signup') {
      setCurrentPage('login');
    }
  }, [isAuthenticated, isLoading, currentPage]);


  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <Login />;
      case 'signup':
        return <Signup />;
      case 'clients':
        return <Clients onViewDetails={handleOpenClientDetails} />;
      case 'epargne':
        return <ComptesEpargne onViewDetails={handleOpenEpargneDetails} />;
      case 'credit':
        return <ComptesCredit onViewDetails={handleOpenCreditDetails} />;
      case 'client_details':
        return selectedClientId ? (
          <ClientDetails
            clientId={selectedClientId}
            onBack={() => handleSetPage('clients')}
            onOpenEpargneDetails={handleOpenEpargneDetails}
            onOpenCreditDetails={handleOpenCreditDetails}
          />
        ) : (
          <div className="p-4 sm:p-6 text-gray-700">Client introuvable.</div>
        );
      case 'epargne_details':
        return selectedEpargneId ? (
          <CompteEpargneDetails
            compteId={selectedEpargneId}
            onBack={() => handleSetPage('epargne')}
            onOpenCreditDetails={handleOpenCreditDetails}
          />
        ) : (
          <div className="p-4 sm:p-6 text-gray-700">Compte epargne introuvable.</div>
        );
      case 'credit_details':
        return selectedCreditId ? (
          <CompteCreditDetails
            compteId={selectedCreditId}
            onBack={() => handleSetPage('credit')}
          />
        ) : (
          <div className="p-4 sm:p-6 text-gray-700">Compte credit introuvable.</div>
        );
      case 'parametres':
        return <Parametres />;
      // TODO: Implement other pages
      case 'dashboard':
      case 'recouvrement':
      case 'rapports':
      default:
        return <div className="p-4 sm:p-6 text-gray-700">Page '{currentPage}' coming soon.</div>;
    }
  };

  const handleSetPage = useCallback((page: Page) => {
    setCurrentPage(page);
    setSidebarOpen(false); // Close sidebar on navigation
  }, []);

  const handleOpenClientDetails = useCallback((clientId: string) => {
    const safeClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!safeClientId) {
      console.warn('[App] Invalid client ID for details', clientId);
      return;
    }
    setSelectedClientId(safeClientId);
    setCurrentPage('client_details');
    setSidebarOpen(false);
  }, []);

  const handleOpenEpargneDetails = useCallback((compteId: string) => {
    const safeCompteId = typeof compteId === 'string' ? compteId.trim() : '';
    if (!safeCompteId) {
      console.warn('[App] Invalid epargne account ID for details', compteId);
      return;
    }
    setSelectedEpargneId(safeCompteId);
    setCurrentPage('epargne_details');
    setSidebarOpen(false);
  }, []);

  const handleOpenCreditDetails = useCallback((compteId: string) => {
    const safeCompteId = typeof compteId === 'string' ? compteId.trim() : '';
    if (!safeCompteId) {
      console.warn('[App] Invalid credit account ID for details', compteId);
      return;
    }
    setSelectedCreditId(safeCompteId);
    setCurrentPage('credit_details');
    setSidebarOpen(false);
  }, []);

  const currentNavPage: NavPage = useMemo(() => {
    if (currentPage === 'client_details') return 'clients';
    if (currentPage === 'epargne_details') return 'epargne';
    if (currentPage === 'credit_details') return 'credit';
    if (currentPage === 'dashboard' || currentPage === 'clients' || currentPage === 'epargne' || currentPage === 'credit' || currentPage === 'recouvrement' || currentPage === 'rapports' || currentPage === 'parametres') {
      return currentPage;
    }
    return 'clients';
  }, [currentPage]);


  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg
            className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="text-gray-600 text-lg font-medium">Chargement...</p>
        </div>
      </div>
    );
  }

  // Show login/signup page if not authenticated
  if (!isAuthenticated && (currentPage === 'login' || currentPage === 'signup')) {
    return (
      <ErrorBoundary>
        <ModalProvider>
          <Toaster position="top-center" toastOptions={{ className: 'text-sm' }} />
          {currentPage === 'login' ? <Login /> : <Signup />}
          <ModalRoot />
        </ModalProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ModalProvider>
        <Toaster position="top-center" toastOptions={{ className: 'text-sm' }} />
        <div className="flex flex-col h-screen bg-gray-100 font-sans md:flex-row">
          <Sidebar currentPage={currentNavPage} setCurrentPage={handleSetPage} isOpen={isSidebarOpen} setOpen={setSidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <Header toggleSidebar={() => setSidebarOpen(prev => !prev)} />
            <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 pb-20 md:pb-4">
              <div className="px-3 py-3 sm:px-4 sm:py-4 md:container md:mx-auto md:px-6">
                {renderPage()}
              </div>
            </main>
          </div>
          <MobileNav currentPage={currentNavPage} setCurrentPage={handleSetPage} />
        </div>
        <ModalRoot />
        <OfflineIndicator />
      </ModalProvider>
    </ErrorBoundary>
  );
};

export default App;
