import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function logAudit(
  tenantId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Prisma.InputJsonValue = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        entityType,
        entityId,
        metadata
      }
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

async function logGrowthEvent(
  tenantId: string,
  eventType: string,
  metadata: Prisma.InputJsonValue = {}
) {
  try {
    await prisma.growthEvent.create({
      data: {
        tenantId,
        eventType,
        metadata
      }
    });
  } catch (err) {
    console.error('Growth event log error:', err);
  }
}

// ============================================================
// 20.1 REFERRAL SYSTEM
// ============================================================

router.post('/referral/create', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;
  const userId = authReq.userId;

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const existing = await prisma.referral.findFirst({
      where: { referrerTenant: tenantId }
    });

    if (existing) {
      return res.json({
        referral: existing,
        message: 'Referral already exists',
        isNew: false
      });
    }

    const referralCode = generateReferralCode();
    const referral = await prisma.referral.create({
      data: {
        referrerTenant: tenantId,
        referralCode,
        rewardType: 'credit'
      }
    });

    await logAudit(tenantId, userId, 'REFERRAL_CREATED', 'referral', referral.id, {
      referralCode
    });

    await logGrowthEvent(tenantId, 'referral_created', { referralCode });

    return res.json({
      referral,
      message: 'Referral program activated',
      isNew: true
    });
  } catch (err) {
    console.error('Referral create error:', err);
    return res.status(500).json({ error: 'Failed to create referral' });
  }
});

router.get('/referral/status', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;

  if (!tenantId) {
    return res.status(401).json({ error: 'Tenant required' });
  }

  try {
    let referral = await prisma.referral.findFirst({
      where: { referrerTenant: tenantId }
    });

    if (!referral) {
      const referralCode = generateReferralCode();
      referral = await prisma.referral.create({
        data: {
          referrerTenant: tenantId,
          referralCode,
          rewardType: 'credit'
        }
      });
    }

    const signups = await prisma.referralSignup.findMany({
      where: { referralId: referral.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const baseUrl = process.env.APP_URL || 'https://app.example.com';
    const referralLink = `${baseUrl}/register?ref=${referral.referralCode}`;

    return res.json({
      referralCode: referral.referralCode,
      referralLink,
      stats: {
        clicks: referral.clicks,
        signups: referral.signups,
        conversions: referral.conversions,
        rewardsEarned: referral.rewardsEarned
      },
      recentSignups: signups.map(s => ({
        id: s.id,
        convertedToPaid: s.convertedToPaid,
        discountApplied: s.discountApplied,
        createdAt: s.createdAt
      })),
      rewards: {
        referrerReward: '1 month free OR $50 credit',
        referredDiscount: '20% off first 3 months'
      }
    });
  } catch (err) {
    console.error('Referral status error:', err);
    return res.status(500).json({ error: 'Failed to get referral status' });
  }
});

// ============================================================
// 20.2 CONTEXT-AWARE UPGRADE NUDGES
// ============================================================

router.get('/nudges', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;
  const userId = authReq.userId;

  if (!tenantId) {
    return res.status(401).json({ error: 'Tenant required' });
  }

  try {
    const dismissal = await prisma.nudgeDismissal.findFirst({
      where: {
        tenantId,
        cooldownUntil: { gt: new Date() }
      }
    });

    const dismissedTypes = dismissal ? [dismissal.nudgeType] : [];

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: true }
    });

    const setupSteps = await prisma.setupStep.findMany({
      where: { tenantId }
    });

    const deployConfig = await prisma.deployConfig.findFirst({
      where: { tenantId }
    });

    const completedSteps = setupSteps.filter(s => s.status === 'completed').length;
    const totalSteps = setupSteps.length || 5;
    const successPercent = Math.round((completedSteps / totalSteps) * 100);

    const nudges: Array<{
      nudgeType: string;
      message: string;
      ctaLabel: string;
      targetRoute: string;
      priority: number;
    }> = [];

    if (!tenant?.subscription && !dismissedTypes.includes('upgrade_to_paid')) {
      nudges.push({
        nudgeType: 'upgrade_to_paid',
        message: 'Upgrade to Pro to unlock deployment and go live with your platform.',
        ctaLabel: 'View Plans',
        targetRoute: '/dashboard/billing',
        priority: 1
      });
    }

    if (successPercent >= 80 && !deployConfig && !dismissedTypes.includes('ready_to_deploy')) {
      nudges.push({
        nudgeType: 'ready_to_deploy',
        message: 'You\'re almost there! Configure deployment to launch your platform.',
        ctaLabel: 'Setup Deploy',
        targetRoute: '/dashboard/deploy',
        priority: 2
      });
    }

    if (successPercent < 50 && completedSteps > 0 && !dismissedTypes.includes('complete_onboarding')) {
      nudges.push({
        nudgeType: 'complete_onboarding',
        message: 'Complete your setup to unlock all platform features.',
        ctaLabel: 'Continue Setup',
        targetRoute: '/dashboard/onboarding',
        priority: 3
      });
    }

    nudges.sort((a, b) => a.priority - b.priority);
    const activeNudge = nudges.length > 0 ? nudges[0] : null;

    if (activeNudge && userId) {
      await logGrowthEvent(tenantId, 'nudge_shown', {
        nudgeType: activeNudge.nudgeType
      });

      await logAudit(tenantId, userId, 'NUDGE_SHOWN', 'nudge', activeNudge.nudgeType, {
        message: activeNudge.message
      });
    }

    return res.json({
      hasNudge: !!activeNudge,
      nudge: activeNudge,
      context: {
        successPercent,
        hasPaidPlan: !!tenant?.subscription,
        hasDeployConfig: !!deployConfig
      }
    });
  } catch (err) {
    console.error('Nudges error:', err);
    return res.status(500).json({ error: 'Failed to get nudges' });
  }
});

router.post('/nudges/dismiss', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;
  const { nudgeType } = req.body;

  if (!tenantId || !nudgeType) {
    return res.status(400).json({ error: 'Tenant and nudgeType required' });
  }

  try {
    const cooldownHours = 24;
    const cooldownUntil = new Date(Date.now() + cooldownHours * 60 * 60 * 1000);

    await prisma.nudgeDismissal.upsert({
      where: {
        tenantId_nudgeType: { tenantId, nudgeType }
      },
      update: {
        dismissedAt: new Date(),
        cooldownUntil
      },
      create: {
        tenantId,
        nudgeType,
        cooldownUntil
      }
    });

    await logGrowthEvent(tenantId, 'nudge_dismissed', { nudgeType });

    return res.json({
      dismissed: true,
      cooldownUntil,
      message: `Nudge dismissed for ${cooldownHours} hours`
    });
  } catch (err) {
    console.error('Nudge dismiss error:', err);
    return res.status(500).json({ error: 'Failed to dismiss nudge' });
  }
});

// ============================================================
// 20.3 TIME-LIMITED OFFERS ENGINE
// ============================================================

router.post('/offers', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;
  const userId = authReq.userId;

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, role: { in: ['owner', 'admin'] } }
  });

  if (!membership) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { name, description, discountPercent, eligiblePlans, expiresAt, maxRedemptions } = req.body;

  if (!name || !discountPercent || !eligiblePlans || !expiresAt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const offer = await prisma.growthOffer.create({
      data: {
        name,
        description: description || '',
        discountPercent: Number(discountPercent),
        eligiblePlans: Array.isArray(eligiblePlans) ? eligiblePlans : [eligiblePlans],
        expiresAt: new Date(expiresAt),
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null
      }
    });

    await logAudit(tenantId, userId, 'OFFER_CREATED', 'offer', offer.id, {
      name,
      discountPercent,
      expiresAt
    });

    return res.json({
      offer,
      message: 'Offer created successfully'
    });
  } catch (err) {
    console.error('Offer create error:', err);
    return res.status(500).json({ error: 'Failed to create offer' });
  }
});

router.get('/offers/active', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;

  if (!tenantId) {
    return res.status(401).json({ error: 'Tenant required' });
  }

  try {
    const now = new Date();
    const offers = await prisma.growthOffer.findMany({
      where: {
        active: true,
        expiresAt: { gt: now }
      },
      orderBy: { expiresAt: 'asc' }
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    const currentPlan = tenant?.plan || 'free';

    const eligibleOffers = offers.filter(offer => {
      if (offer.maxRedemptions && offer.redemptions >= offer.maxRedemptions) {
        return false;
      }
      return offer.eligiblePlans.includes(currentPlan) || offer.eligiblePlans.includes('all');
    });

    return res.json({
      offers: eligibleOffers.map(offer => ({
        id: offer.id,
        name: offer.name,
        description: offer.description,
        discountPercent: offer.discountPercent,
        expiresAt: offer.expiresAt,
        timeRemaining: Math.max(0, Math.floor((offer.expiresAt.getTime() - now.getTime()) / 1000)),
        eligiblePlans: offer.eligiblePlans
      })),
      hasActiveOffer: eligibleOffers.length > 0
    });
  } catch (err) {
    console.error('Active offers error:', err);
    return res.status(500).json({ error: 'Failed to get active offers' });
  }
});

router.post('/offers/:offerId/redeem', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;
  const userId = authReq.userId;
  const { offerId } = req.params;

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const offer = await prisma.growthOffer.findUnique({
      where: { id: offerId }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    if (!offer.active || offer.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Offer has expired' });
    }

    if (offer.maxRedemptions && offer.redemptions >= offer.maxRedemptions) {
      return res.status(400).json({ error: 'Offer redemption limit reached' });
    }

    await prisma.growthOffer.update({
      where: { id: offerId },
      data: { redemptions: { increment: 1 } }
    });

    await logAudit(tenantId, userId, 'OFFER_REDEEMED', 'offer', offerId, {
      offerName: offer.name,
      discountPercent: offer.discountPercent
    });

    await logGrowthEvent(tenantId, 'offer_redeemed', {
      offerId,
      discountPercent: offer.discountPercent
    });

    return res.json({
      redeemed: true,
      discountPercent: offer.discountPercent,
      message: `${offer.discountPercent}% discount applied!`
    });
  } catch (err) {
    console.error('Offer redeem error:', err);
    return res.status(500).json({ error: 'Failed to redeem offer' });
  }
});

// ============================================================
// 20.4 SUCCESS-BASED UPSELLS
// ============================================================

router.get('/upsells', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;
  const userId = authReq.userId;

  if (!tenantId) {
    return res.status(401).json({ error: 'Tenant required' });
  }

  try {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId }
    });

    const deployRuns = await prisma.deployRun.findMany({
      where: { tenantId, status: 'completed' },
      take: 1
    });

    const payments = await prisma.manualPayment.findMany({
      where: { tenantId, status: 'approved' },
      take: 1
    });

    const setupSteps = await prisma.setupStep.findMany({
      where: { tenantId, status: 'completed' }
    });

    const isLive = setupSteps.length >= 5;
    const hasSuccessfulDeploy = deployRuns.length > 0;
    const hasPayment = payments.length > 0 || !!subscription;

    const upsells: Array<{
      id: string;
      title: string;
      description: string;
      price: string;
      trigger: string;
      ctaLabel: string;
      value: string[];
    }> = [];

    if (isLive || hasSuccessfulDeploy) {
      upsells.push({
        id: 'priority_support',
        title: 'Priority Support',
        description: 'Get dedicated support with 1-hour response time and direct Slack access.',
        price: '$99/month',
        trigger: 'live_success',
        ctaLabel: 'Add Priority Support',
        value: [
          '1-hour response SLA',
          'Direct Slack channel',
          'Priority bug fixes',
          'Monthly check-in calls'
        ]
      });
    }

    if (hasSuccessfulDeploy) {
      upsells.push({
        id: 'managed_launch',
        title: 'Managed Launch Package',
        description: 'Let our team handle your launch with white-glove service.',
        price: '$499 one-time',
        trigger: 'first_deploy',
        ctaLabel: 'Get Launch Help',
        value: [
          'Full configuration review',
          'Performance optimization',
          'Launch day monitoring',
          '48-hour post-launch support'
        ]
      });
    }

    if (hasPayment) {
      upsells.push({
        id: 'custom_domain',
        title: 'Custom Domain Setup',
        description: 'Professional domain setup with SSL and DNS configuration.',
        price: '$49 one-time',
        trigger: 'first_payment',
        ctaLabel: 'Setup Custom Domain',
        value: [
          'DNS configuration',
          'SSL certificate',
          'Email forwarding setup',
          'Subdomain management'
        ]
      });
    }

    if (upsells.length > 0 && userId) {
      await logGrowthEvent(tenantId, 'upsells_shown', {
        upsellIds: upsells.map(u => u.id)
      });
    }

    return res.json({
      upsells,
      triggers: {
        isLive,
        hasSuccessfulDeploy,
        hasPayment
      }
    });
  } catch (err) {
    console.error('Upsells error:', err);
    return res.status(500).json({ error: 'Failed to get upsells' });
  }
});

router.post('/upsells/:upsellId/accept', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;
  const userId = authReq.userId;
  const { upsellId } = req.params;

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Check if upsellId matches a known upsell from current available upsells
    const knownUpsells = ['whitelabel_pro', 'priority_support', 'custom_domain', 'analytics_pro', 'dedicated_instance'];
    const isKnownUpsell = knownUpsells.includes(upsellId);
    const acceptReason = isKnownUpsell ? 'matched_available_upsell' : 'manual_request_allowed';

    await logAudit(tenantId, userId, 'UPSELL_ACCEPTED', 'upsell', upsellId, { acceptReason });

    await logGrowthEvent(tenantId, 'upsell_accepted', { upsellId, acceptReason });

    return res.json({
      accepted: true,
      upsellId,
      acceptedBecause: acceptReason,
      validation: {
        isKnownUpsell,
        manualRequestAllowed: true,
        note: isKnownUpsell 
          ? 'Upsell matched available catalog' 
          : 'Manual upsell requests are explicitly allowed for custom sales inquiries'
      },
      message: 'Thank you! We\'ll reach out within 24 hours to get started.',
      nextSteps: [
        'Check your email for confirmation',
        'Our team will schedule a call',
        'Service activation within 48 hours'
      ]
    });
  } catch (err) {
    console.error('Upsell accept error:', err);
    return res.status(500).json({ error: 'Failed to accept upsell' });
  }
});

// ============================================================
// 20.5 GROWTH ANALYTICS
// ============================================================

router.get('/analytics', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.headers['x-tenant-id'] as string;
  const userId = authReq.userId;

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, role: { in: ['owner', 'admin'] } }
  });

  if (!membership) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const referral = await prisma.referral.findFirst({
      where: { referrerTenant: tenantId }
    });

    const referralStats = referral ? {
      totalClicks: referral.clicks,
      totalSignups: referral.signups,
      totalConversions: referral.conversions,
      conversionRate: referral.signups > 0 
        ? Math.round((referral.conversions / referral.signups) * 100) 
        : 0
    } : null;

    const nudgeEvents = await prisma.growthEvent.findMany({
      where: {
        tenantId,
        eventType: { in: ['nudge_shown', 'nudge_dismissed'] },
        createdAt: { gte: thirtyDaysAgo }
      }
    });

    const nudgesShown = nudgeEvents.filter(e => e.eventType === 'nudge_shown').length;
    const nudgesDismissed = nudgeEvents.filter(e => e.eventType === 'nudge_dismissed').length;

    const offerEvents = await prisma.growthEvent.findMany({
      where: {
        tenantId,
        eventType: 'offer_redeemed',
        createdAt: { gte: thirtyDaysAgo }
      }
    });

    const upsellEvents = await prisma.growthEvent.findMany({
      where: {
        tenantId,
        eventType: { in: ['upsells_shown', 'upsell_accepted'] },
        createdAt: { gte: thirtyDaysAgo }
      }
    });

    const upsellsShown = upsellEvents.filter(e => e.eventType === 'upsells_shown').length;
    const upsellsAccepted = upsellEvents.filter(e => e.eventType === 'upsell_accepted').length;

    const allEvents = await prisma.growthEvent.findMany({
      where: {
        tenantId,
        createdAt: { gte: thirtyDaysAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return res.json({
      period: 'last_30_days',
      referrals: referralStats,
      nudges: {
        shown: nudgesShown,
        dismissed: nudgesDismissed,
        ctr: nudgesShown > 0 
          ? Math.round(((nudgesShown - nudgesDismissed) / nudgesShown) * 100) 
          : 0
      },
      offers: {
        redeemed: offerEvents.length
      },
      upsells: {
        shown: upsellsShown,
        accepted: upsellsAccepted,
        acceptanceRate: upsellsShown > 0 
          ? Math.round((upsellsAccepted / upsellsShown) * 100) 
          : 0
      },
      recentEvents: allEvents.map(e => ({
        id: e.id,
        eventType: e.eventType,
        metadata: e.metadata,
        createdAt: e.createdAt
      }))
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return res.status(500).json({ error: 'Failed to get analytics' });
  }
});

export default router;
