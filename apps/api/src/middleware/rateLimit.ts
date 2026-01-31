import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response } from 'express';
import { prisma } from '../index.js';

export type KeyStrategy = 'ip' | 'tenantUser' | 'token';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyStrategy: KeyStrategy;
  routeName: string;
}

const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

const hashKey = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

const keyGenerators: Record<KeyStrategy, (req: Request) => string> = {
  ip: (req) => {
    return `ip:${getClientIp(req)}`;
  },
  tenantUser: (req) => {
    const tenantId = req.headers['x-tenant-id'] as string || 'no-tenant';
    const userId = (req as any).userId || (req as any).user?.id || 'no-user';
    return `tenant:${tenantId}:user:${userId}`;
  },
  token: (req) => {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    return `token:${hashKey(token)}`;
  }
};

export const createRateLimiter = (config: RateLimitConfig) => {
  const { windowMs, max, keyStrategy, routeName } = config;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const key = keyGenerators[keyStrategy](req);
      return `${routeName}:${key}`;
    },
    handler: async (req: Request, res: Response) => {
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;
      const ipHash = hashKey(getClientIp(req));
      
      console.log(`[RateLimit] BLOCKED route=${routeName} keyType=${keyStrategy} tenantId=${tenantId || 'none'} ipHash=${ipHash}`);
      
      if (tenantId) {
        try {
          await prisma.auditLog.create({
            data: {
              tenantId,
              actorUserId: userId || null,
              action: 'RATE_LIMIT_BLOCKED',
              entityType: 'rate_limit',
              entityId: routeName,
              metadata: {
                keyType: keyStrategy,
                ipHash,
                windowMs,
                maxRequests: max
              }
            }
          });
        } catch (e) {
        }
      }
      
      res.set('Retry-After', retryAfterSeconds.toString());
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        route: routeName,
        retryAfterSeconds
      });
    },
    skip: (req: Request) => {
      return false;
    }
  });
};

export const authLoginLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  keyStrategy: 'ip',
  routeName: 'auth/login'
});

export const authRegisterLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyStrategy: 'ip',
  routeName: 'auth/register'
});

export const builderDraftLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyStrategy: 'tenantUser',
  routeName: 'builder/draft'
});

export const builderRunLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyStrategy: 'tenantUser',
  routeName: 'builder/run'
});

export const builderApproveLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyStrategy: 'tenantUser',
  routeName: 'builder/approve'
});

export const previewValidateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 120,
  keyStrategy: 'ip',
  routeName: 'preview/validate'
});

export const previewDemoDataLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 120,
  keyStrategy: 'ip',
  routeName: 'preview/demo-data'
});

export const previewCreateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyStrategy: 'tenantUser',
  routeName: 'preview/create'
});

export const billingCheckoutLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyStrategy: 'tenantUser',
  routeName: 'billing/checkout'
});

export const paymentsManualLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  keyStrategy: 'tenantUser',
  routeName: 'payments/manual'
});

export const paymentsApproveLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyStrategy: 'tenantUser',
  routeName: 'payments/approve'
});

export const aiAssistantLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyStrategy: 'tenantUser',
  routeName: 'ai/assistant'
});

export const i18nGenerateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyStrategy: 'tenantUser',
  routeName: 'i18n/generate'
});

// Mobile builder rate limiters
export const mobileDraftLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyStrategy: 'tenantUser',
  routeName: 'mobile/draft'
});

export const mobileApproveLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyStrategy: 'tenantUser',
  routeName: 'mobile/approve'
});

export const mobileGenerateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyStrategy: 'tenantUser',
  routeName: 'mobile/generate'
});

// Mobile publish rate limiters
export const mobilePublishCredentialsLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyStrategy: 'tenantUser',
  routeName: 'mobile/publish/credentials'
});

export const mobilePublishStartLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyStrategy: 'tenantUser',
  routeName: 'mobile/publish/start'
});

export const mobilePublishJobsListLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 120,
  keyStrategy: 'tenantUser',
  routeName: 'mobile/publish/jobs'
});
