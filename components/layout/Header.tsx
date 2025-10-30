import React from 'react';
import { LogOutIcon, MenuIcon } from '../icons/Icons';
import useOnlineStatus from '../../hooks/useOnlineStatus';
import OnlineStatusIndicator from '../common/OnlineStatusIndicator';
import { useAuthStore } from '../../stores/authStore';

interface HeaderProps {
    toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const isOnline = useOnlineStatus();
  const { profile, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    window.location.reload(); // Force reload to reset app state
  };

  const displayName = profile?.firstname || profile?.email || 'Utilisateur';

  return (
    <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm">
      <button
        className="text-gray-500 focus:outline-none lg:hidden"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <MenuIcon className="w-6 h-6" />
      </button>
      <div className="flex-1"></div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
            <OnlineStatusIndicator isOnline={isOnline} />
            <span className="text-gray-700 font-medium hidden sm:block">{displayName}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          <LogOutIcon className="w-4 h-4 mr-2" />
          Logout
        </button>
      </div>
    </header>
  );
};

export default Header;