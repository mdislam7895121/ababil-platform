import { Router } from 'express';
import { prisma } from '../index.js';
import { MODULE_KEYS, toggleModuleSchema, updateModuleConfigSchema } from '../../../../packages/shared/src/index.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

// List all modules with their status for tenant
router.get('/', async (req: AuthRequest, res) => {
  try {
    const flags = await prisma.moduleFlag.findMany({
      where: { tenantId: req.tenantId }
    });

    const flagMap = new Map(flags.map(f => [f.key, f]));

    const modules = MODULE_KEYS.map(key => ({
      key,
      enabled: flagMap.get(key)?.enabled || false,
      config: flagMap.get(key)?.config || null
    }));

    res.json(modules);
  } catch (error) {
    console.error('List modules error:', error);
    res.status(500).json({ error: 'Failed to list modules' });
  }
});

// Toggle module on/off
router.post('/:key/toggle', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;

    if (!MODULE_KEYS.includes(key as any)) {
      return res.status(400).json({ error: 'Invalid module key' });
    }

    const parsed = toggleModuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { enabled } = parsed.data;

    const flag = await prisma.moduleFlag.upsert({
      where: { tenantId_key: { tenantId: req.tenantId!, key } },
      update: { enabled },
      create: { tenantId: req.tenantId!, key, enabled }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: enabled ? 'enable_module' : 'disable_module',
      entityType: 'module',
      entityId: key
    });

    res.json({ success: true, module: { key, enabled: flag.enabled } });
  } catch (error) {
    console.error('Toggle module error:', error);
    res.status(500).json({ error: 'Failed to toggle module' });
  }
});

// Update module config
router.patch('/:key/config', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;

    if (!MODULE_KEYS.includes(key as any)) {
      return res.status(400).json({ error: 'Invalid module key' });
    }

    const parsed = updateModuleConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const flag = await prisma.moduleFlag.upsert({
      where: { tenantId_key: { tenantId: req.tenantId!, key } },
      update: { config: parsed.data.config },
      create: { tenantId: req.tenantId!, key, enabled: false, config: parsed.data.config }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'update_module_config',
      entityType: 'module',
      entityId: key
    });

    res.json({ success: true, module: { key, enabled: flag.enabled, config: flag.config } });
  } catch (error) {
    console.error('Update module config error:', error);
    res.status(500).json({ error: 'Failed to update module config' });
  }
});

export { router as moduleRoutes };
