import React, { useState } from 'react';
import { updateUserPassword } from '../../services/passwordResetService';
import toast from 'react-hot-toast';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose?: () => void;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password || password.length < 6) {
      setError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Mise à jour du mot de passe...');

    try {
      const res = await updateUserPassword(password);
      if (!res.success) {
        throw new Error(res.error || 'Erreur lors de la mise à jour.');
      }

      toast.success('Votre mot de passe a été modifié avec succès !', { id: toastId });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Erreur lors du changement de mot de passe.');
      toast.error(err.message || 'Erreur lors du changement de mot de passe.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
            🔒
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
            Nouveau Mot de Passe
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Définissez votre nouveau mot de passe pour accéder à votre compte BSO Portal.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Au moins 6 caractères"
                disabled={loading}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-1 py-0.5"
              >
                {showPassword ? 'Masquer' : 'Voir'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Confirmer le mot de passe
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Répétez le mot de passe"
              disabled={loading}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow transition disabled:bg-gray-400 min-h-[44px] flex items-center justify-center"
          >
            {loading ? 'Enregistrement...' : 'Enregistrer le nouveau mot de passe'}
          </button>
        </form>

        {onClose && (
          <div className="text-center pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordModal;
