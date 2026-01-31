import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

const DELETE_TOKEN_EXPIRY_MINUTES = 30;
const RETENTION_DAYS = 30;

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

router.post(
  '/:id/request-delete',
  requireRole('owner'),
  createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyStrategy: 'tenantUser',
    routeName: 'tenants/request-delete'
  }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user!.id;
      const { id } = req.params;

      if (id !== tenantId) {
        return res.status(403).json({ error: 'Can only delete your own workspace' });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      if (tenant.deletedAt) {
        return res.status(400).json({ error: 'Workspace is already deleted' });
      }

      const deleteToken = crypto.randomBytes(32).toString('hex');
      const deleteExpiresAt = new Date(Date.now() + DELETE_TOKEN_EXPIRY_MINUTES * 60 * 1000);

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          deleteToken,
          deleteExpiresAt
        }
      });

      await createAuditLog(tenantId, userId, 'TENANT_DELETE_REQUESTED', 'tenant', tenantId, {
        expiresAt: deleteExpiresAt
      });

      res.json({
        message: 'Delete request initiated. Use the confirmation token to confirm deletion.',
        confirmationToken: deleteToken,
        expiresAt: deleteExpiresAt,
        warning: `This will soft-delete your workspace. Data will be retained for ${RETENTION_DAYS} days before permanent deletion.`
      });
    } catch (error: any) {
      console.error('[Tenants] Request delete error:', error);
      res.status(500).json({ error: 'Failed to request workspace deletion' });
    }
  }
);

router.post(
  '/:id/confirm-delete',
  requireRole('owner'),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user!.id;
      const { id } = req.params;
      const { confirmationToken } = req.body;

      if (id !== tenantId) {
        return res.status(403).json({ error: 'Can only delete your own workspace' });
      }

      if (!confirmationToken) {
        return res.status(400).json({ error: 'Confirmation token is required' });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      if (tenant.deletedAt) {
        return res.status(400).json({ error: 'Workspace is already deleted' });
      }

      if (!tenant.deleteToken || tenant.deleteToken !== confirmationToken) {
        return res.status(400).json({ error: 'Invalid confirmation token' });
      }

      if (!tenant.deleteExpiresAt || tenant.deleteExpiresAt < new Date()) {
        return res.status(400).json({ error: 'Confirmation token has expired. Please request a new delete.' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            deletedAt: new Date(),
            deleteToken: null,
            deleteExpiresAt: null
          }
        });

        await tx.apiKey.updateMany({
          where: { tenantId },
          data: { expiresAt: new Date() }
        });

        await tx.previewSession.updateMany({
          where: { tenantId, revoked: false },
          data: { revoked: true, revokedAt: new Date() }
        });
      });

      await createAuditLog(tenantId, userId, 'TENANT_DELETED', 'tenant', tenantId, {
        retentionDays: RETENTION_DAYS,
        restoreDeadline: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000)
      });

      res.json({
        message: 'Workspace deleted successfully',
        deletedAt: new Date(),
        retentionDays: RETENTION_DAYS,
        restoreDeadline: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
        note: `You can restore your workspace within ${RETENTION_DAYS} days using POST /api/tenants/${tenantId}/restore`
      });
    } catch (error: any) {
      console.error('[Tenants] Confirm delete error:', error);
      res.status(500).json({ error: 'Failed to delete workspace' });
    }
  }
);

router.post(
  '/:id/restore',
  requireRole('owner'),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = req.user!.id;
      const { id } = req.params;

      if (id !== tenantId) {
        return res.status(403).json({ error: 'Can only restore your own workspace' });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      if (!tenant.deletedAt) {
        return res.status(400).json({ error: 'Workspace is not deleted' });
      }

      const retentionDeadline = new Date(tenant.deletedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
      if (new Date() > retentionDeadline) {
        return res.status(410).json({
          error: 'Workspace cannot be restored',
          reason: 'Retention period has expired',
          deletedAt: tenant.deletedAt,
          retentionDeadline
        });
      }

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { deletedAt: null }
      });

      await createAuditLog(tenantId, userId, 'TENANT_RESTORED', 'tenant', tenantId, {
        restoredAt: new Date(),
        originalDeletedAt: tenant.deletedAt
      });

      res.json({
        message: 'Workspace restored successfully',
        restoredAt: new Date(),
        note: 'API keys and preview sessions were revoked during deletion and may need to be regenerated.'
      });
    } catch (error: any) {
      console.error('[Tenants] Restore error:', error);
      res.status(500).json({ error: 'Failed to restore workspace' });
    }
  }
);

router.get(
  '/:id/status',
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { id } = req.params;

      if (id !== tenantId) {
        return res.status(403).json({ error: 'Can only view your own workspace status' });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          deletedAt: true,
          createdAt: true
        }
      });

      if (!tenant) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      let status = 'active';
      let restoreDeadline = null;

      if (tenant.deletedAt) {
        status = 'deleted';
        restoreDeadline = new Date(tenant.deletedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
        if (new Date() > restoreDeadline) {
          status = 'expired';
        }
      }

      res.json({
        ...tenant,
        status,
        restoreDeadline,
        retentionDays: RETENTION_DAYS
      });
    } catch (error: any) {
      console.error('[Tenants] Status error:', error);
      res.status(500).json({ error: 'Failed to get workspace status' });
    }
  }
);

export default router;
