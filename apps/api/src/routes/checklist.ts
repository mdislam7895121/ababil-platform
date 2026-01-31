import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();

const DEFAULT_CHECKLIST_ITEMS = [
  { key: 'database_url', label: 'Add Database URL', category: 'required', sortOrder: 1 },
  { key: 'jwt_secret', label: 'Add JWT Secret', category: 'required', sortOrder: 2 },
  { key: 'email_provider', label: 'Configure Email Provider', category: 'required', sortOrder: 3 },
  { key: 'payment_provider', label: 'Configure Payment Provider', category: 'optional', sortOrder: 4 },
  { key: 'ai_config', label: 'Configure AI (optional)', category: 'optional', sortOrder: 5 },
  { key: 'deploy_verification', label: 'Run Deploy Verification', category: 'required', sortOrder: 6 }
];

async function ensureChecklistExists(tenantId: string) {
  const existing = await prisma.checklistItem.count({ where: { tenantId } });
  if (existing === 0) {
    await prisma.checklistItem.createMany({
      data: DEFAULT_CHECKLIST_ITEMS.map(item => ({
        tenantId,
        ...item
      }))
    });
  }
}

router.get('/', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res) => {
  try {
    await ensureChecklistExists(req.tenantId!);

    const items = await prisma.checklistItem.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { sortOrder: 'asc' }
    });

    const completed = items.filter(i => i.completed).length;
    const total = items.length;
    const requiredItems = items.filter(i => i.category === 'required');
    const requiredCompleted = requiredItems.filter(i => i.completed).length;
    const blocking = requiredItems.filter(i => !i.completed);

    res.json({
      items,
      progress: {
        completed,
        total,
        percentage: Math.round((completed / total) * 100)
      },
      requiredProgress: {
        completed: requiredCompleted,
        total: requiredItems.length,
        percentage: Math.round((requiredCompleted / requiredItems.length) * 100)
      },
      blocking: blocking.map(b => ({ key: b.key, label: b.label })),
      readyToGoLive: blocking.length === 0
    });
  } catch (error) {
    console.error('Get checklist error:', error);
    res.status(500).json({ error: 'Failed to get checklist' });
  }
});

const completeItemSchema = z.object({
  key: z.string().min(1)
});

router.post('/complete', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const parsed = completeItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { key } = parsed.data;

    const item = await prisma.checklistItem.findUnique({
      where: { tenantId_key: { tenantId: req.tenantId!, key } }
    });

    if (!item) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }

    await prisma.checklistItem.update({
      where: { id: item.id },
      data: { completed: true }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'CHECKLIST_ITEM_COMPLETED',
      entityType: 'checklist_item',
      entityId: item.id,
      metadata: { key, label: item.label }
    });

    res.json({ ok: true, key, completed: true });
  } catch (error) {
    console.error('Complete checklist item error:', error);
    res.status(500).json({ error: 'Failed to complete checklist item' });
  }
});

router.post('/uncomplete', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    const parsed = completeItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { key } = parsed.data;

    const item = await prisma.checklistItem.findUnique({
      where: { tenantId_key: { tenantId: req.tenantId!, key } }
    });

    if (!item) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }

    await prisma.checklistItem.update({
      where: { id: item.id },
      data: { completed: false }
    });

    res.json({ ok: true, key, completed: false });
  } catch (error) {
    console.error('Uncomplete checklist item error:', error);
    res.status(500).json({ error: 'Failed to uncomplete checklist item' });
  }
});

router.post('/reset', requireRole('owner', 'admin'), async (req: AuthRequest, res) => {
  try {
    await prisma.checklistItem.deleteMany({ where: { tenantId: req.tenantId! } });
    await ensureChecklistExists(req.tenantId!);

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'CHECKLIST_RESET',
      entityType: 'checklist',
      entityId: req.tenantId
    });

    res.json({ ok: true, message: 'Checklist reset to defaults' });
  } catch (error) {
    console.error('Reset checklist error:', error);
    res.status(500).json({ error: 'Failed to reset checklist' });
  }
});

export { router as checklistRoutes };
