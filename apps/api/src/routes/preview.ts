import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '../index.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

const PREVIEW_ROLES = ['admin', 'staff', 'customer'] as const;

const createPreviewSchema = z.object({
  role: z.enum(PREVIEW_ROLES)
});

router.post('/create', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const parsed = createPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { role } = parsed.data;
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = await prisma.previewSession.create({
      data: {
        tenantId: req.tenantId!,
        role,
        token,
        expiresAt
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'PREVIEW_SESSION_CREATED',
      entityType: 'preview_session',
      entityId: session.id,
      metadata: { role, expiresAt: expiresAt.toISOString() }
    });

    res.json({
      ok: true,
      previewUrl: `/preview?token=${token}`,
      token,
      role,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Create preview session error:', error);
    res.status(500).json({ error: 'Failed to create preview session' });
  }
});

router.get('/validate', async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const session = await prisma.previewSession.findUnique({
      where: { token },
      include: { tenant: true }
    });

    if (!session) {
      return res.status(404).json({ error: 'Preview session not found' });
    }

    if (new Date() > session.expiresAt) {
      return res.status(410).json({ error: 'Preview session expired' });
    }

    res.json({
      valid: true,
      role: session.role,
      tenantId: session.tenantId,
      tenantName: session.tenant.name,
      expiresAt: session.expiresAt.toISOString(),
      isDemo: true,
      restrictions: {
        canSendEmails: false,
        canSendSms: false,
        canProcessPayments: false,
        canModifyData: session.role !== 'customer'
      }
    });
  } catch (error) {
    console.error('Validate preview session error:', error);
    res.status(500).json({ error: 'Failed to validate preview session' });
  }
});

router.get('/sessions', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const sessions = await prisma.previewSession.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        role: true,
        expiresAt: true,
        createdAt: true
      }
    });

    const activeSessions = sessions.filter(s => new Date() < s.expiresAt);

    res.json({
      sessions: activeSessions,
      total: activeSessions.length
    });
  } catch (error) {
    console.error('List preview sessions error:', error);
    res.status(500).json({ error: 'Failed to list preview sessions' });
  }
});

router.delete('/sessions/:id', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const session = await prisma.previewSession.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await prisma.previewSession.delete({ where: { id: session.id } });

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete preview session error:', error);
    res.status(500).json({ error: 'Failed to delete preview session' });
  }
});

router.get('/demo-data', async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const session = await prisma.previewSession.findUnique({ where: { token } });
    if (!session || new Date() > session.expiresAt) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const demoData = {
      users: [
        { id: 'demo-1', name: 'Demo Admin', email: 'admin@demo.local', role: 'admin', isDemo: true },
        { id: 'demo-2', name: 'Demo Staff', email: 'staff@demo.local', role: 'staff', isDemo: true },
        { id: 'demo-3', name: 'Demo Customer', email: 'customer@demo.local', role: 'customer', isDemo: true }
      ],
      stats: {
        totalUsers: 3,
        activeModules: 4,
        recentOrders: 12,
        revenue: '$1,234.00',
        isDemo: true
      },
      recentActivity: [
        { type: 'order', message: 'Demo order #1001 placed', time: '5 minutes ago', isDemo: true },
        { type: 'user', message: 'Demo user registered', time: '1 hour ago', isDemo: true },
        { type: 'payment', message: 'Demo payment received', time: '2 hours ago', isDemo: true }
      ]
    };

    res.json({ data: demoData, isDemo: true, role: session.role });
  } catch (error) {
    console.error('Get demo data error:', error);
    res.status(500).json({ error: 'Failed to get demo data' });
  }
});

export { router as previewRoutes };
