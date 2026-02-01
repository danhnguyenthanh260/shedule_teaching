/**
 * Error Handler - Sanitize error messages for production
 * Prevents leaking sensitive information to users
 */

const IS_DEV = import.meta.env.DEV;

/**
 * Sanitize error message for safe display to users
 * In development: show full error for debugging
 * In production: show generic user-friendly messages
 */
export function sanitizeError(error: any): string {
  // Development: show full error details
  if (IS_DEV) {
    return error?.message || String(error);
  }
  
  // Production: sanitize and show user-friendly messages
  const errorMsg = error?.message?.toLowerCase() || '';
  
  // Authentication errors
  if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
    return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
  }
  
  // Permission errors
  if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
    return 'Bạn không có quyền truy cập. Vui lòng kiểm tra lại.';
  }
  
  // Not found errors
  if (errorMsg.includes('404') || errorMsg.includes('not found')) {
    return 'Không tìm thấy dữ liệu. Vui lòng kiểm tra lại.';
  }
  
  // Network errors
  if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('connection')) {
    return 'Lỗi kết nối. Vui lòng kiểm tra internet và thử lại.';
  }
  
  // Rate limit errors
  if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
    return 'Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng thử lại sau.';
  }
  
  // Timeout errors
  if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
    return 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.';
  }
  
  // Firebase errors
  if (errorMsg.includes('firebase')) {
    return 'Lỗi hệ thống. Vui lòng thử lại sau.';
  }
  
  // Generic error
  return 'Đã xảy ra lỗi. Vui lòng thử lại sau.';
}

/**
 * Log error internally (for debugging) and return sanitized message for user
 */
export function handleError(error: any, context?: string): string {
  // Log full error for debugging (only in dev or server logs)
  if (IS_DEV) {
    console.error(`[Error Handler] ${context || 'Unknown context'}:`, error);
  }
  
  // Return sanitized message
  return sanitizeError(error);
}

/**
 * Check if error is network-related
 */
export function isNetworkError(error: any): boolean {
  const errorMsg = error?.message?.toLowerCase() || '';
  return errorMsg.includes('network') || 
         errorMsg.includes('fetch') || 
         errorMsg.includes('connection') ||
         errorMsg.includes('timeout');
}

/**
 * Check if error is authentication-related
 */
export function isAuthError(error: any): boolean {
  const errorMsg = error?.message?.toLowerCase() || '';
  return errorMsg.includes('401') || 
         errorMsg.includes('403') ||
         errorMsg.includes('unauthorized') ||
         errorMsg.includes('forbidden');
}

/**
 * Format error for toast notification
 */
export function formatErrorForToast(error: any): string {
  return `❌ ${sanitizeError(error)}`;
}
