import { Router } from 'express';
import { prisma } from '../index.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';
import { randomBytes } from 'crypto';

const router = Router();

const SETUP_STEPS = [
  { key: 'database', label: 'Database Connection', required: true, order: 1, description: 'Connect to your database to store app data', howToFix: 'Check your DATABASE_URL environment variable is correct' },
  { key: 'secrets', label: 'Security Secrets', required: true, order: 2, description: 'Set up JWT and encryption keys for secure authentication', howToFix: 'Use the Generate Secrets button to create secure keys' },
  { key: 'email', label: 'Email Provider', required: false, order: 3, description: 'Enable email notifications for users', howToFix: 'Configure an email provider in Connectors' },
  { key: 'payments', label: 'Payment Processing', required: false, order: 4, description: 'Accept payments from customers', howToFix: 'Configure Stripe or another payment provider in Connectors' },
  { key: 'ai', label: 'AI Assistant', required: false, order: 5, description: 'Enable AI-powered features', howToFix: 'Add your OpenAI API key in settings' },
  { key: 'deploy_check', label: 'Deploy Verification', required: true, order: 6, description: 'Verify everything is ready to go live', howToFix: 'Complete all required steps first' }
];

async function initializeSetupSteps(tenantId: string) {
  const existing = await prisma.setupStep.findMany({ where: { tenantId } });
  if (existing.length === 0) {
    await prisma.setupStep.createMany({
      data: SETUP_STEPS.map(step => ({
        tenantId,
        key: step.key,
        status: 'pending'
      }))
    });
  }
}

async function verifyStep(tenantId: string, key: string): Promise<{ passed: boolean; message: string }> {
  switch (key) {
    case 'database': {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { passed: true, message: 'Database connection successful' };
      } catch {
        return { passed: false, message: 'Cannot connect to database. Check DATABASE_URL.' };
      }
    }
    case 'secrets': {
      const hasJwt = !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32;
      const hasEncryption = !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 32;
      if (hasJwt && hasEncryption) {
        return { passed: true, message: 'Security secrets configured' };
      }
      const missing = [];
      if (!hasJwt) missing.push('SESSION_SECRET (32+ chars)');
      if (!hasEncryption) missing.push('ENCRYPTION_KEY (32 chars)');
      return { passed: false, message: `Missing: ${missing.join(', ')}` };
    }
    case 'email': {
      const emailConfig = await prisma.connectorConfig.findFirst({
        where: { tenantId, connectorKey: 'email', enabled: true }
      });
      if (emailConfig) {
        return { passed: true, message: 'Email provider configured' };
      }
      return { passed: false, message: 'No email provider configured (optional)' };
    }
    case 'payments': {
      const paymentConfig = await prisma.connectorConfig.findFirst({
        where: { tenantId, connectorKey: 'stripe', enabled: true }
      });
      if (paymentConfig) {
        return { passed: true, message: 'Payment provider configured' };
      }
      return { passed: false, message: 'No payment provider configured (optional)' };
    }
    case 'ai': {
      const hasOpenAI = !!process.env.OPENAI_API_KEY || !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const aiModule = await prisma.moduleFlag.findFirst({
        where: { tenantId, key: 'ai_assistant', enabled: true }
      });
      if (hasOpenAI && aiModule) {
        return { passed: true, message: 'AI assistant enabled' };
      }
      if (!hasOpenAI) {
        return { passed: false, message: 'No OpenAI API key configured (optional)' };
      }
      return { passed: false, message: 'AI module not enabled (optional)' };
    }
    case 'deploy_check': {
      const steps = await prisma.setupStep.findMany({ where: { tenantId } });
      const requiredSteps = SETUP_STEPS.filter(s => s.required && s.key !== 'deploy_check');
      const passedRequired = requiredSteps.every(rs => {
        const step = steps.find(s => s.key === rs.key);
        return step?.status === 'passed';
      });
      if (passedRequired) {
        return { passed: true, message: 'Ready to deploy' };
      }
      return { passed: false, message: 'Complete all required steps first' };
    }
    default:
      return { passed: false, message: 'Unknown step' };
  }
}

router.get('/state', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    await initializeSetupSteps(req.tenantId!);
    
    const steps = await prisma.setupStep.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { key: 'asc' }
    });

    const stepsWithMeta = SETUP_STEPS.map(meta => {
      const step = steps.find(s => s.key === meta.key);
      return {
        ...meta,
        status: step?.status || 'pending',
        message: step?.message || null,
        lastCheckedAt: step?.lastCheckedAt || null
      };
    }).sort((a, b) => a.order - b.order);

    const completed = stepsWithMeta.filter(s => s.status === 'passed').length;
    const total = stepsWithMeta.length;
    const requiredPending = stepsWithMeta.filter(s => s.required && s.status !== 'passed');
    const isComplete = requiredPending.length === 0;

    res.json({
      steps: stepsWithMeta,
      progress: { completed, total, percentage: Math.round((completed / total) * 100) },
      requiredPending,
      isComplete,
      canDeploy: isComplete
    });
  } catch (error) {
    console.error('Get setup state error:', error);
    res.status(500).json({ error: 'Failed to get setup state' });
  }
});

router.post('/step/:key/verify', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;
    const stepMeta = SETUP_STEPS.find(s => s.key === key);
    
    if (!stepMeta) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const result = await verifyStep(req.tenantId!, key);
    
    await prisma.setupStep.upsert({
      where: { tenantId_key: { tenantId: req.tenantId!, key } },
      update: {
        status: result.passed ? 'passed' : 'failed',
        message: result.message,
        lastCheckedAt: new Date()
      },
      create: {
        tenantId: req.tenantId!,
        key,
        status: result.passed ? 'passed' : 'failed',
        message: result.message,
        lastCheckedAt: new Date()
      }
    });

    res.json({
      key,
      ...result,
      howToFix: result.passed ? null : stepMeta.howToFix
    });
  } catch (error) {
    console.error('Verify step error:', error);
    res.status(500).json({ error: 'Failed to verify step' });
  }
});

router.post('/step/:key/complete', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;
    const stepMeta = SETUP_STEPS.find(s => s.key === key);
    
    if (!stepMeta) {
      return res.status(404).json({ error: 'Step not found' });
    }

    await prisma.setupStep.upsert({
      where: { tenantId_key: { tenantId: req.tenantId!, key } },
      update: { status: 'passed', message: 'Marked complete', lastCheckedAt: new Date() },
      create: { tenantId: req.tenantId!, key, status: 'passed', message: 'Marked complete', lastCheckedAt: new Date() }
    });

    res.json({ ok: true, key, status: 'passed' });
  } catch (error) {
    console.error('Complete step error:', error);
    res.status(500).json({ error: 'Failed to complete step' });
  }
});

router.post('/verify-all', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    await initializeSetupSteps(req.tenantId!);
    
    const results = [];
    for (const step of SETUP_STEPS) {
      const result = await verifyStep(req.tenantId!, step.key);
      await prisma.setupStep.upsert({
        where: { tenantId_key: { tenantId: req.tenantId!, key: step.key } },
        update: { status: result.passed ? 'passed' : 'failed', message: result.message, lastCheckedAt: new Date() },
        create: { tenantId: req.tenantId!, key: step.key, status: result.passed ? 'passed' : 'failed', message: result.message, lastCheckedAt: new Date() }
      });
      results.push({ key: step.key, ...result });
    }

    const allRequiredPassed = SETUP_STEPS.filter(s => s.required).every(s => {
      const r = results.find(r => r.key === s.key);
      return r?.passed;
    });

    res.json({ results, allRequiredPassed });
  } catch (error) {
    console.error('Verify all error:', error);
    res.status(500).json({ error: 'Failed to verify all steps' });
  }
});

export { router as setupRoutes };
