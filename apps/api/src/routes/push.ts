import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const RegisterTokenSchema = z.object({
  expoPushToken: z.string().min(1),
  deviceInfo: z.object({
    platform: z.string().optional(),
    version: z.union([z.string(), z.number()]).optional(),
    isDevice: z.boolean().optional(),
    deviceName: z.string().nullable().optional(),
    modelName: z.string().nullable().optional(),
  }).optional(),
});

router.post('/register', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = RegisterTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const { expoPushToken, deviceInfo } = parsed.data;

    const existingToken = await prisma.pushToken.findFirst({
      where: {
        userId: req.user!.id,
        tenantId: req.tenantId!,
      },
    });

    if (existingToken) {
      await prisma.pushToken.update({
        where: { id: existingToken.id },
        data: {
          token: expoPushToken,
          deviceInfo: deviceInfo as any,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.pushToken.create({
        data: {
          userId: req.user!.id,
          tenantId: req.tenantId!,
          token: expoPushToken,
          deviceInfo: deviceInfo as any,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'PUSH_TOKEN_REGISTERED',
        entityType: 'push_token',
        entityId: req.user!.id,
        metadata: { platform: deviceInfo?.platform },
      },
    });

    console.log(`[Push] Token registered for user ${req.user!.id}`);
    res.json({ success: true, message: 'Push token registered' });
  } catch (error) {
    console.error('Register push token error:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

router.post('/test', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user!.id, tenantId: req.tenantId! },
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pushToken = await prisma.pushToken.findFirst({
      where: { userId: req.user!.id, tenantId: req.tenantId! },
    });

    if (!pushToken) {
      return res.status(404).json({ error: 'No push token registered for this user' });
    }

    const message = {
      to: pushToken.token,
      sound: 'default',
      title: 'Test Notification',
      body: 'This is a test notification from Platform Factory',
      data: { type: 'test', timestamp: new Date().toISOString() },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('[Push] Test notification result:', JSON.stringify(result));

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'PUSH_TEST_SENT',
        entityType: 'push_notification',
        entityId: req.user!.id,
        metadata: { result },
      },
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('Send test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

router.get('/tokens', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user!.id, tenantId: req.tenantId! },
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const tokens = await prisma.pushToken.findMany({
      where: { tenantId: req.tenantId! },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    res.json({ tokens });
  } catch (error) {
    console.error('Get push tokens error:', error);
    res.status(500).json({ error: 'Failed to get push tokens' });
  }
});

export default router;
