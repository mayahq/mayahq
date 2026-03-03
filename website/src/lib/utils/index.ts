// Error types to categorize errors for better handling
export const ErrorTypes = {
  RATE_LIMIT: 'RATE_LIMIT',
  AUTH: 'AUTH',
  CONTEXT_LENGTH: 'CONTEXT_LENGTH',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  VALIDATION: 'VALIDATION',
  UNKNOWN: 'UNKNOWN',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED'
};

/**
 * Utility to identify error type from error message
 * @param {Error} error - The error to analyze
 * @returns {string} The error type
 */
export function identifyErrorType(error: any): string {
  const message = error?.message?.toLowerCase() || '';
  
  if (message.includes('exceeded your current quota') || message.includes('billing') || 
      message.includes('exceeded your quota')) {
    return ErrorTypes.QUOTA_EXCEEDED;
  }
  
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return ErrorTypes.RATE_LIMIT;
  }
  
  if (message.includes('auth') || message.includes('key') || 
      message.includes('credentials') || message.includes('permission')) {
    return ErrorTypes.AUTH;
  }
  
  if (message.includes('context') || message.includes('token') || 
      message.includes('length') || message.includes('too long')) {
    return ErrorTypes.CONTEXT_LENGTH;
  }
  
  if (message.includes('unavailable') || message.includes('down') || 
      message.includes('connectivity') || message.includes('timeout')) {
    return ErrorTypes.SERVICE_UNAVAILABLE;
  }
  
  if (message.includes('invalid') || message.includes('validation') || 
      message.includes('format') || message.includes('schema')) {
    return ErrorTypes.VALIDATION;
  }
  
  return ErrorTypes.UNKNOWN;
} 