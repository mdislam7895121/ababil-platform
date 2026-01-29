import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Start Next.js as a child process
const startNextJs = () => {
  console.log('Starting Next.js web dashboard on port 3000...');
  const next = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: 'apps/web',
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

// Start Next.js in development mode
if (process.env.NODE_ENV === 'development') {
  startNextJs();
}
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
import { authMiddleware, tenantMiddleware } from './middleware/auth.js';
import { humanizeError } from './lib/errors.js';

export const prisma = new PrismaClient();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Middleware
app.use(cors());
app.use(express.json());

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

// Error handler with human-friendly messages
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message, err.stack);
  
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
});
