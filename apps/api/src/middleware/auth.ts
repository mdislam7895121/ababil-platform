import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { hashApiKey } from '../lib/crypto.js';

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
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Check for Bearer token (JWT)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        req.userId = decoded.userId;
        return next();
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Check for API key
    if (authHeader.startsWith('ApiKey ')) {
      const apiKey = authHeader.slice(7);
      const keyHash = hashApiKey(apiKey);
      
      const key = await prisma.apiKey.findFirst({
        where: {
          keyHash,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      });

      if (!key) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Update last used
      await prisma.apiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() }
      });

      req.tenantId = key.tenantId;
      return next();
    }

    return res.status(401).json({ error: 'Invalid authorization format' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

export async function tenantMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // If tenantId already set by API key auth, skip
    if (req.tenantId) {
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
