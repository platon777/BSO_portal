/**
 * Cache Helper - Force caching of critical assets
 */

export const forceCacheAssets = async () => {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Cache] Service Worker not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    if (!registration.active) {
      console.warn('[Cache] No active service worker');
      return;
    }

    // Get all script and link tags
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(
      (script: any) => script.src
    );
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
      (link: any) => link.href
    );

    const urls = [...scripts, ...styles, window.location.href];

    // Send message to service worker to cache these URLs
    registration.active.postMessage({
      type: 'CACHE_URLS',
      urls: urls,
    });

    console.log('[Cache] Requested caching of', urls.length, 'assets');
  } catch (error) {
    console.error('[Cache] Failed to force cache:', error);
  }
};

/**
 * Check if we're offline and show appropriate UI
 */
export const checkOfflineStatus = (): boolean => {
  return !navigator.onLine;
};

/**
 * Wait for service worker to be ready
 */
export const waitForServiceWorker = async (timeoutMs = 10000): Promise<boolean> => {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );

    const ready = navigator.serviceWorker.ready;

    await Promise.race([ready, timeout]);
    return true;
  } catch {
    return false;
  }
};
