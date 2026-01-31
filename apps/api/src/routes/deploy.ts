import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

const router = Router();

const verifyRateLimits = new Map<string, { count: number; resetAt: number }>();
const VERIFY_LIMIT = 30;
const VERIFY_WINDOW_MS = 60 * 60 * 1000;

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

    // Check that the MOST RECENT verification run is a PASS
    const lastVerify = await prisma.deployVerificationRun.findFirst({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' }
    });

    if (!lastVerify) {
      return res.status(400).json({ error: 'Please run a remote verification first' });
    }

    if (lastVerify.status !== 'pass') {
      return res.status(400).json({ error: 'Last verification failed. Please run a successful verification before going live.' });
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

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'GO_LIVE_COMPLETED',
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

// ============== DEPLOY PACKS ==============

const packGenerateSchema = z.object({
  provider: z.enum(['render', 'railway', 'fly', 'docker']),
  appName: z.string().min(1).max(100),
  appUrl: z.string().url().optional()
});

function generateRenderYaml(appName: string): string {
  return `# Render Blueprint - ${appName}
services:
  - type: web
    name: ${appName}-api
    env: node
    plan: starter
    buildCommand: npm install && cd apps/api && npx prisma generate && npm run build
    startCommand: cd apps/api && npm run start
    healthCheckPath: /api/health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: ${appName}-db
          property: connectionString
      - key: SESSION_SECRET
        generateValue: true
      - key: ENCRYPTION_KEY
        generateValue: true
      - key: NODE_ENV
        value: production

  - type: web
    name: ${appName}-web
    env: node
    plan: starter
    buildCommand: npm install && cd apps/web && npm run build
    startCommand: cd apps/web && npm run start
    envVars:
      - key: NEXT_PUBLIC_API_URL
        value: https://${appName}-api.onrender.com

databases:
  - name: ${appName}-db
    plan: starter
    ipAllowList: []
`;
}

function generateRailwayJson(appName: string): string {
  return JSON.stringify({
    "$schema": "https://railway.app/railway.schema.json",
    "build": { "builder": "NIXPACKS" },
    "deploy": {
      "startCommand": "cd apps/api && npm run start",
      "healthcheckPath": "/api/health",
      "restartPolicyType": "ON_FAILURE"
    }
  }, null, 2);
}

function generateFlyToml(appName: string): string {
  return `# Fly.io configuration - ${appName}
app = "${appName}"
primary_region = "iad"

[build]
  builder = "heroku/buildpacks:20"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/api/health"
  timeout = "5s"
`;
}

function generateDockerCompose(appName: string): string {
  return `version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=\${DATABASE_URL}
      - SESSION_SECRET=\${SESSION_SECRET}
      - ENCRYPTION_KEY=\${ENCRYPTION_KEY}
      - NODE_ENV=production
    depends_on:
      - db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://api:5000
    depends_on:
      - api

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=\${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_DB=\${POSTGRES_DB:-platform}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
`;
}

function generateEnvExample(): string {
  return `# Required Environment Variables
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
SESSION_SECRET=your-32-character-secret-here-min
ENCRYPTION_KEY=your-32-character-encryption-key

# Optional
OPENAI_API_KEY=sk-your-openai-key
NODE_ENV=production
`;
}

function generateDeploySteps(provider: string, appName: string): string {
  const steps: Record<string, string> = {
    render: `# Deploy Steps for Render

## 1. Connect Repository
- Go to https://dashboard.render.com
- Click "New" > "Blueprint"
- Connect your GitHub/GitLab repository
- Select the render.yaml file

## 2. Configure Environment
- Render will auto-provision the database
- SESSION_SECRET and ENCRYPTION_KEY are auto-generated
- Add OPENAI_API_KEY if using AI features

## 3. Deploy
- Click "Apply" to deploy all services
- Wait for build and health checks to pass

## 4. Verify
- Visit https://${appName}-api.onrender.com/api/health
- Visit https://${appName}-web.onrender.com
`,
    railway: `# Deploy Steps for Railway

## 1. Create Project
- Go to https://railway.app/new
- Connect your GitHub repository
- Railway auto-detects the Nixpacks build

## 2. Add PostgreSQL
- Click "New" > "Database" > "PostgreSQL"
- Copy the DATABASE_URL to your service

## 3. Set Environment Variables
- SESSION_SECRET: Generate 32+ random chars
- ENCRYPTION_KEY: Generate 32 random chars
- DATABASE_URL: Auto-linked from PostgreSQL

## 4. Deploy
- Click "Deploy" or push to your main branch
- Wait for the build to complete

## 5. Verify
- Check the deployment logs
- Visit your-app.railway.app/api/health
`,
    fly: `# Deploy Steps for Fly.io

## 1. Install Fly CLI
\`\`\`bash
curl -L https://fly.io/install.sh | sh
fly auth login
\`\`\`

## 2. Launch App
\`\`\`bash
fly launch --name ${appName}
\`\`\`

## 3. Create PostgreSQL
\`\`\`bash
fly postgres create --name ${appName}-db
fly postgres attach ${appName}-db
\`\`\`

## 4. Set Secrets
\`\`\`bash
fly secrets set SESSION_SECRET=$(openssl rand -hex 16)
fly secrets set ENCRYPTION_KEY=$(openssl rand -hex 16)
\`\`\`

## 5. Deploy
\`\`\`bash
fly deploy
\`\`\`

## 6. Verify
\`\`\`bash
fly status
curl https://${appName}.fly.dev/api/health
\`\`\`
`,
    docker: `# Deploy Steps for Docker

## 1. Build Images
\`\`\`bash
docker-compose build
\`\`\`

## 2. Configure .env
Copy .env.example to .env and fill in values:
- DATABASE_URL (or use the bundled PostgreSQL)
- SESSION_SECRET (32+ chars)
- ENCRYPTION_KEY (32 chars)

## 3. Start Services
\`\`\`bash
docker-compose up -d
\`\`\`

## 4. Run Migrations
\`\`\`bash
docker-compose exec api npx prisma migrate deploy
\`\`\`

## 5. Verify
\`\`\`bash
curl http://localhost:5000/api/health
curl http://localhost:3000
\`\`\`
`
  };
  return steps[provider] || steps.docker;
}

function generatePostDeployCheck(): string {
  return `# Post-Deploy Verification Checklist

## Automatic Checks (run by platform)
1. **Health Check**: GET /api/health → status: ok
2. **Ready Check**: GET /api/ready → database: connected
3. **Web Accessibility**: GET / → HTTP 200

## Manual Verification
- [ ] Admin login works
- [ ] Dashboard loads correctly
- [ ] API responds to authenticated requests
- [ ] Database migrations applied successfully

## Troubleshooting
| Issue | Solution |
|-------|----------|
| Health check fails | Check DATABASE_URL is correct |
| 500 errors | Check logs for ENCRYPTION_KEY issues |
| Auth fails | Verify SESSION_SECRET is set |
| API unreachable | Check CORS and firewall settings |
`;
}

router.post('/packs/generate', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = packGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { provider, appName, appUrl } = parsed.data;

    const pack = await prisma.deployPack.create({
      data: {
        tenantId: req.tenantId!,
        provider,
        appName,
        appUrl,
        status: 'generating'
      }
    });

    const packDir = `/tmp/deploy-packs/${pack.id}`;
    fs.mkdirSync(packDir, { recursive: true });

    if (provider === 'render') {
      fs.writeFileSync(path.join(packDir, 'render.yaml'), generateRenderYaml(appName));
    } else if (provider === 'railway') {
      fs.writeFileSync(path.join(packDir, 'railway.json'), generateRailwayJson(appName));
    } else if (provider === 'fly') {
      fs.writeFileSync(path.join(packDir, 'fly.toml'), generateFlyToml(appName));
    } else if (provider === 'docker') {
      fs.writeFileSync(path.join(packDir, 'docker-compose.yml'), generateDockerCompose(appName));
      fs.writeFileSync(path.join(packDir, 'Dockerfile.api'), `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN cd apps/api && npx prisma generate
EXPOSE 5000
CMD ["npm", "run", "start:api"]
`);
    }

    fs.writeFileSync(path.join(packDir, '.env.example'), generateEnvExample());
    fs.writeFileSync(path.join(packDir, 'DEPLOY_STEPS.md'), generateDeploySteps(provider, appName));
    fs.writeFileSync(path.join(packDir, 'POST_DEPLOY_CHECK.md'), generatePostDeployCheck());

    const zipPath = `/tmp/deploy-packs/${pack.id}.zip`;
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(packDir, false);
      archive.finalize();
    });

    await prisma.deployPack.update({
      where: { id: pack.id },
      data: {
        status: 'ready',
        packPath: zipPath,
        downloadUrl: `/api/deploy/packs/${pack.id}/download`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'DEPLOY_PACK_GENERATED',
      entityType: 'deploy_pack',
      entityId: pack.id,
      metadata: { provider, appName }
    });

    res.json({
      packId: pack.id,
      status: 'ready',
      downloadUrl: `/api/deploy/packs/${pack.id}/download`,
      provider,
      appName
    });
  } catch (error) {
    console.error('Generate pack error:', error);
    res.status(500).json({ error: 'Failed to generate deploy pack' });
  }
});

router.get('/packs/:id/download', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const pack = await prisma.deployPack.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! }
    });

    if (!pack) {
      return res.status(404).json({ error: 'Pack not found' });
    }

    if (pack.status !== 'ready' || !pack.packPath) {
      return res.status(400).json({ error: 'Pack not ready for download' });
    }

    if (pack.expiresAt && pack.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Pack has expired' });
    }

    if (!fs.existsSync(pack.packPath)) {
      return res.status(404).json({ error: 'Pack file not found on server' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${pack.appName}-${pack.provider}-deploy.zip"`);
    fs.createReadStream(pack.packPath).pipe(res);
  } catch (error) {
    console.error('Download pack error:', error);
    res.status(500).json({ error: 'Failed to download pack' });
  }
});

router.get('/packs', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const packs = await prisma.deployPack.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json({ packs });
  } catch (error) {
    console.error('List packs error:', error);
    res.status(500).json({ error: 'Failed to list packs' });
  }
});

// ============== REMOTE VERIFICATION ==============

router.post('/verify/run', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const now = Date.now();
    const limit = verifyRateLimits.get(tenantId);

    if (limit) {
      if (now < limit.resetAt) {
        if (limit.count >= VERIFY_LIMIT) {
          return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((limit.resetAt - now) / 1000),
            message: `Maximum ${VERIFY_LIMIT} verifications per hour. Try again later.`
          });
        }
        limit.count++;
      } else {
        verifyRateLimits.set(tenantId, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
      }
    } else {
      verifyRateLimits.set(tenantId, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
    }

    const { appUrl } = req.body;
    if (!appUrl || typeof appUrl !== 'string') {
      return res.status(400).json({ error: 'appUrl is required' });
    }

    const baseUrl = appUrl.replace(/\/$/, '');
    const checks: Array<{ name: string; passed: boolean; message: string }> = [];
    let guidance = '';

    try {
      const healthRes = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      const healthData = await healthRes.json().catch(() => ({}));
      checks.push({
        name: 'health_endpoint',
        passed: healthRes.ok && healthData.status === 'ok',
        message: healthRes.ok ? 'Health endpoint responding' : `Health failed: ${healthRes.status}`
      });
    } catch (e: any) {
      checks.push({
        name: 'health_endpoint',
        passed: false,
        message: `Health unreachable: ${e.message}`
      });
      guidance += 'Health endpoint is unreachable. Check if the app is deployed and running. ';
    }

    try {
      const readyRes = await fetch(`${baseUrl}/api/ready`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      const readyData = await readyRes.json().catch(() => ({}));
      checks.push({
        name: 'ready_endpoint',
        passed: readyRes.ok && readyData.database === 'connected',
        message: readyRes.ok && readyData.database === 'connected'
          ? 'Ready endpoint OK - database connected'
          : `Ready failed: ${readyData.database || 'unknown'}`
      });
      if (!readyData.database || readyData.database !== 'connected') {
        guidance += 'Database not connected. Verify DATABASE_URL is correct. ';
      }
    } catch (e: any) {
      checks.push({
        name: 'ready_endpoint',
        passed: false,
        message: `Ready unreachable: ${e.message}`
      });
    }

    try {
      const webRes = await fetch(baseUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      checks.push({
        name: 'web_accessible',
        passed: webRes.ok,
        message: webRes.ok ? 'Web frontend accessible' : `Web failed: ${webRes.status}`
      });
    } catch (e: any) {
      checks.push({
        name: 'web_accessible',
        passed: false,
        message: `Web unreachable: ${e.message}`
      });
    }

    const allPassed = checks.every(c => c.passed);
    const status = allPassed ? 'pass' : 'fail';

    if (allPassed) {
      guidance = 'All checks passed! Your application is ready for go-live.';
    } else if (!guidance) {
      guidance = 'Some checks failed. Review the results above and fix any issues before going live.';
    }

    const run = await prisma.deployVerificationRun.create({
      data: {
        tenantId,
        appUrl: baseUrl,
        status,
        checks,
        guidance
      }
    });

    await logAudit({
      tenantId,
      actorUserId: req.userId,
      action: 'DEPLOY_VERIFY_RUN',
      entityType: 'deploy_verification_run',
      entityId: run.id,
      metadata: { appUrl: baseUrl, status }
    });

    res.json({
      id: run.id,
      status,
      checks,
      guidance,
      createdAt: run.createdAt
    });
  } catch (error) {
    console.error('Remote verify error:', error);
    res.status(500).json({ error: 'Failed to run verification' });
  }
});

router.get('/verify/runs', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const runs = await prisma.deployVerificationRun.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    res.json({ runs });
  } catch (error) {
    console.error('List verify runs error:', error);
    res.status(500).json({ error: 'Failed to list verification runs' });
  }
});

// ============== PREFLIGHT WITH AUTO-FIX SUGGESTIONS ==============

router.get('/preflight', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const checks: Array<{ key: string; status: 'pass' | 'fail' | 'warn'; message: string; fix?: string }> = [];

    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
      checks.push({ key: 'session_secret', status: 'pass', message: 'SESSION_SECRET configured' });
    } else {
      checks.push({
        key: 'session_secret',
        status: 'fail',
        message: 'SESSION_SECRET missing or too short',
        fix: 'Generate with: openssl rand -hex 16'
      });
    }

    if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 32) {
      checks.push({ key: 'encryption_key', status: 'pass', message: 'ENCRYPTION_KEY configured' });
    } else {
      checks.push({
        key: 'encryption_key',
        status: 'fail',
        message: 'ENCRYPTION_KEY missing or wrong length (need 32 chars)',
        fix: 'Generate with: openssl rand -hex 16'
      });
    }

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.push({ key: 'database', status: 'pass', message: 'Database connected' });
    } catch {
      checks.push({
        key: 'database',
        status: 'fail',
        message: 'Database unreachable',
        fix: 'Check DATABASE_URL environment variable'
      });
    }

    const adminUser = await prisma.user.findFirst({
      where: {
        memberships: { some: { role: 'owner' } }
      }
    });
    if (adminUser) {
      checks.push({ key: 'admin_user', status: 'pass', message: 'Admin user exists' });
    } else {
      checks.push({
        key: 'admin_user',
        status: 'warn',
        message: 'No owner-level user found',
        fix: 'Run: npm run seed'
      });
    }

    const config = await prisma.deployConfig.findUnique({
      where: { tenantId: req.tenantId! }
    });
    if (config?.appUrl) {
      checks.push({ key: 'app_url', status: 'pass', message: `App URL: ${config.appUrl}` });
    } else {
      checks.push({
        key: 'app_url',
        status: 'warn',
        message: 'App URL not configured',
        fix: 'Set in Deploy Wizard settings'
      });
    }

    const allPass = checks.every(c => c.status !== 'fail');
    const hasWarnings = checks.some(c => c.status === 'warn');

    res.json({
      ready: allPass,
      hasWarnings,
      checks,
      canGoLive: allPass
    });
  } catch (error) {
    console.error('Preflight check error:', error);
    res.status(500).json({ error: 'Failed to run preflight checks' });
  }
});

export { router as deployRoutes };
