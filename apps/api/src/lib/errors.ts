export interface HumanError {
  code: string;
  message: string;
  action?: string;
}

const ERROR_MAP: Record<string, HumanError> = {
  'DATABASE_CONNECTION_FAILED': {
    code: 'DATABASE_CONNECTION_FAILED',
    message: 'Database connection failed.',
    action: 'Check your DATABASE_URL environment variable is correct.'
  },
  'JWT_SECRET_MISSING': {
    code: 'JWT_SECRET_MISSING',
    message: 'JWT secret is not configured.',
    action: 'Set SESSION_SECRET in your environment variables (32+ characters recommended).'
  },
  'ENCRYPTION_KEY_MISSING': {
    code: 'ENCRYPTION_KEY_MISSING',
    message: 'Encryption key is not configured.',
    action: 'Set ENCRYPTION_KEY in your environment variables (exactly 32 characters).'
  },
  'ENCRYPTION_KEY_INVALID': {
    code: 'ENCRYPTION_KEY_INVALID',
    message: 'Encryption key is invalid.',
    action: 'ENCRYPTION_KEY must be exactly 32 characters.'
  },
  'AI_DISABLED': {
    code: 'AI_DISABLED',
    message: 'AI features are disabled.',
    action: 'No OPENAI_API_KEY provided. AI assistant will not be available.'
  },
  'TENANT_NOT_FOUND': {
    code: 'TENANT_NOT_FOUND',
    message: 'Workspace not found.',
    action: 'The workspace ID provided does not exist or you do not have access.'
  },
  'UNAUTHORIZED': {
    code: 'UNAUTHORIZED',
    message: 'You are not authorized.',
    action: 'Please log in again or check your API key.'
  },
  'FORBIDDEN': {
    code: 'FORBIDDEN',
    message: 'Access denied.',
    action: 'You do not have permission to perform this action.'
  },
  'MODULE_NOT_ENABLED': {
    code: 'MODULE_NOT_ENABLED',
    message: 'This feature is not enabled.',
    action: 'Enable the required module in your workspace settings.'
  },
  'RATE_LIMITED': {
    code: 'RATE_LIMITED',
    message: 'Too many requests.',
    action: 'Please wait a moment and try again.'
  },
  'VALIDATION_ERROR': {
    code: 'VALIDATION_ERROR',
    message: 'Invalid input provided.',
    action: 'Check your input and try again.'
  },
  'EMAIL_PROVIDER_NOT_CONFIGURED': {
    code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    message: 'Email service is not configured.',
    action: 'Configure an email provider in Connectors to send emails.'
  },
  'PAYMENT_PROVIDER_NOT_CONFIGURED': {
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    message: 'Payment processing is not configured.',
    action: 'Configure Stripe or another payment provider in Connectors.'
  },
  'INTERNAL_ERROR': {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong.',
    action: 'Please try again. If the problem persists, contact support.'
  }
};

export function getHumanError(code: string, fallback?: string): HumanError {
  const mapped = ERROR_MAP[code];
  if (mapped) return mapped;
  
  return {
    code: code || 'UNKNOWN_ERROR',
    message: fallback || 'An unexpected error occurred.',
    action: 'Please try again or contact support.'
  };
}

export function humanizeError(error: Error | string | unknown): HumanError {
  if (typeof error === 'string') {
    if (error.includes('DATABASE_URL') || error.includes('connect') || error.includes('ECONNREFUSED')) {
      return getHumanError('DATABASE_CONNECTION_FAILED');
    }
    if (error.includes('JWT') || error.includes('token') || error.includes('SESSION_SECRET')) {
      return getHumanError('JWT_SECRET_MISSING');
    }
    if (error.includes('ENCRYPTION_KEY')) {
      if (error.includes('32')) {
        return getHumanError('ENCRYPTION_KEY_INVALID');
      }
      return getHumanError('ENCRYPTION_KEY_MISSING');
    }
    if (error.includes('OPENAI') || error.includes('AI')) {
      return getHumanError('AI_DISABLED');
    }
    return getHumanError('INTERNAL_ERROR', error);
  }

  if (error instanceof Error) {
    return humanizeError(error.message);
  }

  return getHumanError('INTERNAL_ERROR');
}

export function createErrorResponse(code: string, details?: string): { error: string; code: string; action?: string } {
  const humanError = getHumanError(code);
  return {
    error: details ? `${humanError.message} ${details}` : humanError.message,
    code: humanError.code,
    action: humanError.action
  };
}
