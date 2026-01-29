import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { registerSchema, loginSchema } from '../../../../packages/shared/src/index.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, authMiddleware, tenantMiddleware } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Register new user with tenant
router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { email, password, name, tenantName, tenantSlug } = parsed.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if tenant slug exists
    const existingTenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (existingTenant) {
      return res.status(400).json({ error: 'Tenant slug already taken' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create tenant, user, and membership in transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: tenantName, slug: tenantSlug }
      });

      const user = await tx.user.create({
        data: { email, passwordHash, name }
      });

      const membership = await tx.membership.create({
        data: { tenantId: tenant.id, userId: user.id, role: 'owner' }
      });

      return { tenant, user, membership };
    });

    // Log audit
    await logAudit({
      tenantId: result.tenant.id,
      actorUserId: result.user.id,
      action: 'create_tenant',
      entityType: 'tenant',
      entityId: result.tenant.id
    });

    // Generate token
    const token = jwt.sign({ userId: result.user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        status: result.user.status
      },
      token,
      memberships: [{
        id: result.membership.id,
        tenantId: result.tenant.id,
        userId: result.user.id,
        role: result.membership.role,
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
          plan: result.tenant.plan
        }
      }]
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { tenant: true }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status
      },
      token,
      memberships: user.memberships.map(m => ({
        id: m.id,
        tenantId: m.tenantId,
        userId: m.userId,
        role: m.role,
        tenant: {
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          plan: m.tenant.plan
        }
      }))
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, tenantMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        memberships: {
          include: { tenant: true }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        status: user.status
      },
      memberships: user.memberships.map(m => ({
        id: m.id,
        tenantId: m.tenantId,
        userId: m.userId,
        role: m.role,
        tenant: {
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          plan: m.tenant.plan
        }
      }))
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export { router as authRoutes };
