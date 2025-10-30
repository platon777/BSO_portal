import React from 'react';
import Modal from '../common/Modal';

export interface SyncProgressModalProps {
  isOpen: boolean;
  title: string;
  currentStep: number;
  totalSteps: number;
  currentMessage: string;
  errors: string[];
  onCancel?: () => void;
  canCancel?: boolean;
}

const SyncProgressModal: React.FC<SyncProgressModalProps> = ({
  isOpen,
  title,
  currentStep,
  totalSteps,
  currentMessage,
  errors,
  onCancel,
  canCancel = false,
}) => {
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title={title}>
      <div className="space-y-6">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progression</span>
            <span className="text-sm font-medium text-gray-700">
              {currentStep} / {totalSteps}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-gray-600 text-center">
            {Math.round(progress)}%
          </div>
        </div>

        {/* Current Message */}
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
          <div className="flex items-center">
            <svg
              className="animate-spin h-5 w-5 text-blue-600 mr-3"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p className="text-sm font-medium text-blue-800">{currentMessage}</p>
          </div>
        </div>

        {/* Errors Section */}
        {errors.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded max-h-40 overflow-y-auto">
            <h4 className="text-sm font-semibold text-red-800 mb-2">
              Erreurs ({errors.length})
            </h4>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error, index) => (
                <li key={index} className="text-xs text-red-700">
                  {error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cancel Button */}
        {canCancel && onCancel && (
          <div className="flex justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition"
            >
              Annuler
            </button>
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-gray-500 text-center">
          Veuillez ne pas fermer cette fenêtre pendant la synchronisation
        </p>
      </div>
    </Modal>
  );
};

export default SyncProgressModal;
