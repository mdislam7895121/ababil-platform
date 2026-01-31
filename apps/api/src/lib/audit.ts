import { prisma } from '../index.js';

export async function logAudit(params: {
  tenantId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata
      }
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
