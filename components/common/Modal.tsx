
import React, { ReactNode } from 'react';
import { XIcon } from '../icons/Icons';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  isOpen: boolean;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children, isOpen }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center md:p-4"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] md:max-h-[90vh] rounded-t-2xl md:rounded-lg shadow-xl flex flex-col animate-slide-up md:animate-fade-in md:w-auto md:min-w-[400px] md:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle - mobile only */}
        <div className="flex justify-center pt-2 pb-1 md:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex justify-between items-center px-4 py-3 md:p-4 border-b shrink-0">
          <h2 id="modal-title" className="text-lg md:text-xl font-bold text-gray-800 truncate pr-2">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Fermer"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="px-4 py-4 md:p-6 overflow-y-auto flex-1">
            {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
