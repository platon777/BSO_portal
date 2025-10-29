
import React, { createContext, useState, useContext, ReactNode } from 'react';

interface ModalState {
  content: ReactNode | null;
  title: string;
  isOpen: boolean;
}

interface ModalContextType {
  modalState: ModalState;
  showModal: (title: string, content: ReactNode) => void;
  hideModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<ModalState>({
    content: null,
    title: '',
    isOpen: false,
  });

  const showModal = (title: string, content: ReactNode) => {
    setModalState({ content, title, isOpen: true });
  };

  const hideModal = () => {
    setModalState({ content: null, title: '', isOpen: false });
  };

  return (
    <ModalContext.Provider value={{ modalState, showModal, hideModal }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
