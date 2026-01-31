import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

const router = Router();
const prisma = new PrismaClient();

const EXPORTS_DIR = path.join(process.cwd(), 'tmp', 'exports');
const EXPORT_EXPIRY_HOURS = 24;

if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

async function createAuditLog(tenantId: string, userId: string, action: string, entityType: string, entityId?: string, metadata?: any) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: userId,
        action,
        entityType,
        entityId,
        metadata
      }
    });
  } catch (e) {}
}

async function generateExportFile(exportJobId: string, tenantId: string) {
  try {
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: { status: 'processing' }
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const memberships = await prisma.membership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, email: true, name: true, status: true, createdAt: true } } }
    });
    const users = memberships.map(m => m.user);
    const moduleFlags = await prisma.moduleFlag.findMany({ where: { tenantId } });
    const connectorConfigs = await prisma.connectorConfig.findMany({
      where: { tenantId },
      select: { id: true, connectorKey: true, enabled: true, createdAt: true, updatedAt: true }
    });
    const invoices = await prisma.invoice.findMany({ where: { tenantId } });
    const manualPayments = await prisma.manualPayment.findMany({
      where: { tenantId },
      select: { id: true, amount: true, currency: true, method: true, plan: true, status: true, createdAt: true, approvedAt: true }
    });
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    const auditLogs = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 1000
    });

    const fileName = `export_${tenantId}_${Date.now()}.zip`;
    const filePath = path.join(EXPORTS_DIR, fileName);
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      archive.pipe(output);

      archive.append(JSON.stringify({ ...tenant, settings: undefined }, null, 2), { name: 'tenant.json' });
      archive.append(JSON.stringify(users, null, 2), { name: 'users.json' });
      archive.append(JSON.stringify(memberships.map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt
      })), null, 2), { name: 'memberships.json' });
      archive.append(JSON.stringify(moduleFlags, null, 2), { name: 'modules.json' });
      archive.append(JSON.stringify(connectorConfigs, null, 2), { name: 'connectors.json' });
      archive.append(JSON.stringify({
        subscription,
        invoices,
        manualPayments
      }, null, 2), { name: 'billing.json' });
      archive.append(JSON.stringify(auditLogs, null, 2), { name: 'audit_logs.json' });

      archive.finalize();
    });

    const stats = fs.statSync(filePath);
    const expiresAt = new Date(Date.now() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000);

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'ready',
        filePath: fileName,
        fileSize: stats.size,
        expiresAt
      }
    });

    return { success: true, filePath: fileName, fileSize: stats.size };
  } catch (error: any) {
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'failed',
        errorMessage: error.message || 'Export failed'
      }
    });
    return { success: false, error: error.message };
  }
}

router.post(
  '/tenant',
  requireRole('owner', 'admin'),
  createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyStrategy: 'tenantUser',
    routeName: 'exports/tenant'
  }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user!.id;

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      if (tenant.deletedAt) {
        return res.status(403).json({ error: 'Cannot export data from deleted workspace' });
      }

      const pendingJob = await prisma.exportJob.findFirst({
        where: {
          tenantId,
          status: { in: ['pending', 'processing'] }
        }
      });

      if (pendingJob) {
        return res.status(409).json({
          error: 'Export already in progress',
          exportJobId: pendingJob.id,
          status: pendingJob.status
        });
      }

      const exportJob = await prisma.exportJob.create({
        data: {
          tenantId,
          status: 'pending',
          format: 'zip'
        }
      });

      await createAuditLog(tenantId, userId, 'DATA_EXPORT_REQUESTED', 'export_job', exportJob.id, {
        format: 'zip'
      });

      generateExportFile(exportJob.id, tenantId).then(async (result) => {
        if (result.success) {
          await createAuditLog(tenantId, userId, 'DATA_EXPORT_READY', 'export_job', exportJob.id, {
            fileSize: result.fileSize
          });
        }
      });

      res.status(202).json({
        message: 'Export started',
        exportJobId: exportJob.id,
        status: 'pending',
        estimatedTime: '1-2 minutes'
      });
    } catch (error: any) {
      console.error('[Exports] Error:', error);
      res.status(500).json({ error: 'Failed to start export' });
    }
  }
);

router.get(
  '/tenant/:id',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { id } = req.params;

      const exportJob = await prisma.exportJob.findFirst({
        where: { id, tenantId }
      });

      if (!exportJob) {
        return res.status(404).json({ error: 'Export job not found' });
      }

      res.json({
        id: exportJob.id,
        status: exportJob.status,
        format: exportJob.format,
        fileSize: exportJob.fileSize,
        expiresAt: exportJob.expiresAt,
        errorMessage: exportJob.errorMessage,
        createdAt: exportJob.createdAt
      });
    } catch (error: any) {
      console.error('[Exports] Status error:', error);
      res.status(500).json({ error: 'Failed to get export status' });
    }
  }
);

router.get(
  '/tenant/:id/download',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { id } = req.params;

      const exportJob = await prisma.exportJob.findFirst({
        where: { id, tenantId }
      });

      if (!exportJob) {
        return res.status(404).json({ error: 'Export job not found' });
      }

      if (exportJob.status !== 'ready') {
        return res.status(400).json({
          error: 'Export not ready',
          status: exportJob.status
        });
      }

      if (exportJob.expiresAt && exportJob.expiresAt < new Date()) {
        await prisma.exportJob.update({
          where: { id },
          data: { status: 'expired' }
        });
        return res.status(410).json({ error: 'Export has expired' });
      }

      const filePath = path.join(EXPORTS_DIR, exportJob.filePath!);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Export file not found' });
      }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${exportJob.filePath}"`);
      res.setHeader('Content-Length', exportJob.fileSize!);

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      console.error('[Exports] Download error:', error);
      res.status(500).json({ error: 'Failed to download export' });
    }
  }
);

router.get(
  '/tenant',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const exportJobs = await prisma.exportJob.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      res.json({ exports: exportJobs });
    } catch (error: any) {
      console.error('[Exports] List error:', error);
      res.status(500).json({ error: 'Failed to list exports' });
    }
  }
);

export default router;
