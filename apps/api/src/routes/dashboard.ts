import { Router } from 'express';
import { prisma } from '../index.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get dashboard stats
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const [
      userCount,
      apiKeyCount,
      enabledModules,
      enabledConnectors,
      recentAuditLogs
    ] = await Promise.all([
      prisma.membership.count({ where: { tenantId: req.tenantId } }),
      prisma.apiKey.count({ where: { tenantId: req.tenantId } }),
      prisma.moduleFlag.count({ where: { tenantId: req.tenantId, enabled: true } }),
      prisma.connectorConfig.count({ where: { tenantId: req.tenantId, enabled: true } }),
      prisma.auditLog.findMany({
        where: { tenantId: req.tenantId },
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    res.json({
      users: userCount,
      apiKeys: apiKeyCount,
      modules: enabledModules,
      connectors: enabledConnectors,
      recentActivity: recentAuditLogs.map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        createdAt: log.createdAt,
        actor: log.actor
      }))
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

export { router as dashboardRoutes };
