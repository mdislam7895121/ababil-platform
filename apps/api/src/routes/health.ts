import { Router } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';
import { isSafeModeActive } from '../lib/safeMode.js';

const router = Router();

interface HealthIssue {
  level: 'critical' | 'warning' | 'info';
  message: string;
  action: string;
  link?: string;
}

async function checkHealth(tenantId: string): Promise<{ status: 'green' | 'yellow' | 'red'; issues: HealthIssue[]; safeMode: boolean }> {
  const issues: HealthIssue[] = [];
  let hasCritical = false;
  let hasWarning = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    issues.push({
      level: 'critical',
      message: 'Database connection failed',
      action: 'Check your DATABASE_URL environment variable',
      link: '/dashboard/setup'
    });
    hasCritical = true;
  }

  const hasJwt = !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32;
  if (!hasJwt) {
    issues.push({
      level: 'critical',
      message: 'JWT secret not configured',
      action: 'Set SESSION_SECRET (32+ characters)',
      link: '/dashboard/setup'
    });
    hasCritical = true;
  }

  const hasEncryption = !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 32;
  if (!hasEncryption) {
    issues.push({
      level: 'critical',
      message: 'Encryption key not configured',
      action: 'Set ENCRYPTION_KEY (exactly 32 characters)',
      link: '/dashboard/setup'
    });
    hasCritical = true;
  }

  const adminCount = await prisma.membership.count({
    where: { tenantId, role: { in: ['owner', 'admin'] } }
  });
  if (adminCount === 0) {
    issues.push({
      level: 'warning',
      message: 'No admin users configured',
      action: 'Add at least one admin user',
      link: '/dashboard/users'
    });
    hasWarning = true;
  }

  const emailConfig = await prisma.connectorConfig.findFirst({
    where: { tenantId, connectorKey: 'email', enabled: true }
  });
  if (!emailConfig) {
    issues.push({
      level: 'info',
      message: 'Email not configured',
      action: 'Users will not receive email notifications',
      link: '/dashboard/connectors'
    });
  }

  const paymentConfig = await prisma.connectorConfig.findFirst({
    where: { tenantId, connectorKey: 'stripe', enabled: true }
  });
  if (!paymentConfig) {
    issues.push({
      level: 'info',
      message: 'Payments not configured',
      action: 'Orders cannot be paid online',
      link: '/dashboard/connectors'
    });
  }

  const globalSafeMode = isSafeModeActive();
  const safeMode = hasCritical || globalSafeMode.active;
  let status: 'green' | 'yellow' | 'red' = 'green';
  if (hasCritical || globalSafeMode.active) status = 'red';
  else if (hasWarning) status = 'yellow';

  return { status, issues, safeMode };
}

router.get('/summary', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res) => {
  try {
    const health = await checkHealth(req.tenantId!);

    await prisma.healthStatus.upsert({
      where: { tenantId: req.tenantId! },
      update: {
        status: health.status,
        message: health.issues.length === 0 ? 'All systems healthy' : `${health.issues.length} issue(s) detected`,
        issues: health.issues
      },
      create: {
        tenantId: req.tenantId!,
        status: health.status,
        message: health.issues.length === 0 ? 'All systems healthy' : `${health.issues.length} issue(s) detected`,
        issues: health.issues
      }
    });

    res.json({
      status: health.status,
      statusLabel: health.status === 'green' ? 'Healthy' : health.status === 'yellow' ? 'Action Required' : 'Critical Issue',
      issues: health.issues,
      safeMode: health.safeMode,
      safeModeMessage: health.safeMode ? 'Safe Mode active - no external actions will run (emails, payments, AI disabled)' : null
    });
  } catch (error) {
    console.error('Health summary error:', error);
    res.status(500).json({ error: 'Failed to get health summary' });
  }
});

router.get('/missing', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res) => {
  try {
    const missing: { item: string; impact: string; priority: 'high' | 'medium' | 'low' }[] = [];

    const emailConfig = await prisma.connectorConfig.findFirst({
      where: { tenantId: req.tenantId!, connectorKey: 'email', enabled: true }
    });
    if (!emailConfig) {
      missing.push({
        item: 'Email Provider',
        impact: 'Users won\'t receive notifications',
        priority: 'medium'
      });
    }

    const paymentConfig = await prisma.connectorConfig.findFirst({
      where: { tenantId: req.tenantId!, connectorKey: 'stripe', enabled: true }
    });
    if (!paymentConfig) {
      missing.push({
        item: 'Payment Provider',
        impact: 'Orders can\'t be paid online',
        priority: 'medium'
      });
    }

    const hasOpenAI = !!process.env.OPENAI_API_KEY || !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const aiModule = await prisma.moduleFlag.findFirst({
      where: { tenantId: req.tenantId!, key: 'ai_assistant', enabled: true }
    });
    if (aiModule && !hasOpenAI) {
      missing.push({
        item: 'OpenAI API Key',
        impact: 'AI features enabled but no API key - will fail',
        priority: 'high'
      });
    }

    const analyticsModule = await prisma.moduleFlag.findFirst({
      where: { tenantId: req.tenantId!, key: 'analytics', enabled: true }
    });
    if (!analyticsModule) {
      missing.push({
        item: 'Analytics Module',
        impact: 'No tracking of user activity',
        priority: 'low'
      });
    }

    res.json({ missing, count: missing.length });
  } catch (error) {
    console.error('Get missing error:', error);
    res.status(500).json({ error: 'Failed to get missing items' });
  }
});

export { router as healthRoutes };
