/**
 * Device Fingerprinting Service
 * Génère un fingerprint unique basé sur les caractéristiques de l'appareil
 */

export interface DeviceInfo {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  timezone: string;
  language: string;
  platform: string;
}

/**
 * Collecte les informations de l'appareil
 */
export const getDeviceInfo = (): DeviceInfo => {
  return {
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
  };
};

/**
 * Fonction de hachage simple (djb2)
 */
const hashString = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash.toString(36);
};

/**
 * Génère un fingerprint d'appareil unique
 */
export const generateDeviceFingerprint = (): string => {
  const info = getDeviceInfo();
  const fingerprintData = [
    info.userAgent,
    `${info.screenWidth}x${info.screenHeight}`,
    info.timezone,
    info.language,
    info.platform,
  ].join('|');

  return hashString(fingerprintData);
};

/**
 * Retourne un nom d'appareil lisible
 */
export const getDeviceName = (): string => {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('mobile') || userAgent.includes('android')) {
    return 'Mobile';
  } else if (userAgent.includes('tablet') || userAgent.includes('ipad')) {
    return 'Tablette';
  } else {
    return 'Ordinateur';
  }
};
