import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { createApiKeySchema } from '../../../../packages/shared/src/index.js';
import { generateApiKey, hashApiKey } from '../lib/crypto.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole, API_SCOPES, ApiScope } from '../middleware/auth.js';

const router = Router();

// List available scopes
router.get('/scopes', async (req: AuthRequest, res: Response) => {
  res.json({ 
    scopes: Object.entries(API_SCOPES).map(([key, description]) => ({
      scope: key,
      description
    }))
  });
});

// List API keys
router.get('/', async (req: AuthRequest, res: Response) => {
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
      status: k.status,
      lastUsedAt: k.lastUsedAt,
      lastUsedIp: k.lastUsedIp,
      revokedAt: k.revokedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt
    })));
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// Create API key
router.post('/', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { name, expiresInDays } = parsed.data;
    let scopes = parsed.data.scopes || ['read'];
    
    // Validate scopes
    const validScopes = Object.keys(API_SCOPES);
    const invalidScopes = scopes.filter((s: string) => !validScopes.includes(s));
    if (invalidScopes.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid scopes', 
        invalidScopes,
        validScopes 
      });
    }
    
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
        status: 'active',
        expiresAt
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'API_KEY_CREATED',
      entityType: 'api_key',
      entityId: apiKey.id,
      metadata: { name, scopes }
    });

    // Return the full key only once
    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key, // Only shown once - store securely!
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      status: apiKey.status,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      note: 'Save this API key now - it will not be shown again.'
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Update API key scopes
router.patch('/:id/scopes', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { scopes } = req.body;
    
    if (!Array.isArray(scopes)) {
      return res.status(400).json({ error: 'scopes must be an array' });
    }
    
    // Validate scopes
    const validScopes = Object.keys(API_SCOPES);
    const invalidScopes = scopes.filter((s: string) => !validScopes.includes(s));
    if (invalidScopes.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid scopes', 
        invalidScopes,
        validScopes 
      });
    }

    const existingKey = await prisma.apiKey.findFirst({
      where: { id, tenantId: req.tenantId, status: 'active' }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found or revoked' });
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { scopes }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'API_KEY_SCOPES_UPDATED',
      entityType: 'api_key',
      entityId: id,
      metadata: { 
        oldScopes: existingKey.scopes, 
        newScopes: scopes 
      }
    });

    res.json({
      id: updated.id,
      name: updated.name,
      keyPrefix: updated.keyPrefix,
      scopes: updated.scopes,
      status: updated.status,
      message: 'Scopes updated successfully'
    });
  } catch (error) {
    console.error('Update API key scopes error:', error);
    res.status(500).json({ error: 'Failed to update scopes' });
  }
});

// Rotate API key (issue new key, invalidate old)
router.post('/:id/rotate', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existingKey = await prisma.apiKey.findFirst({
      where: { id, tenantId: req.tenantId, status: 'active' }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found or already revoked' });
    }

    const { key: newRawKey, prefix: newPrefix } = generateApiKey();
    const newKeyHash = hashApiKey(newRawKey);

    await prisma.apiKey.update({
      where: { id },
      data: {
        keyHash: newKeyHash,
        keyPrefix: newPrefix,
        lastUsedAt: null,
        lastUsedIp: null
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
      key: newRawKey, // Only shown once
      keyPrefix: newPrefix,
      scopes: existingKey.scopes,
      status: 'active',
      expiresAt: existingKey.expiresAt,
      rotatedAt: new Date().toISOString(),
      message: 'API key rotated. Save this key now - it will not be shown again.',
      note: 'The old key has been invalidated.'
    });
  } catch (error) {
    console.error('Rotate API key error:', error);
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

// Revoke API key (soft delete - marks as revoked)
router.post('/:id/revoke', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const key = await prisma.apiKey.findFirst({
      where: { id, tenantId: req.tenantId }
    });

    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    if (key.status === 'revoked') {
      return res.status(400).json({ error: 'API key already revoked' });
    }

    await prisma.apiKey.update({
      where: { id },
      data: {
        status: 'revoked',
        revokedAt: new Date()
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'API_KEY_REVOKED',
      entityType: 'api_key',
      entityId: id,
      metadata: { keyPrefix: key.keyPrefix }
    });

    res.json({ 
      success: true, 
      message: 'API key revoked',
      id: key.id,
      keyPrefix: key.keyPrefix,
      revokedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// Delete API key (hard delete - for cleanup)
router.delete('/:id', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
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
      action: 'API_KEY_DELETED',
      entityType: 'api_key',
      entityId: id,
      metadata: { keyPrefix: key.keyPrefix }
    });

    res.json({ success: true, message: 'API key deleted permanently' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export { router as apiKeyRoutes };
