import { Router } from 'express';
import { prisma } from '../index.js';
import { CONNECTOR_KEYS, updateConnectorSchema } from '../../../../packages/shared/src/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

// List all connectors with their status
router.get('/', async (req: AuthRequest, res) => {
  try {
    const configs = await prisma.connectorConfig.findMany({
      where: { tenantId: req.tenantId }
    });

    const configMap = new Map(configs.map(c => [c.connectorKey, c]));

    const connectors = CONNECTOR_KEYS.map(key => ({
      key,
      enabled: configMap.get(key)?.enabled || false,
      configured: !!configMap.get(key)?.configEncrypted
    }));

    res.json(connectors);
  } catch (error) {
    console.error('List connectors error:', error);
    res.status(500).json({ error: 'Failed to list connectors' });
  }
});

// Get connector details (with decrypted config for authorized users)
router.get('/:key', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;

    if (!CONNECTOR_KEYS.includes(key as any)) {
      return res.status(400).json({ error: 'Invalid connector key' });
    }

    const config = await prisma.connectorConfig.findUnique({
      where: { tenantId_connectorKey: { tenantId: req.tenantId!, connectorKey: key } }
    });

    if (!config) {
      return res.json({ key, enabled: false, config: null });
    }

    let decryptedConfig = null;
    if (config.configEncrypted) {
      try {
        decryptedConfig = JSON.parse(decrypt(config.configEncrypted));
      } catch (e) {
        console.error('Failed to decrypt connector config:', e);
      }
    }

    res.json({
      key,
      enabled: config.enabled,
      config: decryptedConfig
    });
  } catch (error) {
    console.error('Get connector error:', error);
    res.status(500).json({ error: 'Failed to get connector' });
  }
});

// Update connector config
router.patch('/:key', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;

    if (!CONNECTOR_KEYS.includes(key as any)) {
      return res.status(400).json({ error: 'Invalid connector key' });
    }

    const parsed = updateConnectorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const updateData: any = {};
    
    if (parsed.data.enabled !== undefined) {
      updateData.enabled = parsed.data.enabled;
    }

    if (parsed.data.config !== undefined) {
      updateData.configEncrypted = encrypt(JSON.stringify(parsed.data.config));
    }

    const config = await prisma.connectorConfig.upsert({
      where: { tenantId_connectorKey: { tenantId: req.tenantId!, connectorKey: key } },
      update: updateData,
      create: {
        tenantId: req.tenantId!,
        connectorKey: key,
        enabled: parsed.data.enabled ?? false,
        configEncrypted: parsed.data.config ? encrypt(JSON.stringify(parsed.data.config)) : null
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'update_connector',
      entityType: 'connector',
      entityId: key
    });

    res.json({
      success: true,
      connector: {
        key,
        enabled: config.enabled,
        configured: !!config.configEncrypted
      }
    });
  } catch (error) {
    console.error('Update connector error:', error);
    res.status(500).json({ error: 'Failed to update connector' });
  }
});

export { router as connectorRoutes };
