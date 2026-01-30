import express from 'express';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { securityHeaders, corsMiddleware, permissionsPolicy, bodyLimits, validateJwtSecret } from './middleware/security.js';
import { safeLog, createSafeErrorLog } from './lib/redact.js';

// Start Next.js as a child process
const startNextJs = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const command = isProd ? 'start' : 'dev';
  console.log(`Starting Next.js web dashboard on port 3000 (${isProd ? 'production' : 'development'})...`);
  
  const next = spawn('npx', ['next', command, '-p', '3000'], {
    cwd: isProd ? 'apps/web' : 'apps/web',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });
  
  next.stdout?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[web] ${msg}`);
  });
  
  next.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[web] ${msg}`);
  });
  
  next.on('close', (code) => {
    if (code !== 0) {
      console.error(`[web] Next.js exited with code ${code}, restarting...`);
      setTimeout(startNextJs, 3000);
    }
  });
  
  return next;
};

// Start Next.js in both development and production
startNextJs();
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { moduleRoutes } from './routes/modules.js';
import { connectorRoutes } from './routes/connectors.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { auditRoutes } from './routes/audit.js';
import { aiRoutes } from './routes/ai.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { builderRoutes } from './routes/builder.js';
import { deployRoutes } from './routes/deploy.js';
import { checklistRoutes } from './routes/checklist.js';
import { previewRoutes, previewPublicRoutes } from './routes/preview.js';
import { presetsRoutes } from './routes/presets.js';
import { costsRoutes } from './routes/costs.js';
import { setupRoutes } from './routes/setup.js';
import { envRoutes } from './routes/env.js';
import { healthRoutes } from './routes/health.js';
import { preflightRoutes } from './routes/preflight.js';
import { analyticsRoutes } from './routes/analytics.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { billingRoutes } from './routes/billing.js';
import { revenueRoutes } from './routes/revenue.js';
import { paymentsRoutes } from './routes/payments.js';
import { invoicesRoutes } from './routes/invoices.js';
import i18nRoutes from './routes/i18n.js';
import resellersRoutes from './routes/resellers.js';
import jobsRoutes from './routes/jobs.js';
import exportsRoutes from './routes/exports.js';
import backupsRoutes from './routes/backups.js';
import tenantsRoutes from './routes/tenants.js';
import monitoringRoutes from './routes/monitoring.js';
import supportRoutes from './routes/support.js';
import pushRoutes from './routes/push.js';
import successRoutes from './routes/success.js';
import growthRoutes from './routes/growth.js';
import { authMiddleware, tenantMiddleware } from './middleware/auth.js';
import { humanizeError } from './lib/errors.js';
import { startScheduler } from './jobs/index.js';

export const prisma = new PrismaClient();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Trust proxy for accurate client IP detection behind reverse proxies
app.set('trust proxy', 1);

// Validate JWT secret on startup
validateJwtSecret();

// Security middleware
app.use(securityHeaders);
app.use(permissionsPolicy);
app.use(corsMiddleware);

// Stripe webhook needs raw body - mount BEFORE json parser
import { billingWebhookRouter } from './routes/billing.js';
app.use('/api/billing', express.raw({ type: 'application/json' }), billingWebhookRouter);

// JSON parser with body size limit
app.use(express.json({ limit: bodyLimits.default }));
app.use(express.urlencoded({ extended: true, limit: bodyLimits.default }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts, please try again later' }
});

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later' }
});

// Root health check for deployment (responds immediately, before proxy)
app.get('/', (req, res, next) => {
  // Only respond to health checks (no Accept header or specific user agents)
  const userAgent = req.headers['user-agent'] || '';
  const isHealthCheck = userAgent.includes('health') || 
                        userAgent.includes('curl') || 
                        req.headers['x-health-check'] === 'true' ||
                        !req.headers['accept']?.includes('text/html');
  
  if (isHealthCheck && !req.headers['accept']?.includes('text/html')) {
    return res.json({ status: 'ok', service: 'platform-factory', timestamp: new Date().toISOString() });
  }
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ready check (for deploy verification)
app.get('/api/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', database: 'disconnected' });
  }
});

// Auth routes (public)
app.use('/api/auth', authLimiter, authRoutes);

// Public preview routes (no auth required for viewing previews)
app.use('/api/preview', apiLimiter, previewPublicRoutes);

// Public i18n routes (languages list and translations)
app.use('/api/i18n', apiLimiter, i18nRoutes);

// Public reseller branding lookup (no auth required)
app.get('/api/resellers/branding/lookup', apiLimiter, async (req, res) => {
  const { domain, subdomain, slug } = req.query;
  try {
    let reseller = null;
    if (domain) {
      reseller = await prisma.reseller.findFirst({
        where: { domain: domain as string, status: 'active' },
        select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, secondaryColor: true, showPoweredBy: true },
      });
    }
    if (!reseller && subdomain) {
      reseller = await prisma.reseller.findFirst({
        where: { subdomain: subdomain as string, status: 'active' },
        select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, secondaryColor: true, showPoweredBy: true },
      });
    }
    if (!reseller && slug) {
      reseller = await prisma.reseller.findFirst({
        where: { slug: slug as string, status: 'active' },
        select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, secondaryColor: true, showPoweredBy: true },
      });
    }
    res.json({ branding: reseller, isWhiteLabel: !!reseller });
  } catch (error) {
    res.status(500).json({ error: 'Failed to lookup branding' });
  }
});

// Public billing plans endpoint
app.get('/api/billing/plans', apiLimiter, async (req, res) => {
  res.json({
    plans: [
      { key: 'free', name: 'Free', priceMonthly: 0, liveAppsLimit: 0, features: ['Unlimited Build & Preview', 'Cost Estimates', 'No Go-Live'] },
      { key: 'pro', name: 'Pro', priceMonthly: 39, liveAppsLimit: 1, features: ['1 Live App', 'Full Platform Access', 'Email Support'] },
      { key: 'business', name: 'Business', priceMonthly: 99, liveAppsLimit: 5, features: ['Up to 5 Live Apps', 'Priority Support', 'Custom Branding', 'API Access'] }
    ]
  });
});

// Protected routes
app.use('/api/users', apiLimiter, authMiddleware, tenantMiddleware, userRoutes);
app.use('/api/modules', apiLimiter, authMiddleware, tenantMiddleware, moduleRoutes);
app.use('/api/connectors', apiLimiter, authMiddleware, tenantMiddleware, connectorRoutes);
app.use('/api/api-keys', apiLimiter, authMiddleware, tenantMiddleware, apiKeyRoutes);
app.use('/api/audit-logs', apiLimiter, authMiddleware, tenantMiddleware, auditRoutes);
app.use('/api/ai', apiLimiter, authMiddleware, tenantMiddleware, aiRoutes);
app.use('/api/dashboard', apiLimiter, authMiddleware, tenantMiddleware, dashboardRoutes);
app.use('/api/builder', apiLimiter, authMiddleware, tenantMiddleware, builderRoutes);
app.use('/api/deploy', apiLimiter, authMiddleware, tenantMiddleware, deployRoutes);
app.use('/api/checklist', apiLimiter, authMiddleware, tenantMiddleware, checklistRoutes);
app.use('/api/preview', apiLimiter, authMiddleware, tenantMiddleware, previewRoutes);
app.use('/api/presets', apiLimiter, authMiddleware, tenantMiddleware, presetsRoutes);
app.use('/api/costs', apiLimiter, authMiddleware, tenantMiddleware, costsRoutes);
app.use('/api/setup', apiLimiter, authMiddleware, tenantMiddleware, setupRoutes);
app.use('/api/env', apiLimiter, authMiddleware, tenantMiddleware, envRoutes);
app.use('/api/health/status', apiLimiter, authMiddleware, tenantMiddleware, healthRoutes);
app.use('/api/deploy/preflight', apiLimiter, authMiddleware, tenantMiddleware, preflightRoutes);
app.use('/api/analytics', apiLimiter, authMiddleware, tenantMiddleware, analyticsRoutes);
app.use('/api/onboarding', apiLimiter, authMiddleware, tenantMiddleware, onboardingRoutes);
app.use('/api/billing', apiLimiter, authMiddleware, tenantMiddleware, billingRoutes);
app.use('/api/revenue', apiLimiter, authMiddleware, tenantMiddleware, revenueRoutes);
app.use('/api/payments', apiLimiter, authMiddleware, tenantMiddleware, paymentsRoutes);
app.use('/api/invoices', apiLimiter, authMiddleware, tenantMiddleware, invoicesRoutes);
app.use('/api/resellers', apiLimiter, authMiddleware, tenantMiddleware, resellersRoutes);
app.use('/api/jobs', apiLimiter, authMiddleware, tenantMiddleware, jobsRoutes);
app.use('/api/exports', apiLimiter, authMiddleware, tenantMiddleware, exportsRoutes);
app.use('/api/backups', apiLimiter, authMiddleware, tenantMiddleware, backupsRoutes);
app.use('/api/monitoring', apiLimiter, authMiddleware, tenantMiddleware, monitoringRoutes);
app.use('/api/tenants', apiLimiter, authMiddleware, tenantMiddleware, tenantsRoutes);
app.use('/api/support', apiLimiter, authMiddleware, tenantMiddleware, supportRoutes);
app.use('/api/push', apiLimiter, authMiddleware, tenantMiddleware, pushRoutes);
app.use('/api/success', apiLimiter, authMiddleware, tenantMiddleware, successRoutes);
app.use('/api/growth', apiLimiter, authMiddleware, tenantMiddleware, growthRoutes);

// Error handler with human-friendly messages and safe logging
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const safeError = createSafeErrorLog(err, {
    path: req.path,
    method: req.method,
  });
  safeLog('error', 'Request error', safeError);
  
  const humanError = humanizeError(err);
  res.status(500).json({
    error: humanError.message,
    code: humanError.code,
    action: humanError.action
  });
});

// Proxy non-API routes to Next.js web dashboard (port 3000)
const NEXT_JS_URL = process.env.NEXT_JS_URL || 'http://localhost:3000';
app.use('/', createProxyMiddleware({
  target: NEXT_JS_URL,
  changeOrigin: true,
  ws: true,
  pathFilter: (path: string) => !path.startsWith('/api')
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`Proxying non-API routes to ${NEXT_JS_URL}`);
  
  // Start the job scheduler
  startScheduler();
});
