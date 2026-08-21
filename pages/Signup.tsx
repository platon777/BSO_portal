import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from '../App';
import { validateInvitationCode, ValidateCodeResult } from '../services/invitationService';
import toast from 'react-hot-toast';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<ValidateCodeResult | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register, isAuthenticated, isOffline } = useAuthStore();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('clients');
    }
  }, [isAuthenticated, navigate]);

  // Validation dynamique du code d'invitation avec debounce
  useEffect(() => {
    const cleanCode = invitationCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 5) {
      setCodeStatus(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidatingCode(true);
      const res = await validateInvitationCode(cleanCode);
      setCodeStatus(res);
      setIsValidatingCode(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [invitationCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const cleanCode = invitationCode.trim().toUpperCase();

    // Validation
    if (!cleanCode) {
      setError('Le code d invitation BSO est obligatoire pour créer un compte.');
      toast.error('Le code d invitation BSO est obligatoire.');
      setIsLoading(false);
      return;
    }

    if (!email || !password || !confirmPassword || !firstname || !lastname) {
      setError('Veuillez remplir tous les champs obligatoires.');
      setIsLoading(false);
      return;
    }

    if (!email.includes('@')) {
      setError('Adresse email invalide.');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      setIsLoading(false);
      return;
    }

    // Attempt registration
    const result = await register(email.trim(), password, firstname.trim(), lastname.trim(), cleanCode);

    if (!result.success) {
      setError(result.error || 'Échec de la création du compte');
      toast.error(result.error || 'Échec de la création du compte');
      setIsLoading(false);
      return;
    }

    // Success - will be redirected by useEffect
    toast.success('Compte créé avec succès ! Bienvenue sur BSO Portal.');
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">BSO Portal</h1>
          <p className="text-sm text-gray-600">Inscription réservée aux agents & staff autorisés</p>
        </div>

        {/* Offline Warning */}
        {isOffline && (
          <div className="mb-5 p-3.5 bg-yellow-50 border-l-4 border-yellow-400 rounded-r text-xs sm:text-sm text-yellow-800">
            Mode hors ligne — Inscription impossible sans connexion Internet.
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border-l-4 border-red-500 rounded-r text-xs sm:text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invitation Code (Mandatory) */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="invitationCode" className="block text-xs font-bold text-blue-900 uppercase tracking-wider">
                Code d'invitation BSO *
              </label>
              {isValidatingCode && (
                <span className="text-[11px] text-blue-600 animate-pulse">Vérification…</span>
              )}
            </div>
            <input
              id="invitationCode"
              type="text"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2.5 bg-white border border-blue-300 rounded-lg font-mono text-base font-bold tracking-widest text-center text-blue-900 placeholder:text-gray-400 placeholder:font-normal placeholder:tracking-normal focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase"
              placeholder="BSO-XXXX-XXXX"
              required
              disabled={isLoading || isOffline}
              autoFocus
            />

            {/* Validation Feedback */}
            {codeStatus && (
              <div
                className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                  codeStatus.valid
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-red-100 text-red-900 border border-red-300'
                }`}
              >
                <span>{codeStatus.valid ? '✔' : '❌'}</span>
                <span>{codeStatus.message}</span>
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              Ce code unique vous a été transmis par votre Administrateur ou Manager BSO.
            </p>
          </div>

          {/* First Name & Last Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstname" className="block text-xs font-semibold text-gray-700 mb-1">
                Prénom *
              </label>
              <input
                id="firstname"
                type="text"
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Jean"
                required
                disabled={isLoading || isOffline}
              />
            </div>
            <div>
              <label htmlFor="lastname" className="block text-xs font-semibold text-gray-700 mb-1">
                Nom *
              </label>
              <input
                id="lastname"
                type="text"
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Dupont"
                required
                disabled={isLoading || isOffline}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-gray-700 mb-1">
              Adresse Email *
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="agent.nom@exemple.com"
              required
              disabled={isLoading || isOffline}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-gray-700 mb-1">
              Mot de passe * (min. 6 caractères)
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none pr-10"
                placeholder="••••••••"
                required
                disabled={isLoading || isOffline}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-semibold text-gray-700 mb-1">
              Confirmer le mot de passe *
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none pr-10"
                placeholder="••••••••"
                required
                disabled={isLoading || isOffline}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                tabIndex={-1}
              >
                {showConfirmPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || isOffline || (codeStatus !== null && !codeStatus.valid)}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <span>Création du compte en cours…</span>
            ) : (
              <span>Créer mon compte</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center space-y-2 border-t pt-4">
          <p className="text-xs text-gray-600">
            Vous avez déjà un compte ?{' '}
            <button
              onClick={() => navigate('login')}
              className="text-blue-600 hover:text-blue-700 font-bold"
            >
              Se connecter
            </button>
          </p>
          <p className="text-[11px] text-gray-400">
            Pour obtenir un code d'invitation, contactez votre administrateur BSO.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
