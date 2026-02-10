import React from 'react';
import { PlusIcon } from '../icons/Icons';

interface FABProps {
  onClick: () => void;
  label?: string;
}

const FAB: React.FC<FABProps> = ({ onClick, label }) => (
  <button
    onClick={onClick}
    className="fixed right-4 bottom-20 z-50 md:hidden w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center active:bg-blue-700 active:scale-95 transition-transform"
    aria-label={label || 'Ajouter'}
  >
    <PlusIcon className="w-6 h-6" />
  </button>
);

export default FAB;
