import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const prisma = new PrismaClient();

async function logAudit(
  tenantId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>
) {
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
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

const installRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    const tenantId = authReq.headers['x-tenant-id'];
    const userId = authReq.userId;
    return `marketplace-install:${tenantId || 'anon'}:${userId || 'anon'}`;
  },
  message: { error: 'Too many install requests, please try again later' }
});

async function checkAdminRole(userId: string): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      role: { in: ['admin', 'owner'] }
    }
  });
  return !!membership;
}

router.get('/items', async (req: Request, res: Response) => {
  const typeParam = req.query.type;
  const tagParam = req.query.tag;
  const searchParam = req.query.search;

  const type = typeof typeParam === 'string' ? typeParam : undefined;
  const tag = typeof tagParam === 'string' ? tagParam : undefined;
  const search = typeof searchParam === 'string' ? searchParam : undefined;

  try {
    const where: Record<string, unknown> = {
      status: 'published'
    };

    if (type) {
      where.type = type;
    }

    if (tag) {
      where.tags = { has: tag };
    }

    const items = await prisma.marketplaceItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        priceCents: true,
        currency: true,
        isFree: true,
        shortDesc: true,
        screenshots: true,
        tags: true,
        version: true,
        requiredPlan: true
      }
    });

    let filteredItems = items;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchLower) ||
        item.shortDesc.toLowerCase().includes(searchLower) ||
        item.tags.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    return res.json({
      items: filteredItems,
      total: filteredItems.length
    });
  } catch (err) {
    console.error('List items error:', err);
    return res.status(500).json({ error: 'Failed to list items' });
  }
});

router.get('/items/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;

  try {
    const item = await prisma.marketplaceItem.findFirst({
      where: {
        slug,
        status: 'published'
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const installCount = await prisma.marketplaceInstall.count({
      where: { itemId: item.id, status: 'installed' }
    });

    return res.json({
      item: {
        ...item,
        installCount
      }
    });
  } catch (err) {
    console.error('Get item error:', err);
    return res.status(500).json({ error: 'Failed to get item' });
  }
});

router.post('/items', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminRole(userId);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin role required to create marketplace items' });
  }

  const {
    slug,
    name,
    type = 'template',
    priceCents = 0,
    currency = 'USD',
    shortDesc,
    longDesc,
    screenshots = [],
    tags = [],
    version = '1.0.0',
    requiredPlan = 'free',
    installSpec = {}
  } = req.body;

  if (!slug || !name || !shortDesc || !longDesc) {
    return res.status(400).json({ error: 'Missing required fields: slug, name, shortDesc, longDesc' });
  }

  try {
    const existing = await prisma.marketplaceItem.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ error: 'Item with this slug already exists' });
    }

    const item = await prisma.marketplaceItem.create({
      data: {
        slug,
        name,
        type,
        priceCents,
        currency,
        isFree: priceCents === 0,
        shortDesc,
        longDesc,
        screenshots,
        tags,
        version,
        status: 'draft',
        requiredPlan,
        installSpec
      }
    });

    return res.status(201).json({
      item,
      message: 'Item created as draft'
    });
  } catch (err) {
    console.error('Create item error:', err);
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

router.post('/items/:id/publish', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminRole(userId);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin role required to publish marketplace items' });
  }

  try {
    const item = await prisma.marketplaceItem.findUnique({ where: { id } });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = await prisma.marketplaceItem.update({
      where: { id },
      data: { status: 'published' }
    });

    await logAudit('system', userId, 'MARKETPLACE_ITEM_PUBLISHED', 'marketplace_item', id, {
      slug: item.slug,
      name: item.name,
      version: item.version
    });

    return res.json({
      item: updatedItem,
      message: 'Item published successfully'
    });
  } catch (err) {
    console.error('Publish item error:', err);
    return res.status(500).json({ error: 'Failed to publish item' });
  }
});

async function executeInstallSpecWithTransaction(
  tenantId: string,
  installSpec: Record<string, unknown>,
  itemName: string,
  itemId: string,
  itemVersion: string,
  userId: string
): Promise<{ success: boolean; install?: Record<string, unknown>; rollbackData: Record<string, unknown>; error?: string }> {
  const rollbackData: Record<string, unknown> = {
    modulesEnabled: [],
    connectorsConfigured: [],
    presetsApplied: [],
    sampleDataAdded: []
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const modules = installSpec.modules as string[] | undefined;
      if (modules && Array.isArray(modules)) {
        for (const moduleKey of modules) {
          const existing = await tx.moduleFlag.findFirst({
            where: { tenantId, key: moduleKey }
          });

          if (!existing) {
            await tx.moduleFlag.create({
              data: {
                tenantId,
                key: moduleKey,
                enabled: true
              }
            });
            (rollbackData.modulesEnabled as string[]).push(moduleKey);
          } else if (!existing.enabled) {
            await tx.moduleFlag.update({
              where: { id: existing.id },
              data: { enabled: true }
            });
            (rollbackData.modulesEnabled as string[]).push(moduleKey);
          }
        }
      }

      const connectors = installSpec.connectors as Array<{ name: string; config?: Record<string, unknown> }> | undefined;
      if (connectors && Array.isArray(connectors)) {
        for (const connector of connectors) {
          const existing = await tx.connectorConfig.findFirst({
            where: { tenantId, connectorKey: connector.name }
          });

          if (!existing) {
            await tx.connectorConfig.create({
              data: {
                tenantId,
                connectorKey: connector.name,
                enabled: false,
                configEncrypted: JSON.stringify(connector.config || {})
              }
            });
            (rollbackData.connectorsConfigured as string[]).push(connector.name);
          }
        }
      }

      const presets = installSpec.presets as string[] | undefined;
      if (presets && Array.isArray(presets)) {
        const tenantData = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { settings: true }
        });

        const currentSettings = (tenantData?.settings as Record<string, unknown>) || {};
        const appliedPresets = (currentSettings.industryPresets as string[]) || [];
        const newPresets = [...new Set([...appliedPresets, ...presets])];

        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            settings: {
              ...currentSettings,
              industryPresets: newPresets,
              marketplaceInstall: itemName
            }
          }
        });
        (rollbackData.presetsApplied as string[]).push(...presets);
      }

      const sampleData = installSpec.sampleData as Record<string, unknown[]> | undefined;
      if (sampleData) {
        (rollbackData.sampleDataAdded as Record<string, unknown>[]).push({
          note: 'Demo data flagged',
          tables: Object.keys(sampleData)
        });
      }

      const install = await tx.marketplaceInstall.create({
        data: {
          tenantId,
          itemId,
          installedVersion: itemVersion,
          status: 'installed',
          rollbackData: rollbackData as object
        }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId,
          action: 'MARKETPLACE_INSTALLED',
          entityType: 'marketplace_install',
          entityId: install.id,
          metadata: { itemName, version: itemVersion }
        }
      });

      return install;
    });

    return { success: true, install: result as unknown as Record<string, unknown>, rollbackData };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, rollbackData, error };
  }
}

async function executeRollbackWithTransaction(
  tenantId: string,
  rollbackData: Record<string, unknown>,
  installId: string,
  userId: string,
  itemSlug: string,
  itemName: string,
  installedVersion: string
): Promise<{ success: boolean; install?: Record<string, unknown>; error?: string }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const modulesEnabled = rollbackData.modulesEnabled as string[] | undefined;
      if (modulesEnabled && Array.isArray(modulesEnabled)) {
        for (const moduleKey of modulesEnabled) {
          await tx.moduleFlag.updateMany({
            where: { tenantId, key: moduleKey },
            data: { enabled: false }
          });
        }
      }

      const connectorsConfigured = rollbackData.connectorsConfigured as string[] | undefined;
      if (connectorsConfigured && Array.isArray(connectorsConfigured)) {
        for (const connectorKey of connectorsConfigured) {
          await tx.connectorConfig.deleteMany({
            where: { tenantId, connectorKey }
          });
        }
      }

      const updatedInstall = await tx.marketplaceInstall.update({
        where: { id: installId },
        data: { status: 'rolled_back' }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId,
          action: 'MARKETPLACE_ROLLED_BACK',
          entityType: 'marketplace_install',
          entityId: installId,
          metadata: { itemSlug, itemName, version: installedVersion }
        }
      });

      return updatedInstall;
    });

    return { success: true, install: result as unknown as Record<string, unknown> };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

router.post('/install/:slug', authMiddleware, installRateLimiter, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantIdParam = authReq.headers['x-tenant-id'];
  const tenantId = typeof tenantIdParam === 'string' ? tenantIdParam : undefined;
  const userId = authReq.userId;
  const { slug } = req.params;

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Tenant and authentication required' });
  }

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, role: { in: ['owner', 'admin'] } }
  });

  if (!membership) {
    return res.status(403).json({ error: 'Owner or admin access required' });
  }

  try {
    const item = await prisma.marketplaceItem.findFirst({
      where: { slug, status: 'published' }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found or not published' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const planHierarchy: Record<string, number> = { free: 0, pro: 1, business: 2, enterprise: 3 };
    const tenantPlanLevel = planHierarchy[tenant.plan] || 0;
    const requiredPlanLevel = planHierarchy[item.requiredPlan] || 0;

    if (tenantPlanLevel < requiredPlanLevel) {
      return res.status(403).json({
        error: `This item requires ${item.requiredPlan} plan or higher`,
        requiredPlan: item.requiredPlan,
        currentPlan: tenant.plan
      });
    }

    if (!item.isFree) {
      const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
      if (!subscription || subscription.status !== 'active') {
        return res.status(402).json({
          error: 'Active subscription required for paid items',
          priceCents: item.priceCents,
          currency: item.currency
        });
      }
    }

    const existingInstall = await prisma.marketplaceInstall.findFirst({
      where: {
        tenantId,
        itemId: item.id,
        status: 'installed',
        installedVersion: item.version
      }
    });

    if (existingInstall) {
      return res.status(409).json({
        error: 'Item already installed with this version',
        installedVersion: existingInstall.installedVersion,
        installedAt: existingInstall.installedAt
      });
    }

    const installSpec = item.installSpec as Record<string, unknown>;
    const { success, install, rollbackData, error } = await executeInstallSpecWithTransaction(
      tenantId,
      installSpec,
      item.name,
      item.id,
      item.version,
      userId
    );

    if (!success) {
      const failedInstall = await prisma.marketplaceInstall.create({
        data: {
          tenantId,
          itemId: item.id,
          installedVersion: item.version,
          status: 'failed',
          lastError: error || null,
          rollbackData: rollbackData as object
        }
      });

      await logAudit(tenantId, userId, 'MARKETPLACE_INSTALL_FAILED', 'marketplace_install', failedInstall.id, {
        itemSlug: item.slug,
        itemName: item.name,
        version: item.version,
        error
      });

      return res.status(500).json({
        error: 'Installation failed',
        details: error,
        installId: failedInstall.id
      });
    }

    return res.json({
      install,
      item: {
        id: item.id,
        slug: item.slug,
        name: item.name,
        version: item.version
      },
      message: 'Item installed successfully'
    });
  } catch (err) {
    console.error('Install error:', err);
    return res.status(500).json({ error: 'Failed to install item' });
  }
});

router.get('/installs', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantIdParam = authReq.headers['x-tenant-id'];
  const tenantId = typeof tenantIdParam === 'string' ? tenantIdParam : undefined;

  if (!tenantId) {
    return res.status(401).json({ error: 'Tenant required' });
  }

  try {
    const installs = await prisma.marketplaceInstall.findMany({
      where: { tenantId },
      include: {
        item: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
            version: true,
            shortDesc: true
          }
        }
      },
      orderBy: { installedAt: 'desc' }
    });

    return res.json({
      installs,
      total: installs.length
    });
  } catch (err) {
    console.error('List installs error:', err);
    return res.status(500).json({ error: 'Failed to list installs' });
  }
});

router.post('/rollback/:installId', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantIdParam = authReq.headers['x-tenant-id'];
  const tenantId = typeof tenantIdParam === 'string' ? tenantIdParam : undefined;
  const userId = authReq.userId;
  const { installId } = req.params;

  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Tenant and authentication required' });
  }

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, role: { in: ['owner', 'admin'] } }
  });

  if (!membership) {
    return res.status(403).json({ error: 'Owner or admin access required' });
  }

  try {
    const install = await prisma.marketplaceInstall.findFirst({
      where: { id: installId, tenantId },
      include: { item: true }
    });

    if (!install) {
      return res.status(404).json({ error: 'Install not found' });
    }

    if (install.status === 'rolled_back') {
      return res.status(400).json({ error: 'Install already rolled back' });
    }

    const rollbackData = install.rollbackData as Record<string, unknown> | null;
    if (!rollbackData) {
      return res.status(400).json({ error: 'No rollback data available' });
    }

    const { success, install: updatedInstall, error } = await executeRollbackWithTransaction(
      tenantId,
      rollbackData,
      installId,
      userId,
      install.item.slug,
      install.item.name,
      install.installedVersion
    );

    if (!success) {
      return res.status(500).json({ error: `Rollback failed: ${error}` });
    }

    return res.json({
      install: updatedInstall,
      message: 'Install rolled back successfully'
    });
  } catch (err) {
    console.error('Rollback error:', err);
    return res.status(500).json({ error: 'Failed to rollback install' });
  }
});

export default router;
