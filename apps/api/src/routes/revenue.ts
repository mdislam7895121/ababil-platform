import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 39,
  business: 99
};

router.get('/summary', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { period } = req.query;
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }
    
    let dateFilter: Date | null = null;
    if (period === '7d') {
      dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get subscription for the current tenant only
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, plan: true }
        }
      }
    });

    const isActive = subscription?.status === 'active';
    const currentPlan = subscription?.plan || 'free';
    
    const planBreakdown = {
      free: currentPlan === 'free' ? 1 : 0,
      pro: currentPlan === 'pro' && isActive ? 1 : 0,
      business: currentPlan === 'business' && isActive ? 1 : 0
    };

    const mrr = isActive ? (PLAN_PRICES[currentPlan] || 0) : 0;
    const payingWorkspaces = isActive && currentPlan !== 'free' ? 1 : 0;
    const freeWorkspaces = isActive && currentPlan !== 'free' ? 0 : 1;

    // Audit logs scoped to this tenant only
    const auditLogsWhere: any = {
      tenantId,
      action: { in: ['subscription.created', 'subscription.updated', 'subscription.canceled', 'billing.checkout'] }
    };
    if (dateFilter) {
      auditLogsWhere.createdAt = { gte: dateFilter };
    }

    const recentActivity = await prisma.auditLog.findMany({
      where: auditLogsWhere,
      include: {
        tenant: { select: { name: true, slug: true } },
        actor: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const recentPayments = recentActivity.map(log => {
      const metadata = log.metadata as any || {};
      return {
        id: log.id,
        date: log.createdAt,
        tenantName: log.tenant?.name || 'Unknown',
        action: log.action,
        plan: metadata.plan || metadata.planId || 'N/A',
        amount: PLAN_PRICES[metadata.plan || metadata.planId] || 0,
        status: metadata.status || 'completed',
        actorName: log.actor?.name || 'System'
      };
    });

    const liveAppsTotal = subscription?.liveAppsUsed || 0;
    const liveAppsLimit = subscription?.liveAppsLimit || 0;

    res.json({
      activeSubscriptions: isActive ? 1 : 0,
      mrr,
      payingWorkspaces,
      freeWorkspaces,
      totalWorkspaces: 1,
      freeVsPaidRatio: `${freeWorkspaces}:${payingWorkspaces}`,
      planBreakdown: {
        ...planBreakdown,
        proLimits: { liveApps: 1, price: 39 },
        businessLimits: { liveApps: 5, price: 99 }
      },
      liveAppsUsage: {
        used: liveAppsTotal,
        limit: liveAppsLimit
      },
      recentPayments,
      period: period || 'all'
    });
  } catch (error) {
    console.error('Revenue summary error:', error);
    res.status(500).json({ error: 'Failed to get revenue summary' });
  }
});

export { router as revenueRoutes };
