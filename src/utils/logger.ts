/**
 * Logger utility for production-safe logging
 * Automatically disabled in production unless explicitly enabled
 */

const IS_PROD = import.meta.env.PROD;
const FORCE_LOG = import.meta.env.VITE_ENABLE_LOGS === 'true';

// Enable logging in development or if explicitly enabled
const LOGGING_ENABLED = !IS_PROD || FORCE_LOG;

/**
 * Log info message (only in development)
 */
export function logInfo(message: string, ...args: any[]) {
  if (LOGGING_ENABLED) {
    console.log(`[INFO] ${message}`, ...args);
  }
}

/**
 * Log success message (only in development)
 */
export function logSuccess(message: string, ...args: any[]) {
  if (LOGGING_ENABLED) {
    console.log(`[SUCCESS] ${message}`, ...args);
  }
}

/**
 * Log warning (always shown but formatted)
 */
export function logWarning(message: string, ...args: any[]) {
  if (LOGGING_ENABLED) {
    console.warn(`[WARNING] ${message}`, ...args);
  }
}

/**
 * Log error (always shown)
 */
export function logError(message: string, ...args: any[]) {
  console.error(`[ERROR] ${message}`, ...args);
}

/**
 * Log debug info (only in development)
 */
export function logDebug(message: string, ...args: any[]) {
  if (LOGGING_ENABLED) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

/**
 * Performance timing logger
 */
export function logPerformance(label: string, startTime: number) {
  if (LOGGING_ENABLED) {
    const duration = Date.now() - startTime;
    console.log(`[PERF] ${label}: ${duration}ms`);
  }
}

/**
 * Group logs together
 */
export function logGroup(title: string, callback: () => void) {
  if (LOGGING_ENABLED) {
    console.group(title);
    callback();
    console.groupEnd();
  }
}

export default {
  info: logInfo,
  success: logSuccess,
  warning: logWarning,
  error: logError,
  debug: logDebug,
  performance: logPerformance,
  group: logGroup,
};
