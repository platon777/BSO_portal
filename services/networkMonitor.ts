/**
 * Network monitoring and retry logic with exponential backoff
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  timeout: number; // milliseconds
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000, // 8 seconds
  timeout: 30000, // 30 seconds
};

/**
 * Calculate delay for exponential backoff
 */
export const calculateBackoffDelay = (retryCount: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number => {
  const delay = config.baseDelay * Math.pow(2, retryCount);
  return Math.min(delay, config.maxDelay);
};

/**
 * Sleep/delay function
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Execute function with retry logic and exponential backoff
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: any) => void
): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Execute with timeout
      const result = await executeWithTimeout(fn, config.timeout);
      return result;
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoffDelay(attempt, config);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
};

/**
 * Execute a promise with timeout
 */
export const executeWithTimeout = <T>(
  promise: Promise<T> | (() => Promise<T>),
  timeoutMs: number
): Promise<T> => {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const actualPromise = typeof promise === 'function' ? promise() : promise;

  return Promise.race([actualPromise, timeoutPromise]);
};

/**
 * Check if error should not be retried
 */
export const isNonRetryableError = (error: any): boolean => {
  // Don't retry on authentication errors
  if (error?.status === 401 || error?.status === 403) {
    return true;
  }

  // Don't retry on validation errors
  if (error?.status === 400 || error?.status === 422) {
    return true;
  }

  // Don't retry on not found (for deletes)
  if (error?.status === 404 && error?.method === 'DELETE') {
    return true;
  }

  return false;
};

/**
 * Check if we're online
 */
export const isOnline = (): boolean => {
  return navigator.onLine;
};

/**
 * Wait for online status
 */
export const waitForOnline = (timeoutMs: number = 60000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (navigator.onLine) {
      resolve(true);
      return;
    }

    const timeout = setTimeout(() => {
      window.removeEventListener('online', onlineHandler);
      resolve(false);
    }, timeoutMs);

    const onlineHandler = () => {
      clearTimeout(timeout);
      window.removeEventListener('online', onlineHandler);
      resolve(true);
    };

    window.addEventListener('online', onlineHandler);
  });
};

/**
 * Batch array into chunks
 */
export const batchArray = <T>(array: T[], batchSize: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
};
