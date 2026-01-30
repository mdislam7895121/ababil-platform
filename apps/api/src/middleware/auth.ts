import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { hashApiKey } from '../lib/crypto.js';
import { logAudit } from '../lib/audit.js';

const JWT_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
  membership?: {
    id: string;
    role: string;
  };
  user?: {
    id: string;
    email: string;
    name: string;
  };
  apiKey?: {
    id: string;
    scopes: string[];
    keyPrefix: string;
  };
  authMethod?: 'jwt' | 'api_key';
}

// Define available scopes and their descriptions
export const API_SCOPES = {
  'read': 'Read access to most endpoints',
  'builder:write': 'Write access to builder/draft operations',
  'billing:write': 'Access to billing and payment operations',
  'marketplace:install': 'Install apps from marketplace',
  'support:write': 'Create and manage support tickets',
  'admin:write': 'Administrative operations including security settings'
} as const;

export type ApiScope = keyof typeof API_SCOPES;

// Route to scope mapping - comprehensive coverage of all API endpoints
export const ROUTE_SCOPES: Record<string, ApiScope[]> = {
  // === READ OPERATIONS (require 'read' scope) ===
  'GET:/api/audit-logs': ['read'],
  'GET:/api/dashboard': ['read'],
  'GET:/api/modules': ['read'],
  'GET:/api/connectors': ['read'],
  'GET:/api/api-keys': ['read'],
  'GET:/api/api-keys/scopes': ['read'],
  'GET:/api/users': ['read'],
  'GET:/api/builder/draft': ['read'],
  'GET:/api/billing': ['read'],
  'GET:/api/billing/invoices': ['read'],
  'GET:/api/billing/usage': ['read'],
  'GET:/api/marketplace': ['read'],
  'GET:/api/marketplace/apps': ['read'],
  'GET:/api/marketplace/categories': ['read'],
  'GET:/api/support/tickets': ['read'],
  'GET:/api/analytics': ['read'],
  'GET:/api/costs': ['read'],
  'GET:/api/costs/breakdown': ['read'],
  'GET:/api/revenue': ['read'],
  'GET:/api/revenue/metrics': ['read'],
  'GET:/api/payments': ['read'],
  'GET:/api/invoices': ['read'],
  'GET:/api/tenants': ['read'],
  'GET:/api/backups': ['read'],
  'GET:/api/backups/snapshots': ['read'],
  'GET:/api/exports': ['read'],
  'GET:/api/monitoring': ['read'],
  'GET:/api/monitoring/incidents': ['read'],
  'GET:/api/monitoring/alerts': ['read'],
  'GET:/api/reports': ['read'],
  'GET:/api/reports/sla': ['read'],
  'GET:/api/evidence': ['read'],
  'GET:/api/evidence/exports': ['read'],
  'GET:/api/security-center': ['read'],
  'GET:/api/security-center/settings': ['read'],
  'GET:/api/security-center/permissions-matrix': ['read'],
  'GET:/api/access-review': ['read'],
  'GET:/api/access-review/summary': ['read'],
  'GET:/api/legal/templates': ['read'],
  'GET:/api/growth': ['read'],
  'GET:/api/growth/analytics': ['read'],
  'GET:/api/success': ['read'],
  'GET:/api/reseller': ['read'],
  'GET:/api/reseller/payouts': ['read'],
  'GET:/api/partners': ['read'],
  'GET:/api/deploy': ['read'],
  'GET:/api/deploy/status': ['read'],
  'GET:/api/preview': ['read'],
  'GET:/api/checklist': ['read'],
  'GET:/api/onboarding': ['read'],
  'GET:/api/env': ['read'],
  
  // === BUILDER OPERATIONS (require 'builder:write' scope) ===
  'POST:/api/builder/draft': ['builder:write'],
  'PUT:/api/builder/draft': ['builder:write'],
  'PATCH:/api/builder/draft': ['builder:write'],
  'DELETE:/api/builder/draft': ['builder:write'],
  'POST:/api/builder/generate': ['builder:write'],
  'POST:/api/builder/ai-generate': ['builder:write'],
  'POST:/api/deploy': ['builder:write'],
  'POST:/api/deploy/publish': ['builder:write'],
  'POST:/api/preview': ['builder:write'],
  'POST:/api/preview/start': ['builder:write'],
  'POST:/api/modules': ['builder:write'],
  'PATCH:/api/modules': ['builder:write'],
  'POST:/api/connectors': ['builder:write'],
  'PATCH:/api/connectors': ['builder:write'],
  'DELETE:/api/connectors': ['builder:write'],
  'POST:/api/env': ['builder:write'],
  'PUT:/api/env': ['builder:write'],
  'DELETE:/api/env': ['builder:write'],
  
  // === BILLING OPERATIONS (require 'billing:write' scope) ===
  'POST:/api/billing/checkout': ['billing:write'],
  'POST:/api/billing/subscribe': ['billing:write'],
  'POST:/api/billing/cancel': ['billing:write'],
  'POST:/api/billing/upgrade': ['billing:write'],
  'POST:/api/payments': ['billing:write'],
  'POST:/api/payments/refund': ['billing:write'],
  'POST:/api/invoices': ['billing:write'],
  
  // === MARKETPLACE OPERATIONS (require 'marketplace:install' scope) ===
  'POST:/api/marketplace/install': ['marketplace:install'],
  'DELETE:/api/marketplace/uninstall': ['marketplace:install'],
  'POST:/api/marketplace/apps': ['marketplace:install'],
  'PATCH:/api/marketplace/apps': ['marketplace:install'],
  
  // === SUPPORT OPERATIONS (require 'support:write' scope) ===
  'POST:/api/support/tickets': ['support:write'],
  'PUT:/api/support/tickets': ['support:write'],
  'PATCH:/api/support/tickets': ['support:write'],
  
  // === ADMIN OPERATIONS (require 'admin:write' scope) ===
  'POST:/api/security-center/settings': ['admin:write'],
  'PUT:/api/security-center/settings': ['admin:write'],
  'POST:/api/access-review': ['admin:write'],
  'POST:/api/users': ['admin:write'],
  'PUT:/api/users': ['admin:write'],
  'PATCH:/api/users': ['admin:write'],
  'DELETE:/api/users': ['admin:write'],
  'GET:/api/users/': ['read'],  // /api/users/:id
  'PUT:/api/users/': ['admin:write'],
  'PATCH:/api/users/': ['admin:write'],
  'DELETE:/api/users/': ['admin:write'],
  'POST:/api/api-keys': ['admin:write'],
  'PATCH:/api/api-keys': ['admin:write'],
  'DELETE:/api/api-keys': ['admin:write'],
  'GET:/api/api-keys/': ['read'],  // /api/api-keys/:id
  'PATCH:/api/api-keys/': ['admin:write'],
  'DELETE:/api/api-keys/': ['admin:write'],
  'POST:/api/api-keys/rotate': ['admin:write'],  // /api/api-keys/:id/rotate
  'POST:/api/api-keys/revoke': ['admin:write'],  // /api/api-keys/:id/revoke
  'PATCH:/api/api-keys/scopes': ['admin:write'], // /api/api-keys/:id/scopes
  'POST:/api/tenants': ['admin:write'],
  'PUT:/api/tenants': ['admin:write'],
  'PATCH:/api/tenants': ['admin:write'],
  'DELETE:/api/tenants': ['admin:write'],
  'POST:/api/backups': ['admin:write'],
  'POST:/api/backups/snapshot': ['admin:write'],
  'POST:/api/backups/restore': ['admin:write'],
  'POST:/api/exports': ['admin:write'],
  'POST:/api/exports/generate': ['admin:write'],
  'DELETE:/api/exports': ['admin:write'],
  'POST:/api/evidence/exports': ['admin:write'],
  'POST:/api/legal/generate': ['admin:write'],
  'POST:/api/monitoring/alerts': ['admin:write'],
  'PATCH:/api/monitoring/alerts': ['admin:write'],
  'POST:/api/monitoring/incidents': ['admin:write'],
  'PATCH:/api/monitoring/incidents': ['admin:write'],
  'POST:/api/reseller': ['admin:write'],
  'POST:/api/reseller/payouts': ['admin:write'],
  'POST:/api/partners': ['admin:write'],
  'PATCH:/api/partners': ['admin:write'],
  'DELETE:/api/partners': ['admin:write'],
};

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const xApiKey = req.headers['x-api-key'] as string;
    
    // Check for x-api-key header first
    if (xApiKey) {
      return await handleApiKeyAuth(req, res, next, xApiKey);
    }

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Check for Bearer token (JWT)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        req.userId = decoded.userId;
        req.authMethod = 'jwt';
        return next();
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Check for ApiKey authorization
    if (authHeader.startsWith('ApiKey ')) {
      const apiKey = authHeader.slice(7);
      return await handleApiKeyAuth(req, res, next, apiKey);
    }

    return res.status(401).json({ error: 'Invalid authorization format' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

async function handleApiKeyAuth(req: AuthRequest, res: Response, next: NextFunction, apiKey: string) {
  const keyHash = hashApiKey(apiKey);
  const tenantId = req.headers['x-tenant-id'] as string;
  
  if (!tenantId) {
    return res.status(400).json({ error: 'x-tenant-id header required for API key auth' });
  }
  
  const key = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      tenantId,
      status: 'active',
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    }
  });

  if (!key) {
    return res.status(401).json({ error: 'Invalid or revoked API key' });
  }

  // Update last used info
  const clientIp = getClientIp(req);
  await prisma.apiKey.update({
    where: { id: key.id },
    data: { 
      lastUsedAt: new Date(),
      lastUsedIp: clientIp
    }
  });

  req.tenantId = key.tenantId;
  req.apiKey = {
    id: key.id,
    scopes: key.scopes,
    keyPrefix: key.keyPrefix
  };
  req.authMethod = 'api_key';
  
  return next();
}

export async function tenantMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // If tenantId already set by API key auth, skip membership check
    if (req.tenantId && req.authMethod === 'api_key') {
      return next();
    }

    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Missing x-tenant-id header' });
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify user has membership in this tenant
    const membership = await prisma.membership.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId: req.userId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this tenant' });
    }

    req.tenantId = tenantId;
    req.membership = {
      id: membership.id,
      role: membership.role
    };

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true }
    });
    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    return res.status(500).json({ error: 'Tenant verification error' });
  }
}

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  admin: 3,
  staff: 2,
  viewer: 1
};

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // API key auth bypasses role check but must pass scope check
    if (req.authMethod === 'api_key') {
      return next();
    }
    
    if (!req.membership) {
      return res.status(403).json({ error: 'No membership found' });
    }

    const userRoleLevel = ROLE_HIERARCHY[req.membership.role] || 0;
    const requiredLevel = Math.min(...roles.map(r => ROLE_HIERARCHY[r] || 0));

    if (userRoleLevel < requiredLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Middleware to check API key scopes
export function requireScope(...requiredScopes: ApiScope[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // JWT auth always passes scope check (uses role-based access)
    if (req.authMethod === 'jwt') {
      return next();
    }
    
    // For API key auth, check scopes
    if (req.authMethod === 'api_key' && req.apiKey) {
      const hasScope = requiredScopes.some(scope => req.apiKey!.scopes.includes(scope));
      
      if (!hasScope) {
        // Log the scope denial
        await logAudit({
          tenantId: req.tenantId!,
          actorUserId: null,
          action: 'API_KEY_SCOPE_DENIED',
          entityType: 'api_key',
          entityId: req.apiKey.id,
          metadata: { 
            requiredScopes, 
            keyScopes: req.apiKey.scopes,
            endpoint: `${req.method}:${req.path}`
          }
        });
        
        return res.status(403).json({ 
          error: 'Insufficient scope',
          required: requiredScopes,
          provided: req.apiKey.scopes
        });
      }
    }
    
    next();
  };
}

// Dynamic scope check based on route
export async function scopeMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // Only check scopes for API key auth
  if (req.authMethod !== 'api_key' || !req.apiKey) {
    return next();
  }
  
  // Build route key for lookup - normalize by removing UUIDs and cleaning double slashes
  const rawPath = `${req.method}:${req.baseUrl}${req.path}`;
  const routeKey = rawPath
    .replace(/\/[a-f0-9-]{36}/gi, '') // Remove UUID segments
    .replace(/\/\//g, '/');           // Clean double slashes
  
  // Check if route has scope requirements
  const requiredScopes = ROUTE_SCOPES[routeKey];
  
  // If no specific scopes defined, apply DEFAULT-DENY policy:
  // - GET requests require 'read' scope
  // - All other methods (POST, PUT, PATCH, DELETE) require 'admin:write' scope
  if (!requiredScopes) {
    if (req.method === 'GET') {
      if (!req.apiKey.scopes.includes('read')) {
        await logAudit({
          tenantId: req.tenantId!,
          actorUserId: null,
          action: 'API_KEY_SCOPE_DENIED',
          entityType: 'api_key',
          entityId: req.apiKey.id,
          metadata: { 
            requiredScopes: ['read'], 
            keyScopes: req.apiKey.scopes,
            endpoint: routeKey,
            policy: 'default-deny-unmapped'
          }
        });
        return res.status(403).json({ 
          error: 'Insufficient scope',
          required: ['read'],
          provided: req.apiKey.scopes
        });
      }
    } else {
      // Non-GET methods on unmapped routes require admin:write (default-deny)
      if (!req.apiKey.scopes.includes('admin:write')) {
        await logAudit({
          tenantId: req.tenantId!,
          actorUserId: null,
          action: 'API_KEY_SCOPE_DENIED',
          entityType: 'api_key',
          entityId: req.apiKey.id,
          metadata: { 
            requiredScopes: ['admin:write'], 
            keyScopes: req.apiKey.scopes,
            endpoint: routeKey,
            policy: 'default-deny-unmapped'
          }
        });
        return res.status(403).json({ 
          error: 'Insufficient scope',
          required: ['admin:write'],
          provided: req.apiKey.scopes,
          note: 'Unmapped write endpoint requires admin:write scope'
        });
      }
    }
    return next();
  }
  
  const hasScope = requiredScopes.some(scope => req.apiKey!.scopes.includes(scope));
  
  if (!hasScope) {
    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: null,
      action: 'API_KEY_SCOPE_DENIED',
      entityType: 'api_key',
      entityId: req.apiKey.id,
      metadata: { 
        requiredScopes, 
        keyScopes: req.apiKey.scopes,
        endpoint: routeKey
      }
    });
    
    return res.status(403).json({ 
      error: 'Insufficient scope',
      required: requiredScopes,
      provided: req.apiKey.scopes
    });
  }
  
  next();
}
