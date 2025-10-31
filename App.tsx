
import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/layout/MobileNav';
import Header from './components/layout/Header';
import Clients from './pages/Clients';
import ComptesEpargne from './pages/ComptesEpargne';
import ComptesCredit from './pages/ComptesCredit';
import Parametres from './pages/Parametres';
import Login from './pages/Login';
import { ModalProvider } from './contexts/ModalContext';
import { db, seedDatabase } from './services/database';
import ModalRoot from './components/common/ModalRoot';
import OfflineIndicator from './components/common/OfflineIndicator';
import CacheDiagnostic from './components/common/CacheDiagnostic';
import { useAuthStore } from './stores/authStore';
import { Toaster } from 'react-hot-toast';

type Page = 'dashboard' | 'clients' | 'epargne' | 'credit' | 'recouvrement' | 'rapports' | 'parametres' | 'login';

// Export a simple navigation hook for use in child components
let navigateFn: ((page: Page) => void) | null = null;

export const useNavigate = () => {
  return navigateFn || (() => {});
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('clients');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    // Initialize authentication
    initialize();

    // Populate database with fake data on first load
    seedDatabase();

    // Service Worker is now auto-registered by vite-plugin-pwa
    console.log('[App] PWA initialized - Service Worker auto-registered');
  }, [initialize]);

  // Update navigate function
  useEffect(() => {
    navigateFn = (page: Page) => setCurrentPage(page);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && currentPage !== 'login') {
      setCurrentPage('login');
    }
  }, [isAuthenticated, isLoading, currentPage]);


  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <Login />;
      case 'clients':
        return <Clients />;
      case 'epargne':
        return <ComptesEpargne />;
      case 'credit':
        return <ComptesCredit />;
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

  // Show login page if not authenticated
  if (!isAuthenticated && currentPage !== 'login') {
    return (
      <ModalProvider>
        <Toaster position="top-right" />
        <Login />
        <ModalRoot />
      </ModalProvider>
    );
  }

  return (
    <ModalProvider>
      <Toaster position="top-right" />
      <div className="flex h-screen bg-gray-100 font-sans">
        <Sidebar currentPage={currentPage} setCurrentPage={handleSetPage} isOpen={isSidebarOpen} setOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header toggleSidebar={() => setSidebarOpen(prev => !prev)} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 pb-20 md:pb-4">
            <div className="container mx-auto px-4 sm:px-6 py-4">
              {renderPage()}
            </div>
          </main>
        </div>
        <MobileNav currentPage={currentPage} setCurrentPage={handleSetPage} />
      </div>
      <ModalRoot />
      <OfflineIndicator />
      <CacheDiagnostic />
    </ModalProvider>
  );
};

export default App;