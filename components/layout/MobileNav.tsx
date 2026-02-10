
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
      className={`flex flex-col items-center justify-center flex-1 min-h-[56px] py-1 text-xs transition-colors duration-200 relative ${
        isActive ? 'text-blue-600' : 'text-gray-500 active:text-blue-600'
      }`}
    >
      {isActive && (
        <div className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-blue-600 rounded-full" />
      )}
      <span className={isActive ? 'scale-110 transition-transform' : 'transition-transform'}>
        {icon}
      </span>
      <span className="mt-0.5 font-medium">{label}</span>
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-gray-200 shadow-lg pb-safe">
      <div className="flex justify-around items-stretch">
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
