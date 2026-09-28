import React, { useState } from 'react';
import { requestSelfPasswordReset } from '../../services/passwordResetService';
import toast from 'react-hot-toast';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      toast.error('Veuillez saisir une adresse email valide.');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Envoi de la demande en cours...');

    try {
      const res = await requestSelfPasswordReset(email);
      if (!res.success) {
        throw new Error(res.error || 'Erreur lors de la demande.');
      }

      setSubmitted(true);
      toast.success('Demande envoyée ! Vérifiez vos emails.', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Impossible d envoyer la demande.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-800">Mot de passe oublié</h3>
            <p className="text-xs text-gray-500 mt-1">
              Récupérez l'accès à votre compte BSO Portal
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
          >
            &times;
          </button>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 space-y-2">
              <p className="font-semibold">Email envoyé avec succès !</p>
              <p className="text-xs">
                Si un compte correspond à <strong>{email}</strong>, un lien de réinitialisation y a été envoyé.
                Pensez à vérifier votre dossier de courrier indésirable (spams).
              </p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              💡 <strong>Astuce :</strong> Vous pouvez également demander à votre administrateur de vous envoyer un lien direct via WhatsApp ou SMS.
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow transition min-h-[44px]"
            >
              Retour à la connexion
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              Saisissez l'adresse email associée à votre compte BSO pour recevoir les instructions de réinitialisation.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Adresse Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre.email@exemple.com"
                disabled={loading}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded text-xs text-yellow-800">
              Si vous n'avez pas accès à votre boîte email, votre administrateur peut vous générer un lien direct depuis les <strong>Paramètres</strong> du portail.
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow transition disabled:bg-gray-400 min-h-[44px] flex items-center justify-center"
              >
                {loading ? 'Envoi...' : 'Envoyer le lien'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
