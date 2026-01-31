import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();
const prisma = new PrismaClient();

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

async function countTenantData(tenantId: string) {
  const [
    users,
    memberships,
    moduleFlags,
    connectorConfigs,
    apiKeys,
    auditLogs,
    invoices,
    manualPayments,
    builderRequests,
    blueprints,
    previewSessions
  ] = await Promise.all([
    prisma.membership.count({ where: { tenantId } }),
    prisma.membership.count({ where: { tenantId } }),
    prisma.moduleFlag.count({ where: { tenantId } }),
    prisma.connectorConfig.count({ where: { tenantId } }),
    prisma.apiKey.count({ where: { tenantId } }),
    prisma.auditLog.count({ where: { tenantId } }),
    prisma.invoice.count({ where: { tenantId } }),
    prisma.manualPayment.count({ where: { tenantId } }),
    prisma.builderRequest.count({ where: { tenantId } }),
    prisma.blueprint.count({ where: { tenantId } }),
    prisma.previewSession.count({ where: { tenantId } })
  ]);

  return {
    users,
    memberships,
    moduleFlags,
    connectorConfigs,
    apiKeys,
    auditLogs,
    invoices,
    manualPayments,
    builderRequests,
    blueprints,
    previewSessions
  };
}

router.post(
  '/snapshot',
  requireRole('owner', 'admin'),
  createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyStrategy: 'tenantUser',
    routeName: 'backups/snapshot'
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
        return res.status(403).json({ error: 'Cannot create backup for deleted workspace' });
      }

      const counts = await countTenantData(tenantId);

      const snapshot = await prisma.backupSnapshot.create({
        data: {
          tenantId,
          type: 'manual',
          counts,
          metadata: {
            triggeredBy: userId,
            tenantName: tenant.name,
            tenantPlan: tenant.plan
          }
        }
      });

      await createAuditLog(tenantId, userId, 'BACKUP_SNAPSHOT_CREATED', 'backup_snapshot', snapshot.id, {
        type: 'manual',
        counts
      });

      res.status(201).json({
        message: 'Backup snapshot created',
        snapshot: {
          id: snapshot.id,
          type: snapshot.type,
          counts: snapshot.counts,
          createdAt: snapshot.createdAt
        }
      });
    } catch (error: any) {
      console.error('[Backups] Snapshot error:', error);
      res.status(500).json({ error: 'Failed to create backup snapshot' });
    }
  }
);

router.get(
  '/snapshots',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const snapshots = await prisma.backupSnapshot.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20
      });

      res.json({ snapshots });
    } catch (error: any) {
      console.error('[Backups] List error:', error);
      res.status(500).json({ error: 'Failed to list snapshots' });
    }
  }
);

router.get(
  '/snapshots/:id',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { id } = req.params;

      const snapshot = await prisma.backupSnapshot.findFirst({
        where: { id, tenantId }
      });

      if (!snapshot) {
        return res.status(404).json({ error: 'Snapshot not found' });
      }

      res.json({ snapshot });
    } catch (error: any) {
      console.error('[Backups] Get error:', error);
      res.status(500).json({ error: 'Failed to get snapshot' });
    }
  }
);

export async function createScheduledSnapshot(tenantId: string): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.deletedAt) {
      return { success: false, error: 'Tenant not found or deleted' };
    }

    const counts = await countTenantData(tenantId);

    const snapshot = await prisma.backupSnapshot.create({
      data: {
        tenantId,
        type: 'scheduled',
        counts,
        metadata: {
          triggeredBy: 'scheduler',
          tenantName: tenant.name,
          tenantPlan: tenant.plan
        }
      }
    });

    return { success: true, snapshotId: snapshot.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export default router;
