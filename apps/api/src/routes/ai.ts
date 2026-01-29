import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../index.js';
import { aiChatSchema, PLAN_QUOTAS, type Plan } from '@platform/shared';
import { logAudit } from '../lib/audit.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// Check if AI module is enabled for tenant
async function isAiEnabled(tenantId: string): Promise<boolean> {
  const flag = await prisma.moduleFlag.findUnique({
    where: { tenantId_key: { tenantId, key: 'ai_assistant' } }
  });
  return flag?.enabled ?? false;
}

// Check usage quotas
async function checkQuotas(tenantId: string, userId: string, plan: Plan): Promise<{ allowed: boolean; reason?: string }> {
  const quotas = PLAN_QUOTAS[plan];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [dailyCount, monthlyCount] = await Promise.all([
    prisma.aiUsage.count({
      where: { tenantId, userId, createdAt: { gte: today } }
    }),
    prisma.aiUsage.count({
      where: { tenantId, userId, createdAt: { gte: monthStart } }
    })
  ]);

  if (dailyCount >= quotas.aiMessagesPerDay) {
    return { allowed: false, reason: 'Daily AI message limit reached' };
  }

  if (monthlyCount >= quotas.aiMessagesPerMonth) {
    return { allowed: false, reason: 'Monthly AI message limit reached' };
  }

  return { allowed: true };
}

// Generate cache key
function getCacheKey(message: string): string {
  return crypto.createHash('sha256').update(message.toLowerCase().trim()).digest('hex');
}

// Chat endpoint
router.post('/chat', async (req: AuthRequest, res) => {
  try {
    // Check if AI module is enabled
    const aiEnabled = await isAiEnabled(req.tenantId!);
    if (!aiEnabled) {
      return res.status(403).json({ error: 'AI module is not enabled for this tenant' });
    }

    const parsed = aiChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { message } = parsed.data;

    // Get tenant for plan info
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check quotas
    const quotaCheck = await checkQuotas(req.tenantId!, req.userId!, tenant.plan as Plan);
    if (!quotaCheck.allowed) {
      return res.status(429).json({ error: quotaCheck.reason });
    }

    // Check cache
    const cacheKey = getCacheKey(message);
    const cached = await prisma.aiCache.findUnique({
      where: { tenantId_promptHash: { tenantId: req.tenantId!, promptHash: cacheKey } }
    });

    if (cached && cached.expiresAt > new Date()) {
      await logAudit({
        tenantId: req.tenantId!,
        actorUserId: req.userId,
        action: 'ai_chat',
        entityType: 'ai',
        metadata: { cached: true }
      });

      return res.json({ reply: cached.response, cached: true });
    }

    // Check for OpenAI API key
    const openaiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    
    let reply: string;
    let inputTokens = 0;
    let outputTokens = 0;

    if (!openaiKey) {
      // Mock mode
      reply = 'AI features are currently in demo mode. The AI assistant would normally help you with platform questions, navigation, and troubleshooting.';
    } else {
      try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: openaiKey });

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant for a multi-tenant business platform. Help users with platform features, troubleshooting, and best practices. Be concise and professional.'
            },
            { role: 'user', content: message }
          ],
          max_tokens: 500
        });

        reply = completion.choices[0]?.message?.content || 'I apologize, I could not generate a response.';
        inputTokens = completion.usage?.prompt_tokens || 0;
        outputTokens = completion.usage?.completion_tokens || 0;
      } catch (aiError) {
        console.error('OpenAI error:', aiError);
        reply = 'AI service is temporarily unavailable. Please try again later.';
      }
    }

    // Record usage
    await prisma.aiUsage.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId!,
        model: 'gpt-4o-mini',
        inputTokens,
        outputTokens,
        estimatedCost: (inputTokens * 0.00000015 + outputTokens * 0.0000006)
      }
    });

    // Cache response (1 hour TTL)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await prisma.aiCache.upsert({
      where: { tenantId_promptHash: { tenantId: req.tenantId!, promptHash: cacheKey } },
      update: { response: reply, expiresAt },
      create: {
        tenantId: req.tenantId!,
        promptHash: cacheKey,
        response: reply,
        model: 'gpt-4o-mini',
        expiresAt
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.userId,
      action: 'ai_chat',
      entityType: 'ai',
      metadata: { cached: false }
    });

    res.json({ reply, cached: false });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'AI service error' });
  }
});

// Get AI usage stats
router.get('/usage', async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
    const quotas = PLAN_QUOTAS[(tenant?.plan || 'free') as Plan];

    const [dailyUsage, monthlyUsage] = await Promise.all([
      prisma.aiUsage.aggregate({
        where: { tenantId: req.tenantId, createdAt: { gte: today } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, estimatedCost: true }
      }),
      prisma.aiUsage.aggregate({
        where: { tenantId: req.tenantId, createdAt: { gte: monthStart } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, estimatedCost: true }
      })
    ]);

    res.json({
      daily: {
        count: dailyUsage._count,
        limit: quotas.aiMessagesPerDay,
        tokens: (dailyUsage._sum.inputTokens || 0) + (dailyUsage._sum.outputTokens || 0)
      },
      monthly: {
        count: monthlyUsage._count,
        limit: quotas.aiMessagesPerMonth,
        tokens: (monthlyUsage._sum.inputTokens || 0) + (monthlyUsage._sum.outputTokens || 0),
        estimatedCost: Number(monthlyUsage._sum.estimatedCost || 0)
      }
    });
  } catch (error) {
    console.error('AI usage error:', error);
    res.status(500).json({ error: 'Failed to get AI usage' });
  }
});

export { router as aiRoutes };
