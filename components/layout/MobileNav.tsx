
import React from 'react';
import { UsersIcon, PiggyBankIcon, CreditCardIcon, SettingsIcon } from '../icons/Icons';

type Page = 'dashboard' | 'clients' | 'epargne' | 'credit' | 'recouvrement' | 'rapports' | 'parametres';

interface MobileNavProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
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
      className={`flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs sm:text-sm transition-colors duration-200 ${
        isActive ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
      }`}
    >
      {icon}
      <span className="mt-1">{label}</span>
    </a>
  );
};

const MobileNav: React.FC<MobileNavProps> = ({ currentPage, setCurrentPage }) => {
  const navItems = [
    { page: 'clients', label: 'Clients', icon: <UsersIcon className="w-6 h-6"/> },
    { page: 'epargne', label: 'Épargne', icon: <PiggyBankIcon className="w-6 h-6"/> },
    { page: 'credit', label: 'Crédit', icon: <CreditCardIcon className="w-6 h-6"/> },
    { page: 'parametres', label: 'Paramètres', icon: <SettingsIcon className="w-6 h-6"/> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-gray-200 shadow-lg">
      <div className="flex justify-around">
        {navItems.map((item) => (
          <NavItem
            key={item.page}
            page={item.page as Page}
            label={item.label}
            icon={item.icon}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
          />
        ))}
      </div>
    </nav>
  );
};

export default MobileNav;
