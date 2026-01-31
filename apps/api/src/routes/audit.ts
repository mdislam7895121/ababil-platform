import { Router } from 'express';
import { prisma } from '../index.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// List audit logs
router.get('/', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId: req.tenantId },
        include: {
          actor: {
            select: { id: true, email: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.auditLog.count({ where: { tenantId: req.tenantId } })
    ]);

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        tenantId: log.tenantId,
        actorUserId: log.actorUserId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadataJson: log.metadata,
        createdAt: log.createdAt,
        actor: log.actor
      })),
      total,
      page,
      limit
    });
  } catch (error) {
    console.error('List audit logs error:', error);
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
});

export { router as auditRoutes };
