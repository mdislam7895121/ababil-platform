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

// Route to scope mapping
export const ROUTE_SCOPES: Record<string, ApiScope[]> = {
  // Read operations
  'GET:/api/audit-logs': ['read'],
  'GET:/api/dashboard': ['read'],
  'GET:/api/modules': ['read'],
  'GET:/api/connectors': ['read'],
  'GET:/api/api-keys': ['read'],
  'GET:/api/users': ['read'],
  'GET:/api/builder/draft': ['read'],
  'GET:/api/billing': ['read'],
  'GET:/api/marketplace': ['read'],
  'GET:/api/support/tickets': ['read'],
  'GET:/api/analytics': ['read'],
  
  // Builder write operations
  'POST:/api/builder/draft': ['builder:write'],
  'PUT:/api/builder/draft': ['builder:write'],
  'PATCH:/api/builder/draft': ['builder:write'],
  'DELETE:/api/builder/draft': ['builder:write'],
  'POST:/api/builder/generate': ['builder:write'],
  
  // Billing operations
  'POST:/api/billing/checkout': ['billing:write'],
  'POST:/api/billing/subscribe': ['billing:write'],
  'POST:/api/billing/cancel': ['billing:write'],
  
  // Marketplace operations
  'POST:/api/marketplace/install': ['marketplace:install'],
  'DELETE:/api/marketplace/uninstall': ['marketplace:install'],
  
  // Support operations
  'POST:/api/support/tickets': ['support:write'],
  'PUT:/api/support/tickets': ['support:write'],
  
  // Admin operations
  'POST:/api/security-center/settings': ['admin:write'],
  'POST:/api/access-review': ['admin:write'],
  'POST:/api/users': ['admin:write'],
  'DELETE:/api/users': ['admin:write'],
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
  
  // Build route key for lookup
  const routeKey = `${req.method}:${req.baseUrl}${req.path}`.replace(/\/[a-f0-9-]{36}/gi, '');
  
  // Check if route has scope requirements
  const requiredScopes = ROUTE_SCOPES[routeKey];
  
  // If no specific scopes defined, default to read for GET, admin:write for others
  if (!requiredScopes) {
    if (req.method === 'GET') {
      if (!req.apiKey.scopes.includes('read')) {
        return res.status(403).json({ 
          error: 'Insufficient scope',
          required: ['read'],
          provided: req.apiKey.scopes
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
