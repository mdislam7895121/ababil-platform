import { Router, Response } from 'express';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { TEMPLATES, classifyPromptToTemplate, extractEntitiesFromPrompt, generateBlueprint, generateSummary } from '../lib/templates.js';
import { logAudit } from '../lib/audit.js';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

const MAX_PROMPT_LENGTH = 4000;
const FORBIDDEN_PATTERNS = [
  /malware/i,
  /hack(ing|er)?/i,
  /exploit/i,
  /phishing/i,
  /ransomware/i,
  /keylogger/i,
  /trojan/i,
  /illegal/i
];

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(normalizePrompt(prompt)).digest('hex');
}

function validatePromptContent(prompt: string): { valid: boolean; error?: string } {
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(prompt)) {
      return { valid: false, error: 'Prompt contains prohibited content' };
    }
  }

  return { valid: true };
}

function sanitizePromptForStorage(prompt: string): string {
  return prompt
    .replace(/\b\d{16}\b/g, '[REDACTED_CARD]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\b(?:password|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi, '[REDACTED_SECRET]');
}

router.post('/draft', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const validation = validatePromptContent(prompt);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const sanitizedPrompt = sanitizePromptForStorage(prompt);
    const promptHash = hashPrompt(prompt);

    const templateKey = classifyPromptToTemplate(prompt);
    const entities = extractEntitiesFromPrompt(prompt, templateKey);
    const { blueprint, customizations } = generateBlueprint(templateKey, entities);
    const summary = generateSummary(blueprint, customizations);

    const builderRequest = await prisma.builderRequest.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        promptText: sanitizedPrompt,
        normalizedPromptHash: promptHash,
        status: 'draft'
      }
    });

    const blueprintRecord = await prisma.blueprint.create({
      data: {
        tenantId: req.tenantId!,
        builderRequestId: builderRequest.id,
        templateKey,
        blueprintJson: {
          template: blueprint,
          customizations,
          entities
        },
        summary
      }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.user?.id,
      action: 'BUILDER_DRAFT_CREATED',
      entityType: 'builder_request',
      entityId: builderRequest.id,
      metadata: {
        templateKey,
        promptLength: prompt.length
      }
    });

    res.json({
      builderRequestId: builderRequest.id,
      blueprintId: blueprintRecord.id,
      blueprint: {
        templateKey,
        templateName: blueprint.name,
        description: blueprint.description,
        modules: blueprint.modules,
        connectors: blueprint.connectors,
        workflows: blueprint.workflows,
        sampleData: blueprint.sampleData,
        dashboardWidgets: blueprint.dashboardWidgets,
        checklist: blueprint.checklist,
        customizations
      },
      summary
    });
  } catch (error) {
    console.error('Builder draft error:', error);
    res.status(500).json({ error: 'Failed to create builder draft' });
  }
});

router.post('/approve', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { builderRequestId } = req.body;

    if (!builderRequestId) {
      res.status(400).json({ error: 'builderRequestId is required' });
      return;
    }

    const builderRequest = await prisma.builderRequest.findFirst({
      where: {
        id: builderRequestId,
        tenantId: req.tenantId!
      }
    });

    if (!builderRequest) {
      res.status(404).json({ error: 'Builder request not found' });
      return;
    }

    if (builderRequest.status !== 'draft') {
      res.status(400).json({ error: `Cannot approve request with status: ${builderRequest.status}` });
      return;
    }

    await prisma.builderRequest.update({
      where: { id: builderRequestId },
      data: { status: 'approved' }
    });

    await logAudit({
      tenantId: req.tenantId!,
      actorUserId: req.user?.id,
      action: 'BUILDER_APPROVED',
      entityType: 'builder_request',
      entityId: builderRequestId
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Builder approve error:', error);
    res.status(500).json({ error: 'Failed to approve builder request' });
  }
});

router.post('/run', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { builderRequestId } = req.body;

    if (!builderRequestId) {
      res.status(400).json({ error: 'builderRequestId is required' });
      return;
    }

    const builderRequest = await prisma.builderRequest.findFirst({
      where: {
        id: builderRequestId,
        tenantId: req.tenantId!
      },
      include: {
        blueprints: true
      }
    });

    if (!builderRequest) {
      res.status(404).json({ error: 'Builder request not found' });
      return;
    }

    if (builderRequest.status !== 'approved') {
      res.status(400).json({ error: 'Builder request must be approved before running' });
      return;
    }

    const blueprintRecord = builderRequest.blueprints[0];
    if (!blueprintRecord) {
      res.status(400).json({ error: 'No blueprint found for this request' });
      return;
    }

    const buildRun = await prisma.buildRun.create({
      data: {
        tenantId: req.tenantId!,
        builderRequestId,
        status: 'running',
        startedAt: new Date()
      }
    });

    await prisma.builderRequest.update({
      where: { id: builderRequestId },
      data: { status: 'building' }
    });

    try {
      const blueprintData = blueprintRecord.blueprintJson as any;
      const template = blueprintData.template;
      const enabledModules: string[] = [];
      const configuredConnectors: string[] = [];

      for (const moduleKey of template.modules) {
        await prisma.moduleFlag.upsert({
          where: {
            tenantId_key: {
              tenantId: req.tenantId!,
              key: moduleKey
            }
          },
          update: {
            enabled: true,
            config: {
              ...(template.workflows || {}),
              sampleData: template.sampleData,
              dashboardWidgets: template.dashboardWidgets,
              builderConfigured: true,
              builderRequestId
            }
          },
          create: {
            tenantId: req.tenantId!,
            key: moduleKey,
            enabled: true,
            config: {
              ...(template.workflows || {}),
              sampleData: template.sampleData,
              dashboardWidgets: template.dashboardWidgets,
              builderConfigured: true,
              builderRequestId
            }
          }
        });
        enabledModules.push(moduleKey);

        await logAudit({
          tenantId: req.tenantId!,
          actorUserId: req.user?.id,
          action: 'MODULE_ENABLED_BY_BUILDER',
          entityType: 'module',
          entityId: moduleKey,
          metadata: { builderRequestId }
        });
      }

      for (const connectorKey of template.connectors) {
        await prisma.connectorConfig.upsert({
          where: {
            tenantId_connectorKey: {
              tenantId: req.tenantId!,
              connectorKey
            }
          },
          update: {},
          create: {
            tenantId: req.tenantId!,
            connectorKey,
            enabled: false
          }
        });
        configuredConnectors.push(connectorKey);
      }

      const outputJson = {
        success: true,
        templateKey: blueprintRecord.templateKey,
        templateName: template.name,
        enabledModules,
        recommendedConnectors: configuredConnectors,
        checklist: template.checklist,
        dashboardWidgets: template.dashboardWidgets,
        message: `Successfully configured ${template.name} template`
      };

      await prisma.buildRun.update({
        where: { id: buildRun.id },
        data: {
          status: 'done',
          finishedAt: new Date(),
          outputJson
        }
      });

      await prisma.builderRequest.update({
        where: { id: builderRequestId },
        data: { status: 'done' }
      });

      await logAudit({
        tenantId: req.tenantId!,
        actorUserId: req.user?.id,
        action: 'BUILDER_RUN_COMPLETED',
        entityType: 'build_run',
        entityId: buildRun.id,
        metadata: {
          enabledModules,
          templateKey: blueprintRecord.templateKey
        }
      });

      res.json({
        buildRunId: buildRun.id,
        status: 'done',
        output: outputJson
      });

    } catch (buildError: any) {
      await prisma.buildRun.update({
        where: { id: buildRun.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorText: buildError.message
        }
      });

      await prisma.builderRequest.update({
        where: { id: builderRequestId },
        data: { status: 'failed' }
      });

      await logAudit({
        tenantId: req.tenantId!,
        actorUserId: req.user?.id,
        action: 'BUILDER_RUN_FAILED',
        entityType: 'build_run',
        entityId: buildRun.id,
        metadata: { error: buildError.message }
      });

      res.status(500).json({
        buildRunId: buildRun.id,
        status: 'failed',
        error: buildError.message
      });
    }
  } catch (error) {
    console.error('Builder run error:', error);
    res.status(500).json({ error: 'Failed to run builder' });
  }
});

router.get('/requests', async (req: AuthRequest, res: Response) => {
  try {
    const requests = await prisma.builderRequest.findMany({
      where: { tenantId: req.tenantId! },
      include: {
        blueprints: true,
        buildRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json(requests.map((r: any) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: r.user,
      blueprint: r.blueprints[0] ? {
        id: r.blueprints[0].id,
        templateKey: r.blueprints[0].templateKey,
        summary: r.blueprints[0].summary
      } : null,
      lastBuildRun: r.buildRuns[0] ? {
        id: r.buildRuns[0].id,
        status: r.buildRuns[0].status,
        finishedAt: r.buildRuns[0].finishedAt
      } : null
    })));
  } catch (error) {
    console.error('Builder requests error:', error);
    res.status(500).json({ error: 'Failed to fetch builder requests' });
  }
});

router.get('/requests/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.builderRequest.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      },
      include: {
        blueprints: true,
        buildRuns: {
          orderBy: { createdAt: 'desc' }
        },
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!request) {
      res.status(404).json({ error: 'Builder request not found' });
      return;
    }

    res.json({
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      user: request.user,
      blueprint: request.blueprints[0] || null,
      buildRuns: request.buildRuns
    });
  } catch (error) {
    console.error('Builder request detail error:', error);
    res.status(500).json({ error: 'Failed to fetch builder request' });
  }
});

router.get('/templates', async (req: AuthRequest, res: Response) => {
  try {
    const templates = Object.values(TEMPLATES).map(t => ({
      key: t.key,
      name: t.name,
      description: t.description,
      modules: t.modules,
      connectors: t.connectors
    }));
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

export const builderRoutes = router;
