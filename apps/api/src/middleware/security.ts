import helmet from 'helmet';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';

const isProd = process.env.NODE_ENV === 'production';

export const securityHeaders = helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https:"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  xContentTypeOptions: true,
  xFrameOptions: { action: 'sameorigin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xDnsPrefetchControl: { allow: false },
  xDownloadOptions: true,
  xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
});

export const permissionsPolicy = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
};

function parseAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS || '';
  const appUrl = process.env.APP_URL || '';
  
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
  ]);
  
  if (envOrigins) {
    envOrigins.split(',').forEach(origin => {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    });
  }
  
  if (appUrl) {
    origins.add(appUrl);
  }
  
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    origins.add(`https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
    origins.add(`https://${process.env.REPL_ID}.id.repl.co`);
  }
  
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  
  return Array.from(origins);
}

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = parseAllowedOrigins();
    
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    if (!isProd) {
      return callback(null, true);
    }
    
    console.warn(`[CORS] Blocked origin: ${origin}`);
    callback(new Error('CORS: Origin not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-api-key', 'x-health-check'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
  maxAge: 600,
});

export const bodyLimits = {
  default: '1mb',
  upload: '10mb',
  export: '50mb',
};

export function validateJwtSecret(): void {
  const secret = process.env.SESSION_SECRET;
  
  if (!secret) {
    if (isProd) {
      console.error('[SECURITY] FATAL: SESSION_SECRET is required in production');
      process.exit(1);
    }
    console.warn('[SECURITY] Warning: SESSION_SECRET not set (development mode)');
    return;
  }
  
  if (secret.length < 32) {
    if (isProd) {
      console.error('[SECURITY] FATAL: SESSION_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    console.warn('[SECURITY] Warning: SESSION_SECRET should be at least 32 characters');
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};
