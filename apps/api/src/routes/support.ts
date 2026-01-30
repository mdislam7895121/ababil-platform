import { Router, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const TICKET_RATE_LIMIT = 10;
const ticketRateLimits: Map<string, { count: number; resetAt: Date }> = new Map();

function checkTicketRateLimit(tenantId: string): boolean {
  const now = new Date();
  const key = tenantId;
  const limit = ticketRateLimits.get(key);
  
  if (!limit || limit.resetAt < now) {
    ticketRateLimits.set(key, { count: 1, resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
    return true;
  }
  
  if (limit.count >= TICKET_RATE_LIMIT) {
    return false;
  }
  
  limit.count++;
  return true;
}

function redactSecrets(text: string): string {
  return text
    .replace(/(?:password|secret|key|token|api_key|apikey)[\s]*[=:]\s*['"]?[^\s'"]+['"]?/gi, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, 'Bearer [REDACTED]')
    .replace(/[A-Za-z0-9]{32,}/g, (match) => {
      if (match.length > 40) return '[REDACTED_KEY]';
      return match;
    });
}

const createTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  message: z.string().min(10).max(5000),
  category: z.enum(['deploy', 'billing', 'preview', 'bug', 'question']).default('question'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium')
});

const addMessageSchema = z.object({
  message: z.string().min(1).max(5000),
  attachments: z.array(z.object({
    name: z.string().max(255),
    size: z.number().max(10 * 1024 * 1024),
    type: z.string().max(100)
  })).max(5).default([])
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'waiting', 'solved', 'closed'])
});

const updatePrioritySchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'critical'])
});

const linkIncidentSchema = z.object({
  incidentId: z.string().uuid()
});

router.post('/tickets', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    if (!checkTicketRateLimit(req.tenantId!)) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: `Maximum ${TICKET_RATE_LIMIT} tickets per day per tenant`
      });
    }

    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const { subject, message, category, priority } = parsed.data;

    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: req.tenantId!,
        createdByUserId: req.user!.id,
        subject: redactSecrets(subject),
        category,
        priority,
        status: 'open'
      }
    });

    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user!.id,
        authorRole: 'customer',
        message: redactSecrets(message),
        attachments: []
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'SUPPORT_TICKET_CREATED',
        entityType: 'support_ticket',
        entityId: ticket.id,
        metadata: { category, priority }
      }
    });

    res.status(201).json({ 
      ticket,
      message: 'Ticket created successfully'
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.get('/tickets', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, page = '1', limit = '20' } = req.query;
    
    const where: any = { tenantId: req.tenantId! };
    if (status) where.status = status as string;
    if (priority) where.priority = priority as string;

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      take: parseInt(limit as string),
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const total = await prisma.supportTicket.count({ where });

    res.json({ tickets, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (error) {
    console.error('List tickets error:', error);
    res.status(500).json({ error: 'Failed to list tickets' });
  }
});

router.get('/tickets/:id', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: { 
        id: req.params.id,
        tenantId: req.tenantId!
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    let incident = null;
    if (ticket.linkedIncidentId) {
      incident = await prisma.incident.findUnique({
        where: { id: ticket.linkedIncidentId }
      });
    }

    res.json({ ticket, incident });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ error: 'Failed to get ticket' });
  }
});

router.post('/tickets/:id/messages', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = addMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { 
        id: req.params.id,
        tenantId: req.tenantId!
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const membership = await prisma.membership.findFirst({
      where: { actorUserId: req.user!.id, tenantId: req.tenantId! }
    });

    const authorRole = ['owner', 'admin'].includes(membership?.role || '') ? 'admin' : 
                       membership?.role === 'staff' ? 'staff' : 'customer';

    const message = await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user!.id,
        authorRole,
        message: redactSecrets(parsed.data.message),
        attachments: parsed.data.attachments
      }
    });

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date() }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'SUPPORT_MESSAGE_ADDED',
        entityType: 'support_message',
        entityId: message.id,
        metadata: { ticketId: ticket.id, authorRole }
      }
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

router.post('/tickets/:id/status', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { 
        id: req.params.id,
        tenantId: req.tenantId!
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const oldStatus = ticket.status;
    const updateData: any = { status: parsed.data.status };
    
    if (parsed.data.status === 'solved' && !ticket.solvedAt) {
      updateData.solvedAt = new Date();
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: updateData
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'SUPPORT_STATUS_CHANGED',
        entityType: 'support_ticket',
        entityId: ticket.id,
        metadata: { oldStatus, newStatus: parsed.data.status }
      }
    });

    res.json({ ticket: updated });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.post('/tickets/:id/priority', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updatePrioritySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { 
        id: req.params.id,
        tenantId: req.tenantId!
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const oldPriority = ticket.priority;
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { priority: parsed.data.priority }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'SUPPORT_PRIORITY_CHANGED',
        entityType: 'support_ticket',
        entityId: ticket.id,
        metadata: { oldPriority, newPriority: parsed.data.priority }
      }
    });

    res.json({ ticket: updated });
  } catch (error) {
    console.error('Update priority error:', error);
    res.status(500).json({ error: 'Failed to update priority' });
  }
});

router.post('/tickets/:id/link-incident', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = linkIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { 
        id: req.params.id,
        tenantId: req.tenantId!
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const incident = await prisma.incident.findUnique({
      where: { id: parsed.data.incidentId }
    });

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { linkedIncidentId: incident.id }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'SUPPORT_INCIDENT_LINKED',
        entityType: 'support_ticket',
        entityId: ticket.id,
        metadata: { incidentId: incident.id, incidentType: incident.type }
      }
    });

    res.json({ ticket: updated, incident });
  } catch (error) {
    console.error('Link incident error:', error);
    res.status(500).json({ error: 'Failed to link incident' });
  }
});

router.get('/admin/tickets', requireRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, tenantId, page = '1', limit = '50' } = req.query;
    
    const where: any = {};
    if (status) where.status = status as string;
    if (priority) where.priority = priority as string;
    if (tenantId) where.tenantId = tenantId as string;

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      take: parseInt(limit as string),
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const ticketsWithSLA = tickets.map(ticket => {
      const createdAt = new Date(ticket.createdAt);
      const now = new Date();
      const hoursOpen = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
      
      const slaHours = ticket.priority === 'critical' ? 4 :
                       ticket.priority === 'high' ? 8 :
                       ticket.priority === 'medium' ? 24 : 48;
      
      const slaBreached = ticket.status !== 'solved' && ticket.status !== 'closed' && hoursOpen > slaHours;
      
      return {
        ...ticket,
        hoursOpen,
        slaHours,
        slaBreached
      };
    });

    const total = await prisma.supportTicket.count({ where });

    res.json({ 
      tickets: ticketsWithSLA, 
      total, 
      page: parseInt(page as string), 
      limit: parseInt(limit as string) 
    });
  } catch (error) {
    console.error('Admin list tickets error:', error);
    res.status(500).json({ error: 'Failed to list tickets' });
  }
});

router.post('/fix-my-deploy', requireRole('owner', 'admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    const checklist: Array<{
      issue: string;
      severity: 'error' | 'warning' | 'info';
      whyBlocks: string;
      fixSteps: string[];
      autoFixable: boolean;
    }> = [];

    const deployConfig = await prisma.deployConfig.findUnique({
      where: { tenantId: req.tenantId! }
    });

    if (!deployConfig) {
      checklist.push({
        issue: 'No deploy configuration found',
        severity: 'error',
        whyBlocks: 'Cannot proceed without basic deployment settings',
        fixSteps: [
          'Go to Dashboard → Deploy Wizard',
          'Fill in App Name, Provider, and Database URL',
          'Save configuration'
        ],
        autoFixable: false
      });
    } else {
      if (!deployConfig.appUrl) {
        checklist.push({
          issue: 'App URL not configured',
          severity: 'warning',
          whyBlocks: 'Remote verification cannot run without target URL',
          fixSteps: [
            'Go to Dashboard → Deploy Wizard → Settings',
            'Enter your production App URL',
            'Save configuration'
          ],
          autoFixable: false
        });
      }

      if (deployConfig.status === 'pending') {
        checklist.push({
          issue: 'Deployment not started',
          severity: 'info',
          whyBlocks: 'No deployment has been initiated yet',
          fixSteps: [
            'Generate a deploy pack for your provider',
            'Download and deploy to your hosting platform',
            'Run remote verification'
          ],
          autoFixable: false
        });
      }
    }

    const lastVerify = await prisma.deployVerificationRun.findFirst({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' }
    });

    if (!lastVerify) {
      checklist.push({
        issue: 'No verification run found',
        severity: 'error',
        whyBlocks: 'Go-Live requires at least one successful verification',
        fixSteps: [
          'Deploy your application to production',
          'Go to Dashboard → Deploy Wizard → Remote Verification',
          'Enter your production URL and click Verify'
        ],
        autoFixable: false
      });
    } else if (lastVerify.status === 'fail') {
      const checks = lastVerify.checks as any[];
      const failedChecks = checks.filter((c: any) => !c.passed);
      
      failedChecks.forEach((check: any) => {
        if (check.name === 'health_endpoint') {
          checklist.push({
            issue: 'Health endpoint not responding',
            severity: 'error',
            whyBlocks: 'Application may not be running or is unreachable',
            fixSteps: [
              'Verify your app is deployed and running',
              'Check if /api/health endpoint exists',
              'Check firewall and port settings',
              'Review server logs for startup errors'
            ],
            autoFixable: false
          });
        }
        if (check.name === 'ready_endpoint') {
          checklist.push({
            issue: 'Ready endpoint failed',
            severity: 'error',
            whyBlocks: 'Database connection may not be established',
            fixSteps: [
              'Verify DATABASE_URL is set correctly',
              'Check database server is running',
              'Run prisma db push on production',
              'Check for migration errors'
            ],
            autoFixable: false
          });
        }
        if (check.name === 'web_accessible') {
          checklist.push({
            issue: 'Web frontend not accessible',
            severity: 'warning',
            whyBlocks: 'Users will not be able to access the application',
            fixSteps: [
              'Check if web build completed successfully',
              'Verify static files are being served',
              'Check CORS and proxy configuration'
            ],
            autoFixable: false
          });
        }
      });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: req.tenantId! }
    });

    if (!subscription || subscription.status !== 'active') {
      checklist.push({
        issue: 'No active subscription',
        severity: 'error',
        whyBlocks: 'Go-Live requires an active Pro or Business subscription',
        fixSteps: [
          'Go to Dashboard → Billing',
          'Subscribe to Pro ($39/mo) or Business ($99/mo)',
          'Wait for payment confirmation'
        ],
        autoFixable: false
      });
    }

    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      checklist.push({
        issue: 'SESSION_SECRET not configured or too weak',
        severity: 'error',
        whyBlocks: 'Authentication will not be secure',
        fixSteps: [
          'Generate a strong secret: openssl rand -base64 32',
          'Set SESSION_SECRET environment variable',
          'Restart the application'
        ],
        autoFixable: true
      });
    }

    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
      checklist.push({
        issue: 'ENCRYPTION_KEY not configured or too weak',
        severity: 'error',
        whyBlocks: 'Secrets cannot be encrypted securely',
        fixSteps: [
          'Generate a strong key: openssl rand -base64 32',
          'Set ENCRYPTION_KEY environment variable',
          'Restart the application'
        ],
        autoFixable: true
      });
    }

    const errorCount = checklist.filter(c => c.severity === 'error').length;
    const warningCount = checklist.filter(c => c.severity === 'warning').length;

    res.json({
      status: errorCount > 0 ? 'blocked' : warningCount > 0 ? 'warnings' : 'ready',
      summary: {
        errors: errorCount,
        warnings: warningCount,
        total: checklist.length
      },
      checklist,
      lastVerificationAt: lastVerify?.createdAt || null,
      lastVerificationStatus: lastVerify?.status || null
    });
  } catch (error) {
    console.error('Fix my deploy error:', error);
    res.status(500).json({ error: 'Failed to analyze deployment' });
  }
});

export default router;
