import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '../index.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';
import { billingCheckoutLimiter } from '../middleware/rateLimit.js';

const router = Router();

const PLANS = {
  pro: {
    name: 'Pro',
    priceMonthly: 39,
    liveAppsLimit: 1,
    features: ['1 Live App', 'Full Platform Access', 'Email Support']
  },
  business: {
    name: 'Business',
    priceMonthly: 99,
    liveAppsLimit: 5,
    features: ['Up to 5 Live Apps', 'Priority Support', 'Custom Branding', 'API Access']
  }
};

const STRIPE_PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
  business: process.env.STRIPE_PRICE_BUSINESS || 'price_business_placeholder'
};

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2024-11-20.acacia' as any });
}

router.get('/plans', async (_req: Request, res: Response) => {
  res.json({
    plans: [
      { key: 'free', name: 'Free', priceMonthly: 0, liveAppsLimit: 0, features: ['Unlimited Build & Preview', 'Cost Estimates', 'No Go-Live'] },
      { key: 'pro', ...PLANS.pro },
      { key: 'business', ...PLANS.business }
    ]
  });
});

router.get('/status', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: req.tenantId! }
    });

    if (!subscription || subscription.status !== 'active') {
      return res.json({
        plan: 'free',
        status: 'inactive',
        canGoLive: false,
        liveAppsLimit: 0,
        liveAppsUsed: 0,
        message: 'Subscribe to unlock Go-Live'
      });
    }

    const canGoLive = subscription.liveAppsUsed < subscription.liveAppsLimit;

    res.json({
      plan: subscription.plan,
      status: subscription.status,
      canGoLive,
      liveAppsLimit: subscription.liveAppsLimit,
      liveAppsUsed: subscription.liveAppsUsed,
      currentPeriodEnd: subscription.currentPeriodEnd,
      message: canGoLive ? 'Ready to Go Live' : 'Live app limit reached'
    });
  } catch (error) {
    console.error('Get billing status error:', error);
    res.status(500).json({ error: 'Failed to get billing status' });
  }
});

const checkoutSchema = z.object({
  planId: z.enum(['pro', 'business'])
});

router.post('/checkout', billingCheckoutLimiter, requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid plan', details: parsed.error.flatten() });
    }

    const { planId } = parsed.data;
    const stripe = getStripe();

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Payment system not configured',
        guidance: 'Please set up STRIPE_SECRET_KEY in your environment variables'
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      include: { subscription: true }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    let customerId = tenant.subscription?.stripeCustomerId;

    if (!customerId) {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        name: tenant.name,
        metadata: { tenantId: tenant.id }
      });
      customerId = customer.id;

      await prisma.subscription.upsert({
        where: { tenantId: tenant.id },
        update: { stripeCustomerId: customerId },
        create: {
          tenantId: tenant.id,
          stripeCustomerId: customerId,
          plan: 'free',
          status: 'inactive',
          liveAppsLimit: 0
        }
      });
    }

    const priceId = STRIPE_PRICE_IDS[planId];
    const successUrl = `${process.env.WEB_URL || 'http://localhost:3000'}/dashboard/deploy?payment=success`;
    const cancelUrl = `${process.env.WEB_URL || 'http://localhost:3000'}/dashboard/deploy?payment=canceled`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tenantId: tenant.id, planId }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'CHECKOUT_INITIATED',
      entityType: 'subscription',
      entityId: session.id,
      metadata: { planId, sessionId: session.id }
    });

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      guidance: error.message 
    });
  }
});

router.post('/simulate-payment', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const { planId } = parsed.data;
    const plan = PLANS[planId];

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.subscription.upsert({
      where: { tenantId: req.tenantId! },
      update: {
        plan: planId,
        status: 'active',
        liveAppsLimit: plan.liveAppsLimit,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd
      },
      create: {
        tenantId: req.tenantId!,
        plan: planId,
        status: 'active',
        liveAppsLimit: plan.liveAppsLimit,
        liveAppsUsed: 0,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'SUBSCRIPTION_STARTED',
      entityType: 'subscription',
      entityId: req.tenantId,
      metadata: { plan: planId, simulated: true }
    });

    res.json({
      ok: true,
      plan: planId,
      status: 'active',
      liveAppsLimit: plan.liveAppsLimit,
      message: `Subscription activated! You can now go live with ${plan.liveAppsLimit} app(s).`
    });
  } catch (error) {
    console.error('Simulate payment error:', error);
    res.status(500).json({ error: 'Failed to simulate payment' });
  }
});

export const billingWebhookRouter = Router();

billingWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('STRIPE_WEBHOOK_SECRET not set');
    return res.status(400).json({ error: 'Webhook secret not configured' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId;
        const planId = session.metadata?.planId as 'pro' | 'business';

        if (!tenantId || !planId) break;

        const plan = PLANS[planId];
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

        await prisma.subscription.update({
          where: { tenantId },
          data: {
            stripeSubscriptionId: subscription.id,
            plan: planId,
            status: 'active',
            liveAppsLimit: plan.liveAppsLimit,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000)
          }
        });

        await logAudit({
          tenantId,
          actorUserId: null,
          action: 'SUBSCRIPTION_STARTED',
          entityType: 'subscription',
          entityId: subscription.id,
          metadata: { plan: planId, subscriptionId: subscription.id }
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscription.id }
        });

        if (existing) {
          let status = 'active';
          if (subscription.status === 'past_due') status = 'past_due';
          if (subscription.status === 'canceled') status = 'canceled';
          if (subscription.status === 'unpaid') status = 'inactive';

          await prisma.subscription.update({
            where: { id: existing.id },
            data: {
              status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000)
            }
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscription.id }
        });

        if (existing) {
          await prisma.subscription.update({
            where: { id: existing.id },
            data: {
              status: 'canceled',
              canceledAt: new Date()
            }
          });

          await logAudit({
            tenantId: existing.tenantId,
            actorUserId: null,
            action: 'SUBSCRIPTION_CANCELED',
            entityType: 'subscription',
            entityId: subscription.id,
            metadata: { subscriptionId: subscription.id }
          });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export { router as billingRoutes };
