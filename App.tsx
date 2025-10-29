
import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/layout/Sidebar';
import MobileNav from './components/layout/MobileNav';
import Header from './components/layout/Header';
import Clients from './pages/Clients';
import ComptesEpargne from './pages/ComptesEpargne';
import ComptesCredit from './pages/ComptesCredit';
import Parametres from './pages/Parametres';
import { ModalProvider } from './contexts/ModalContext';
import { db, seedDatabase } from './services/database';
import ModalRoot from './components/common/ModalRoot';

type Page = 'dashboard' | 'clients' | 'epargne' | 'credit' | 'recouvrement' | 'rapports' | 'parametres';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('clients');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Populate database with fake data on first load
    seedDatabase();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swUrl = `${window.location.origin}/sw.js`;
        navigator.serviceWorker.register(swUrl)
          .then((registration) => {
            console.log('Service Worker successfully registered with scope:', registration.scope);
          })
          .catch((error) => {
            console.error('Service Worker registration failed:', error);
          });
      });
    }
  }, []);


  const renderPage = () => {
    switch (currentPage) {
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


  return (
    <ModalProvider>
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
    </ModalProvider>
  );
};

export default App;