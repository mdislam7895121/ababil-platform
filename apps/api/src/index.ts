import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { moduleRoutes } from './routes/modules.js';
import { connectorRoutes } from './routes/connectors.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { auditRoutes } from './routes/audit.js';
import { aiRoutes } from './routes/ai.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { authMiddleware, tenantMiddleware } from './middleware/auth.js';

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 5000;

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

// Auth routes (public)
app.use('/api/auth', authLimiter, authRoutes);

// Protected routes
app.use('/api/users', apiLimiter, authMiddleware, tenantMiddleware, userRoutes);
app.use('/api/modules', apiLimiter, authMiddleware, tenantMiddleware, moduleRoutes);
app.use('/api/connectors', apiLimiter, authMiddleware, tenantMiddleware, connectorRoutes);
app.use('/api/api-keys', apiLimiter, authMiddleware, tenantMiddleware, apiKeyRoutes);
app.use('/api/audit-logs', apiLimiter, authMiddleware, tenantMiddleware, auditRoutes);
app.use('/api/ai', apiLimiter, authMiddleware, tenantMiddleware, aiRoutes);
app.use('/api/dashboard', apiLimiter, authMiddleware, tenantMiddleware, dashboardRoutes);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
