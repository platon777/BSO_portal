import React, { useEffect, useRef } from 'react';

interface SecureWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * SecureWrapper - Applique des mesures de prévention soft des screenshots
 * - Désactive la sélection de texte
 * - Bloque le menu contextuel clic-droit
 * - Ajoute la classe CSS secure-content
 */
const SecureWrapper: React.FC<SecureWrapperProps> = ({ children, className = '' }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    element.addEventListener('contextmenu', handleContextMenu);
    return () => element.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  return (
    <div ref={wrapperRef} className={`secure-content ${className}`} data-secure="true">
      {children}
    </div>
  );
};

export default SecureWrapper;
