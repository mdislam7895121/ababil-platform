import { Router } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/summary', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalUsers = await prisma.membership.count({
      where: { tenantId: req.tenantId! }
    });

    const activeToday = await prisma.auditLog.groupBy({
      by: ['actorUserId'],
      where: {
        tenantId: req.tenantId!,
        createdAt: { gte: today }
      }
    });

    const requestsToday = await prisma.auditLog.count({
      where: {
        tenantId: req.tenantId!,
        createdAt: { gte: today }
      }
    });

    const failedActions = await prisma.auditLog.count({
      where: {
        tenantId: req.tenantId!,
        createdAt: { gte: today },
        action: { contains: 'FAILED' }
      }
    });

    const aiUsageToday = await prisma.aiUsage.aggregate({
      where: {
        tenantId: req.tenantId!,
        createdAt: { gte: today }
      },
      _sum: { promptTokens: true, completionTokens: true },
      _count: true
    });

    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    
    const dailyActivity = await prisma.auditLog.groupBy({
      by: ['createdAt'],
      where: {
        tenantId: req.tenantId!,
        createdAt: { gte: last7Days }
      },
      _count: true
    });

    res.json({
      metrics: {
        totalUsers,
        activeUsersToday: activeToday.length,
        requestsToday,
        failedActionsToday: failedActions,
        aiRequestsToday: aiUsageToday._count || 0,
        aiTokensToday: (aiUsageToday._sum.promptTokens || 0) + (aiUsageToday._sum.completionTokens || 0)
      },
      period: 'today',
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

export { router as analyticsRoutes };
