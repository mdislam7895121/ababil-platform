import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../index.js';
import { inviteUserSchema } from '../../../../packages/shared/src/index.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

// List tenant users
router.get('/', async (req: AuthRequest, res) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { tenantId: req.tenantId },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true, status: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(memberships.map(m => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      createdAt: m.createdAt,
      user: m.user
    })));
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Invite user to tenant
router.post('/invite', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const parsed = inviteUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { email, name, role } = parsed.data;

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create new user with temporary password
      const tempPassword = Math.random().toString(36).slice(-12);
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      
      user = await prisma.user.create({
        data: { email, name, passwordHash, status: 'pending' }
      });
    }

    // Check if already a member
    const existingMembership = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: req.tenantId!, userId: user.id } }
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'User already a member of this tenant' });
    }

    // Create membership
    const membership = await prisma.membership.create({
      data: { tenantId: req.tenantId!, userId: user.id, role }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'invite_user',
      entityType: 'user',
      entityId: user.id,
      metadata: { email, role }
    });

    res.status(201).json({
      id: membership.id,
      userId: user.id,
      role: membership.role,
      user: { id: user.id, email: user.email, name: user.name, status: user.status }
    });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// Update user role
router.patch('/:userId/role', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['owner', 'admin', 'staff', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const membership = await prisma.membership.update({
      where: { tenantId_userId: { tenantId: req.tenantId!, userId } },
      data: { role }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'update_user_role',
      entityType: 'membership',
      entityId: membership.id,
      metadata: { userId, role }
    });

    res.json({ success: true, membership });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Remove user from tenant
router.delete('/:userId', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    await prisma.membership.delete({
      where: { tenantId_userId: { tenantId: req.tenantId!, userId } }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'remove_user',
      entityType: 'user',
      entityId: userId
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove user error:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

export { router as userRoutes };
