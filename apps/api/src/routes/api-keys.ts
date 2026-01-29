import { Router } from 'express';
import { prisma } from '../index.js';
import { createApiKeySchema } from '../../../../packages/shared/src/index.js';
import { generateApiKey, hashApiKey } from '../lib/crypto.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

// List API keys
router.get('/', async (req: AuthRequest, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(keys.map(k => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt
    })));
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// Create API key
router.post('/', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { name, scopes, expiresInDays } = parsed.data;
    const { key, prefix } = generateApiKey();
    const keyHash = hashApiKey(key);

    let expiresAt = null;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId: req.tenantId!,
        name,
        keyHash,
        keyPrefix: prefix,
        scopes,
        expiresAt
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'create_api_key',
      entityType: 'api_key',
      entityId: apiKey.id,
      metadata: { name }
    });

    // Return the full key only once
    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key, // Only shown once
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Rotate API key (revoke old, issue new)
router.post('/:id/rotate', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingKey = await prisma.apiKey.findFirst({
      where: { id, tenantId: req.tenantId }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const { key: newRawKey, prefix: newPrefix } = generateApiKey();
    const newKeyHash = hashApiKey(newRawKey);

    await prisma.apiKey.update({
      where: { id },
      data: {
        keyHash: newKeyHash,
        keyPrefix: newPrefix,
        lastUsedAt: null,
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'API_KEY_ROTATED',
      entityType: 'api_key',
      entityId: id,
      metadata: { oldPrefix: existingKey.keyPrefix, newPrefix }
    });

    res.json({
      id: existingKey.id,
      name: existingKey.name,
      key: newRawKey,
      keyPrefix: newPrefix,
      scopes: existingKey.scopes,
      expiresAt: existingKey.expiresAt,
      rotatedAt: new Date().toISOString(),
      message: 'API key rotated successfully. Save this key now - it will not be shown again.'
    });
  } catch (error) {
    console.error('Rotate API key error:', error);
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

// Revoke API key
router.delete('/:id', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const key = await prisma.apiKey.findFirst({
      where: { id, tenantId: req.tenantId }
    });

    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.delete({ where: { id } });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'revoke_api_key',
      entityType: 'api_key',
      entityId: id
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export { router as apiKeyRoutes };
