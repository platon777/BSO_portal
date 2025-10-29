
import React from 'react';
import { useModal } from '../../contexts/ModalContext';
import Modal from './Modal';

const ModalRoot: React.FC = () => {
  const { modalState, hideModal } = useModal();

  if (!modalState.isOpen) {
    return null;
  }

  return (
    <Modal title={modalState.title} onClose={hideModal}>
      {modalState.content}
    </Modal>
  );
};

export default ModalRoot;
