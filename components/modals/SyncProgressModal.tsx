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
    <Modal isOpen={isOpen} onClose={canCancel && onCancel ? onCancel : () => {}} title={title}>
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
          <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded max-h-60 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-red-800 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                Erreurs Détaillées ({errors.length})
              </h4>
              <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                {errors.length} échec{errors.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {errors.map((error, index) => (
                <div key={index} className="bg-white border border-red-200 rounded p-2">
                  <div className="flex items-start">
                    <span className="text-red-600 font-mono text-xs mr-2 mt-0.5">#{index + 1}</span>
                    <p className="text-xs text-red-700 flex-1 break-words font-mono leading-relaxed">
                      {error}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-red-200">
              <p className="text-xs text-red-600 italic">
                💡 Astuce : Ces éléments seront automatiquement réessayés lors de la prochaine synchronisation.
              </p>
            </div>
          </div>
        )}

        {/* Cancel/Close Button */}
        {onCancel && (
          <div className="flex justify-end">
            <button
              onClick={onCancel}
              className={`px-4 py-2 text-white rounded-md transition ${
                canCancel
                  ? 'bg-gray-600 hover:bg-gray-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {canCancel ? 'Annuler' : 'Fermer'}
            </button>
          </div>
        )}

        {/* Info */}
        {!canCancel && currentStep < totalSteps && (
          <p className="text-xs text-gray-500 text-center">
            Veuillez ne pas fermer cette fenêtre pendant la synchronisation
          </p>
        )}
      </div>
    </Modal>
  );
};

export default SyncProgressModal;
