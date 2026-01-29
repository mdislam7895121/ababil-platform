import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

const PROVIDERS = ['REPLIT', 'RENDER', 'RAILWAY', 'FLY', 'DOCKER'] as const;

const deployConfigInputSchema = z.object({
  provider: z.enum(PROVIDERS),
  appUrl: z.string().url(),
  databaseUrl: z.string().min(1),
  jwtSecret: z.string().min(16)
});

router.get('/config', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const config = await prisma.deployConfig.findUnique({
      where: { tenantId: req.tenantId! }
    });

    if (!config) {
      return res.json({
        configured: false,
        provider: null,
        appUrl: null,
        status: 'draft',
        hasDbUrl: false,
        hasJwtSecret: false,
        hasEncryptionKey: !!process.env.ENCRYPTION_KEY
      });
    }

    res.json({
      configured: true,
      provider: config.provider,
      appUrl: config.appUrl,
      status: config.status,
      hasDbUrl: !!config.dbUrlEncrypted,
      hasJwtSecret: !!config.jwtSecretEncrypted,
      hasEncryptionKey: !!process.env.ENCRYPTION_KEY
    });
  } catch (error) {
    console.error('Get deploy config error:', error);
    res.status(500).json({ error: 'Failed to get deploy config' });
  }
});

router.post('/config', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length !== 32) {
      return res.status(400).json({ 
        error: 'Server ENCRYPTION_KEY not configured or invalid length. Please set a 32-character encryption key.' 
      });
    }

    const parsed = deployConfigInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { provider, appUrl, databaseUrl, jwtSecret } = parsed.data;

    let dbUrlEncrypted: string;
    let jwtSecretEncrypted: string;
    try {
      dbUrlEncrypted = encrypt(databaseUrl);
      jwtSecretEncrypted = encrypt(jwtSecret);
    } catch (encryptError) {
      console.error('Encryption failed:', encryptError);
      return res.status(500).json({ error: 'Failed to encrypt secrets. Check server configuration.' });
    }

    await prisma.deployConfig.upsert({
      where: { tenantId: req.tenantId! },
      update: {
        provider,
        appUrl,
        dbUrlEncrypted,
        jwtSecretEncrypted,
        encryptionKeyRef: 'ENV:ENCRYPTION_KEY',
        status: 'configured'
      },
      create: {
        tenantId: req.tenantId!,
        provider,
        appUrl,
        dbUrlEncrypted,
        jwtSecretEncrypted,
        encryptionKeyRef: 'ENV:ENCRYPTION_KEY',
        status: 'configured'
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'DEPLOY_CONFIG_SAVED',
      entityType: 'deploy_config',
      entityId: req.tenantId,
      metadata: { provider, appUrl: appUrl.replace(/\/\/[^@]*@/, '//***@') }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Save deploy config error:', error);
    res.status(500).json({ error: 'Failed to save deploy config' });
  }
});

router.post('/verify', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const config = await prisma.deployConfig.findUnique({
      where: { tenantId: req.tenantId! }
    });

    if (!config) {
      return res.status(400).json({ error: 'No deploy config found. Please save config first.' });
    }

    if (!config.appUrl) {
      return res.status(400).json({ error: 'App URL not configured' });
    }

    const deployRun = await prisma.deployRun.create({
      data: {
        tenantId: req.tenantId!,
        deployConfigId: config.id,
        status: 'started',
        startedAt: new Date()
      }
    });

    const results: Record<string, { passed: boolean; message: string }> = {};

    const appUrl = config.appUrl.replace(/\/$/, '');
    results['config_saved'] = {
      passed: !!config.dbUrlEncrypted && !!config.jwtSecretEncrypted,
      message: config.dbUrlEncrypted && config.jwtSecretEncrypted 
        ? 'Deploy configuration saved with encrypted secrets'
        : 'Missing encrypted secrets in configuration'
    };
    
    try {
      const healthRes = await fetch(`${appUrl}/api/health`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      const healthData = await healthRes.json().catch(() => ({}));
      results['health_check'] = {
        passed: healthRes.ok && healthData.status === 'ok',
        message: healthRes.ok ? 'Health endpoint OK' : `Health check failed: ${healthRes.status}`
      };
    } catch (healthErr: any) {
      results['health_check'] = { 
        passed: false, 
        message: `Health check error: ${healthErr.message || 'timeout/unreachable'}` 
      };
    }

    try {
      const readyRes = await fetch(`${appUrl}/api/ready`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      const readyData = await readyRes.json().catch(() => ({}));
      results['ready_check'] = {
        passed: readyRes.ok && readyData.database === 'connected',
        message: readyRes.ok && readyData.database === 'connected'
          ? 'Ready endpoint OK - database connected on target deployment'
          : `Ready check failed: ${readyRes.status} ${readyData.database || ''}`
      };
    } catch (readyErr: any) {
      results['ready_check'] = {
        passed: false,
        message: `Ready check error: ${readyErr.message || 'timeout/unreachable'}`
      };
    }

    const allPassed = Object.values(results).every(r => r.passed);
    const status = allPassed ? 'passed' : 'failed';

    await prisma.deployRun.update({
      where: { id: deployRun.id },
      data: {
        status,
        finishedAt: new Date(),
        resultsJson: results
      }
    });

    if (allPassed) {
      await prisma.deployConfig.update({
        where: { tenantId: req.tenantId! },
        data: { status: 'verified' }
      });
    }

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'DEPLOY_VERIFY_RUN',
      entityType: 'deploy_run',
      entityId: deployRun.id,
      metadata: { status, appUrl: config.appUrl }
    });

    res.json({ 
      status, 
      deployRunId: deployRun.id,
      results 
    });
  } catch (error) {
    console.error('Deploy verify error:', error);
    res.status(500).json({ error: 'Failed to run verification' });
  }
});

router.get('/runs', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const runs = await prisma.deployRun.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        resultsJson: true,
        createdAt: true
      }
    });

    res.json(runs);
  } catch (error) {
    console.error('List deploy runs error:', error);
    res.status(500).json({ error: 'Failed to list deploy runs' });
  }
});

router.get('/checklist', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const config = await prisma.deployConfig.findUnique({
      where: { tenantId: req.tenantId! }
    });

    const checklist = {
      provider: config?.provider || 'REPLIT',
      envVars: [
        { key: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string' },
        { key: 'SESSION_SECRET', required: true, description: 'JWT signing secret (32+ chars)' },
        { key: 'ENCRYPTION_KEY', required: true, description: 'AES-256 encryption key (32 chars)' },
        { key: 'OPENAI_API_KEY', required: false, description: 'OpenAI API key for AI features' }
      ],
      migration: 'npx prisma migrate deploy',
      startCommand: 'npm run start',
      verificationUrls: [
        '/api/health',
        '/api/ready',
        '/api/dashboard/stats'
      ],
      status: config?.status || 'draft',
      appUrl: config?.appUrl || null
    };

    res.json(checklist);
  } catch (error) {
    console.error('Get checklist error:', error);
    res.status(500).json({ error: 'Failed to get checklist' });
  }
});

router.post('/go-live', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const config = await prisma.deployConfig.findUnique({
      where: { tenantId: req.tenantId! }
    });

    if (!config) {
      return res.status(400).json({ error: 'No deploy config found. Please save config first.' });
    }

    if (config.status === 'live') {
      return res.json({ ok: true, message: 'Already live' });
    }

    const lastRun = await prisma.deployRun.findFirst({
      where: { tenantId: req.tenantId!, status: 'passed' },
      orderBy: { createdAt: 'desc' }
    });

    if (!lastRun) {
      return res.status(400).json({ error: 'Please run a successful verification first' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: req.tenantId! }
    });

    if (!subscription || subscription.status !== 'active') {
      return res.status(402).json({
        error: 'Subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Go Live requires an active subscription. Subscribe to Pro ($39/mo) or Business ($99/mo) to unlock.',
        guidance: 'Please subscribe to a paid plan to go live with your platform.'
      });
    }

    if (subscription.liveAppsUsed >= subscription.liveAppsLimit) {
      return res.status(402).json({
        error: 'Live app limit reached',
        code: 'LIMIT_REACHED',
        message: `Your ${subscription.plan} plan allows ${subscription.liveAppsLimit} live app(s). Upgrade to Business for more.`,
        guidance: 'Upgrade your subscription to add more live apps.'
      });
    }

    await prisma.$transaction([
      prisma.deployConfig.update({
        where: { tenantId: req.tenantId! },
        data: { status: 'live' }
      }),
      prisma.subscription.update({
        where: { tenantId: req.tenantId! },
        data: { liveAppsUsed: { increment: 1 } }
      })
    ]);

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'GO_LIVE_UNLOCKED',
      entityType: 'tenant',
      entityId: req.tenantId,
      metadata: { appUrl: config.appUrl, plan: subscription.plan }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'TENANT_MARKED_LIVE',
      entityType: 'tenant',
      entityId: req.tenantId,
      metadata: { appUrl: config.appUrl }
    });

    res.json({ ok: true, message: 'Tenant marked as LIVE' });
  } catch (error) {
    console.error('Go live error:', error);
    res.status(500).json({ error: 'Failed to mark as live' });
  }
});

export { router as deployRoutes };
