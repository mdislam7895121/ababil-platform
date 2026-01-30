import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';
import { paymentsManualLimiter, paymentsApproveLimiter } from '../middleware/rateLimit.js';
import { createLedgerAccrualForInvoice } from './resellers.js';
import { accruePartnerEarning } from './partners.js';

const router = Router();

const PLAN_PRICES: Record<string, { USD: number; BDT: number }> = {
  pro: { USD: 39, BDT: 4500 },
  business: { USD: 99, BDT: 11500 }
};

const PAYMENT_METHODS = ['bkash', 'nagad', 'rocket', 'bank', 'cash'];

router.post('/manual', paymentsManualLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user?.id;
    
    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Tenant ID and authentication required' });
    }

    const { method, transactionRef, proofImageUrl, plan, amount, currency } = req.body;

    if (!method || !PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({ error: 'Invalid payment method. Must be one of: ' + PAYMENT_METHODS.join(', ') });
    }

    if (!transactionRef || transactionRef.length < 4) {
      return res.status(400).json({ error: 'Transaction reference is required (min 4 characters)' });
    }

    if (!plan || !['pro', 'business'].includes(plan)) {
      return res.status(400).json({ error: 'Plan must be pro or business' });
    }

    const expectedAmount = currency === 'BDT' ? PLAN_PRICES[plan].BDT : PLAN_PRICES[plan].USD;
    const paymentAmount = amount || expectedAmount;
    const paymentCurrency = currency || 'BDT';

    const payment = await prisma.manualPayment.create({
      data: {
        tenantId,
        amount: paymentAmount,
        currency: paymentCurrency,
        method,
        transactionRef,
        proofImageUrl: proofImageUrl || null,
        plan,
        status: 'pending'
      }
    });

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        subscriptionPlan: plan,
        amount: paymentAmount,
        currency: paymentCurrency,
        paymentType: 'manual',
        paymentId: payment.id,
        status: 'pending'
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: userId,
        action: 'manual_payment.submitted',
        entityType: 'ManualPayment',
        entityId: payment.id,
        metadata: { method, plan, amount: paymentAmount, currency: paymentCurrency, transactionRef }
      }
    });

    res.status(201).json({
      payment,
      invoice,
      message: 'Payment submitted. Awaiting admin approval.'
    });
  } catch (error) {
    console.error('Manual payment error:', error);
    res.status(500).json({ error: 'Failed to submit payment' });
  }
});

router.get('/manual/self', async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const payments = await prisma.manualPayment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ payments });
  } catch (error) {
    console.error('Fetch self payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

router.get('/manual/pending', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const payments = await prisma.manualPayment.findMany({
      where: { tenantId, status: 'pending' },
      include: {
        tenant: { select: { name: true, slug: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ payments });
  } catch (error) {
    console.error('Fetch pending payments error:', error);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});

router.get('/manual', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { status } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const where: any = { tenantId };
    if (status && ['pending', 'approved', 'rejected'].includes(status as string)) {
      where.status = status;
    }

    const payments = await prisma.manualPayment.findMany({
      where,
      include: {
        tenant: { select: { name: true, slug: true } },
        approvedBy: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ payments });
  } catch (error) {
    console.error('Fetch payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

router.post('/manual/:id/approve', paymentsApproveLimiter, requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user?.id;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Tenant ID and authentication required' });
    }

    const payment = await prisma.manualPayment.findFirst({
      where: { id, tenantId, status: 'pending' }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found or already processed' });
    }

    const updatedPayment = await prisma.manualPayment.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedById: userId
      }
    });

    await prisma.invoice.updateMany({
      where: { paymentId: id },
      data: { status: 'paid', paidAt: new Date() }
    });

    const paidInvoices = await prisma.invoice.findMany({
      where: { paymentId: id, status: 'paid' }
    });
    for (const inv of paidInvoices) {
      await createLedgerAccrualForInvoice(inv.id);
      await accruePartnerEarning(inv.id, Number(inv.amount), inv.currency);
    }

    const planLimits: Record<string, number> = { pro: 1, business: 5 };
    
    await prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        plan: payment.plan,
        status: 'active',
        liveAppsLimit: planLimits[payment.plan] || 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      update: {
        plan: payment.plan,
        status: 'active',
        liveAppsLimit: planLimits[payment.plan] || 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: payment.plan }
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: userId,
        action: 'manual_payment.approved',
        entityType: 'ManualPayment',
        entityId: id,
        metadata: { plan: payment.plan, amount: payment.amount.toString(), method: payment.method }
      }
    });

    res.json({
      payment: updatedPayment,
      message: 'Payment approved. Subscription activated.'
    });
  } catch (error) {
    console.error('Approve payment error:', error);
    res.status(500).json({ error: 'Failed to approve payment' });
  }
});

router.post('/manual/:id/reject', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user?.id;
    const { id } = req.params;
    const { note } = req.body;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'Tenant ID and authentication required' });
    }

    const payment = await prisma.manualPayment.findFirst({
      where: { id, tenantId, status: 'pending' }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found or already processed' });
    }

    const updatedPayment = await prisma.manualPayment.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionNote: note || 'Payment rejected by admin'
      }
    });

    await prisma.invoice.updateMany({
      where: { paymentId: id },
      data: { status: 'rejected' }
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: userId,
        action: 'manual_payment.rejected',
        entityType: 'ManualPayment',
        entityId: id,
        metadata: { plan: payment.plan, reason: note }
      }
    });

    res.json({
      payment: updatedPayment,
      message: 'Payment rejected.'
    });
  } catch (error) {
    console.error('Reject payment error:', error);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

export { router as paymentsRoutes };
