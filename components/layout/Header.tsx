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
            <span className="text-gray-700 font-medium hidden sm:block">
              {profile ? `${profile.firstname} ${profile.name}` : 'Utilisateur'}
            </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          <LogOutIcon className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Déconnexion</span>
          <span className="sm:hidden">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Header;