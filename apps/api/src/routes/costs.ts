import { Router } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

const COST_ESTIMATES = {
  hosting: {
    label: 'Hosting',
    paidTo: 'Your hosting provider',
    estimates: {
      replit: { min: 0, max: 25, note: 'Free tier available, paid starts at $7/mo' },
      render: { min: 0, max: 25, note: 'Free tier available, paid starts at $7/mo' },
      railway: { min: 5, max: 20, note: 'Usage-based pricing' },
      fly: { min: 0, max: 15, note: 'Free tier available' },
      docker: { min: 5, max: 50, note: 'Varies by VPS provider' }
    }
  },
  database: {
    label: 'Database',
    paidTo: 'Your database provider',
    estimates: {
      neon: { min: 0, max: 19, note: 'Free tier: 0.5GB, Pro: $19/mo' },
      supabase: { min: 0, max: 25, note: 'Free tier: 500MB, Pro: $25/mo' },
      planetscale: { min: 0, max: 29, note: 'Free tier available' },
      railway: { min: 5, max: 20, note: 'Usage-based' }
    }
  },
  email: {
    label: 'Email Service',
    paidTo: 'Your email provider',
    estimates: {
      resend: { min: 0, max: 20, note: 'Free: 100 emails/day' },
      sendgrid: { min: 0, max: 20, note: 'Free: 100 emails/day' },
      postmark: { min: 15, max: 35, note: 'Starts at $15/mo' }
    }
  },
  ai: {
    label: 'AI Services',
    paidTo: 'OpenAI / AI Provider',
    estimates: {
      openai: { min: 0, max: 50, note: 'Usage-based, typically $0.002/1K tokens' },
      none: { min: 0, max: 0, note: 'AI features disabled' }
    },
    optional: true
  },
  platform: {
    label: 'Platform Fee',
    paidTo: 'Digital Platform Factory',
    estimates: {
      free: { min: 0, max: 0, note: 'Free tier with limits' },
      starter: { min: 29, max: 29, note: 'Up to 1,000 users' },
      growth: { min: 79, max: 79, note: 'Up to 10,000 users' },
      scale: { min: 199, max: 199, note: 'Unlimited users' }
    }
  }
};

router.get('/', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { plan: true }
    });

    const modules = await prisma.moduleFlag.findMany({
      where: { tenantId: req.tenantId!, enabled: true },
      select: { key: true }
    });

    const enabledModules = modules.map(m => m.key);
    const hasAI = enabledModules.includes('ai_assistant');

    const deployConfig = await prisma.deployConfig.findUnique({
      where: { tenantId: req.tenantId! },
      select: { provider: true }
    });

    const provider = (deployConfig?.provider || 'replit').toLowerCase();

    const breakdown = [
      {
        category: 'hosting',
        label: COST_ESTIMATES.hosting.label,
        paidTo: COST_ESTIMATES.hosting.paidTo,
        estimate: COST_ESTIMATES.hosting.estimates[provider as keyof typeof COST_ESTIMATES.hosting.estimates] || COST_ESTIMATES.hosting.estimates.replit,
        required: true
      },
      {
        category: 'database',
        label: COST_ESTIMATES.database.label,
        paidTo: COST_ESTIMATES.database.paidTo,
        estimate: COST_ESTIMATES.database.estimates.neon,
        required: true
      },
      {
        category: 'email',
        label: COST_ESTIMATES.email.label,
        paidTo: COST_ESTIMATES.email.paidTo,
        estimate: COST_ESTIMATES.email.estimates.resend,
        required: enabledModules.some(m => ['booking', 'ecommerce', 'support'].includes(m))
      },
      {
        category: 'ai',
        label: COST_ESTIMATES.ai.label,
        paidTo: COST_ESTIMATES.ai.paidTo,
        estimate: hasAI ? COST_ESTIMATES.ai.estimates.openai : COST_ESTIMATES.ai.estimates.none,
        required: false,
        enabled: hasAI
      },
      {
        category: 'platform',
        label: COST_ESTIMATES.platform.label,
        paidTo: COST_ESTIMATES.platform.paidTo,
        estimate: COST_ESTIMATES.platform.estimates[tenant?.plan as keyof typeof COST_ESTIMATES.platform.estimates] || COST_ESTIMATES.platform.estimates.free,
        required: true
      }
    ];

    const totalMin = breakdown.filter(b => b.required || b.enabled).reduce((sum, b) => sum + b.estimate.min, 0);
    const totalMax = breakdown.filter(b => b.required || b.enabled).reduce((sum, b) => sum + b.estimate.max, 0);

    res.json({
      breakdown,
      summary: {
        totalMin,
        totalMax,
        currency: 'USD',
        period: 'month',
        note: 'Estimates based on typical usage. Actual costs depend on your providers and usage.'
      },
      context: {
        plan: tenant?.plan || 'free',
        provider: provider,
        enabledModules,
        hasAI
      }
    });
  } catch (error) {
    console.error('Get costs error:', error);
    res.status(500).json({ error: 'Failed to get cost estimates' });
  }
});

export { router as costsRoutes };
