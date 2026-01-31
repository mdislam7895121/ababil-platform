import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const invoices = await prisma.invoice.findMany({
      where: { tenantId },
      include: {
        tenant: { select: { name: true, slug: true } },
        manualPayment: {
          select: { method: true, transactionRef: true, proofImageUrl: true }
        }
      },
      orderBy: { issuedAt: 'desc' }
    });

    res.json({ invoices });
  } catch (error) {
    console.error('Fetch invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/:id', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        tenant: { select: { name: true, slug: true } },
        manualPayment: {
          select: { method: true, transactionRef: true, proofImageUrl: true, approvedAt: true }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice });
  } catch (error) {
    console.error('Fetch invoice error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.get('/:id/pdf', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        tenant: { select: { name: true, slug: true } },
        manualPayment: {
          select: { method: true, transactionRef: true, approvedAt: true }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const planNames: Record<string, string> = {
      pro: 'Pro Plan',
      business: 'Business Plan'
    };

    const invoiceHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.id.slice(0, 8).toUpperCase()}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .logo { font-size: 24px; font-weight: bold; color: #6366f1; }
    .invoice-title { font-size: 32px; color: #6366f1; }
    .info-section { margin-bottom: 30px; }
    .info-row { display: flex; margin-bottom: 8px; }
    .info-label { width: 150px; font-weight: bold; }
    .table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    .table th, .table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    .table th { background: #f5f5f5; }
    .total-row { font-weight: bold; background: #f0f0f0; }
    .status { padding: 4px 12px; border-radius: 4px; display: inline-block; }
    .status-paid { background: #dcfce7; color: #16a34a; }
    .status-pending { background: #fef3c7; color: #d97706; }
    .status-rejected { background: #fee2e2; color: #dc2626; }
    .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Digital Platform Factory</div>
    <div class="invoice-title">INVOICE</div>
  </div>
  
  <div class="info-section">
    <div class="info-row"><span class="info-label">Invoice ID:</span> ${invoice.id.slice(0, 8).toUpperCase()}</div>
    <div class="info-row"><span class="info-label">Date:</span> ${new Date(invoice.issuedAt).toLocaleDateString()}</div>
    <div class="info-row"><span class="info-label">Workspace:</span> ${invoice.tenant?.name}</div>
    <div class="info-row"><span class="info-label">Status:</span> 
      <span class="status status-${invoice.status}">${invoice.status.toUpperCase()}</span>
    </div>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th>Description</th>
        <th>Payment Method</th>
        <th>Reference</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${planNames[invoice.subscriptionPlan] || invoice.subscriptionPlan} - Monthly</td>
        <td>${invoice.paymentType === 'stripe' ? 'Card (Stripe)' : (invoice.manualPayment?.method?.toUpperCase() || 'Manual')}</td>
        <td>${invoice.manualPayment?.transactionRef || invoice.paymentId || '-'}</td>
        <td>${invoice.currency} ${Number(invoice.amount).toFixed(2)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="3" style="text-align: right;">Total</td>
        <td>${invoice.currency} ${Number(invoice.amount).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  ${invoice.paidAt ? `<p>Payment received on: ${new Date(invoice.paidAt).toLocaleDateString()}</p>` : ''}
  
  <div class="footer">
    <p>Thank you for your business!</p>
    <p>Digital Platform Factory - Multi-Tenant SaaS Platform</p>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.id.slice(0, 8)}.html"`);
    res.send(invoiceHtml);
  } catch (error) {
    console.error('Generate invoice PDF error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

export { router as invoicesRoutes };
