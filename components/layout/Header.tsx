import React from 'react';
import { LogOutIcon, MenuIcon } from '../icons/Icons';
import useOnlineStatus from '../../hooks/useOnlineStatus';
import OnlineStatusIndicator from '../common/OnlineStatusIndicator';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from '../../App';

interface HeaderProps {
    toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const isOnline = useOnlineStatus();
  const { logout, profile } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('login');
  };

  return (
    <header className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-white border-b border-gray-200 shadow-sm">
      <button
        className="p-2 -ml-1 text-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <MenuIcon className="w-6 h-6" />
      </button>
      <div className="flex-1 px-2 lg:px-0">
        <span className="text-sm font-bold text-blue-900 lg:hidden">BSO</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <OnlineStatusIndicator isOnline={isOnline} />
        <span className="text-gray-700 font-medium text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">
          {profile ? `${profile.firstname}` : ''}
        </span>
        <button
          onClick={handleLogout}
          className="flex items-center justify-center p-2 sm:px-3 sm:py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors min-h-[44px] min-w-[44px]"
        >
          <LogOutIcon className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
    </header>
  );
};

export default Header;