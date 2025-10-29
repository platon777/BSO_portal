
import React from 'react';
import { HomeIcon, UsersIcon, PiggyBankIcon, CreditCardIcon, LandmarkIcon, SettingsIcon, FileTextIcon, RepeatIcon } from '../icons/Icons';

type Page = 'dashboard' | 'clients' | 'epargne' | 'credit' | 'recouvrement' | 'rapports' | 'parametres';

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
}

const NavItem: React.FC<{
  page: Page;
  label: string;
  icon: React.ReactNode;
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
}> = ({ page, label, icon, currentPage, setCurrentPage }) => {
  const isActive = currentPage === page;
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        setCurrentPage(page);
      }}
      className={`flex items-center px-4 py-3 text-sm font-medium transition-colors duration-150 ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'text-gray-200 hover:bg-blue-800 hover:text-white'
      }`}
    >
      {icon}
      <span className="ml-4">{label}</span>
    </a>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, isOpen, setOpen }) => {
  const navItems = [
    { page: 'dashboard', label: 'Tableau de bord', icon: <HomeIcon /> },
    { page: 'clients', label: 'Clients', icon: <UsersIcon /> },
    { page: 'epargne', label: 'Épargne', icon: <PiggyBankIcon /> },
    { page: 'credit', label: 'Crédit', icon: <CreditCardIcon /> },
    { page: 'recouvrement', label: 'Recouvrement', icon: <RepeatIcon /> },
    { page: 'rapports', label: 'Rapports', icon: <FileTextIcon /> },
  ];

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black opacity-50 lg:hidden"
          onClick={() => setOpen(false)}
        ></div>
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex-shrink-0 overflow-y-auto bg-blue-900 text-white transform lg:relative lg:translate-x-0 ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out`}
      >
        <div className="py-4">
          <div className="flex items-center justify-center text-lg font-bold">
            <LandmarkIcon className="w-8 h-8 mr-2" />
            <span>BSO Portal</span>
          </div>
          <nav className="mt-8">
            <ul>
              {navItems.map((item) => (
                <li key={item.page}>
                  <NavItem
                    page={item.page as Page}
                    label={item.label}
                    icon={item.icon}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
