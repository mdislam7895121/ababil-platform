const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
  /sk-[A-Za-z0-9]{20,}/gi,
  /pk_[a-z]+_[A-Za-z0-9]+/gi,
  /sk_[a-z]+_[A-Za-z0-9]+/gi,
  /pfk_[A-Za-z0-9]{24,}/gi,
  /[A-Za-z0-9]{32,}(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/g,
  /"password"\s*:\s*"[^"]+"/gi,
  /"secret"\s*:\s*"[^"]+"/gi,
  /"apiKey"\s*:\s*"[^"]+"/gi,
  /"api_key"\s*:\s*"[^"]+"/gi,
  /"token"\s*:\s*"[^"]+"/gi,
  /"authorization"\s*:\s*"[^"]+"/gi,
  /"session_secret"\s*:\s*"[^"]+"/gi,
  /"encryption_key"\s*:\s*"[^"]+"/gi,
];

const HEADER_KEYS_TO_REDACT = [
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
];

export function redactSecrets(input: string): string {
  let result = input;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  
  return result;
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    if (HEADER_KEYS_TO_REDACT.includes(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

export function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return redactSecrets(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item));
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('encryption') ||
        lowerKey === 'key' ||
        lowerKey === 'keyhash'
      ) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactObject(value);
      }
    }
    
    return result;
  }
  
  return obj;
}

export function safeLog(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
  const redactedMessage = redactSecrets(message);
  const redactedData = data ? redactObject(data) : undefined;
  
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  
  if (redactedData) {
    logFn(`[${level.toUpperCase()}] ${redactedMessage}`, redactedData);
  } else {
    logFn(`[${level.toUpperCase()}] ${redactedMessage}`);
  }
}

export function createSafeErrorLog(error: Error, context?: Record<string, unknown>): Record<string, unknown> {
  return {
    message: redactSecrets(error.message),
    name: error.name,
    stack: error.stack ? redactSecrets(error.stack) : undefined,
    context: context ? redactObject(context) : undefined,
  };
}
