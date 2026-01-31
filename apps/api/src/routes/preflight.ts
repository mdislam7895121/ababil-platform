import { Router } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

interface PreflightCheck {
  key: string;
  label: string;
  passed: boolean;
  message: string;
  blocking: boolean;
}

router.post('/', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const checks: PreflightCheck[] = [];

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.push({
        key: 'database',
        label: 'Database Connection',
        passed: true,
        message: 'Database is reachable',
        blocking: true
      });
    } catch {
      checks.push({
        key: 'database',
        label: 'Database Connection',
        passed: false,
        message: 'Cannot connect to database. Check DATABASE_URL.',
        blocking: true
      });
    }

    const hasJwt = !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32;
    checks.push({
      key: 'jwt_secret',
      label: 'JWT Secret',
      passed: hasJwt,
      message: hasJwt ? 'JWT secret configured' : 'Missing SESSION_SECRET (need 32+ characters)',
      blocking: true
    });

    const hasEncryption = !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 32;
    checks.push({
      key: 'encryption_key',
      label: 'Encryption Key',
      passed: hasEncryption,
      message: hasEncryption ? 'Encryption key configured' : 'Missing ENCRYPTION_KEY (need exactly 32 characters)',
      blocking: true
    });

    const adminCount = await prisma.membership.count({
      where: { tenantId: req.tenantId!, role: { in: ['owner', 'admin'] } }
    });
    checks.push({
      key: 'admin_user',
      label: 'Admin User',
      passed: adminCount > 0,
      message: adminCount > 0 ? `${adminCount} admin user(s) configured` : 'No admin users found. Add at least one.',
      blocking: true
    });

    const modules = await prisma.moduleFlag.findMany({
      where: { tenantId: req.tenantId!, enabled: true }
    });
    
    for (const module of modules) {
      if (module.key === 'ai_assistant') {
        const hasAI = !!process.env.OPENAI_API_KEY || !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
        if (!hasAI) {
          checks.push({
            key: 'ai_config',
            label: 'AI Configuration',
            passed: false,
            message: 'AI module enabled but no OpenAI API key configured',
            blocking: false
          });
        }
      }
      if (module.key === 'ecommerce') {
        const paymentConfig = await prisma.connectorConfig.findFirst({
          where: { tenantId: req.tenantId!, connectorKey: 'stripe', enabled: true }
        });
        if (!paymentConfig) {
          checks.push({
            key: 'payment_config',
            label: 'Payment Configuration',
            passed: false,
            message: 'Ecommerce enabled but no payment provider configured. Payments will fail.',
            blocking: false
          });
        }
      }
    }

    const blockingFailed = checks.filter(c => c.blocking && !c.passed);
    const canDeploy = blockingFailed.length === 0;

    res.json({
      canDeploy,
      checks,
      blockingIssues: blockingFailed,
      message: canDeploy 
        ? 'All pre-flight checks passed. Ready to deploy!' 
        : `${blockingFailed.length} blocking issue(s) must be fixed before deploy`
    });
  } catch (error) {
    console.error('Preflight check error:', error);
    res.status(500).json({ error: 'Failed to run pre-flight checks' });
  }
});

export { router as preflightRoutes };
