import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

type SuccessStage = 'onboarding' | 'preview' | 'payment' | 'deploy' | 'live';

interface BlockingIssue {
  id: string;
  title: string;
  description: string;
  severity: 'error' | 'warning';
  fixRoute?: string;
}

interface NextBestAction {
  title: string;
  description: string;
  actionType: 'navigate' | 'action' | 'info';
  route?: string;
  buttonLabel?: string;
}

interface SuccessPathResponse {
  currentStage: SuccessStage;
  completionPercent: number;
  blockingIssues: BlockingIssue[];
  nextBestAction: NextBestAction;
  stageProgress: Record<SuccessStage, { completed: boolean; percent: number }>;
}

const STAGE_WEIGHTS = {
  onboarding: 20,
  preview: 20,
  payment: 20,
  deploy: 20,
  live: 20
};

async function calculateSuccessPath(tenantId: string): Promise<SuccessPathResponse> {
  const blockingIssues: BlockingIssue[] = [];
  const stageProgress: Record<SuccessStage, { completed: boolean; percent: number }> = {
    onboarding: { completed: false, percent: 0 },
    preview: { completed: false, percent: 0 },
    payment: { completed: false, percent: 0 },
    deploy: { completed: false, percent: 0 },
    live: { completed: false, percent: 0 }
  };

  const [
    builderRequest,
    blueprint,
    previewSession,
    subscription,
    deployConfig,
    verificationRun,
    moduleFlags
  ] = await Promise.all([
    prisma.builderRequest.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.blueprint.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.previewSession.findFirst({ where: { tenantId, status: 'active' }, orderBy: { createdAt: 'desc' } }),
    prisma.subscription.findFirst({ where: { tenantId } }),
    prisma.deployConfig.findUnique({ where: { tenantId } }),
    prisma.deployVerificationRun.findFirst({ where: { tenantId, status: 'pass' }, orderBy: { createdAt: 'desc' } }),
    prisma.moduleFlag.findMany({ where: { tenantId, enabled: true } })
  ]);

  if (builderRequest && blueprint) {
    stageProgress.onboarding.completed = true;
    stageProgress.onboarding.percent = 100;
  } else if (builderRequest) {
    stageProgress.onboarding.percent = 50;
    blockingIssues.push({
      id: 'no-blueprint',
      title: 'Blueprint not generated',
      description: 'Complete the setup wizard to generate your app blueprint',
      severity: 'warning',
      fixRoute: '/dashboard/onboarding'
    });
  } else {
    blockingIssues.push({
      id: 'no-onboarding',
      title: 'Onboarding not started',
      description: 'Start the setup wizard to configure your platform',
      severity: 'error',
      fixRoute: '/dashboard/onboarding'
    });
  }

  if (previewSession) {
    stageProgress.preview.completed = true;
    stageProgress.preview.percent = 100;
  } else if (blueprint) {
    stageProgress.preview.percent = 0;
    blockingIssues.push({
      id: 'no-preview',
      title: 'No live preview',
      description: 'Create a preview to test your configuration before going live',
      severity: 'warning',
      fixRoute: '/dashboard/preview'
    });
  }

  if (subscription && subscription.status === 'active') {
    stageProgress.payment.completed = true;
    stageProgress.payment.percent = 100;
  } else if (subscription && subscription.status === 'pending') {
    stageProgress.payment.percent = 50;
    blockingIssues.push({
      id: 'payment-pending',
      title: 'Payment pending',
      description: 'Complete payment to unlock Go-Live features',
      severity: 'warning',
      fixRoute: '/dashboard/billing'
    });
  } else {
    blockingIssues.push({
      id: 'no-subscription',
      title: 'No active subscription',
      description: 'Subscribe to a paid plan to go live',
      severity: 'error',
      fixRoute: '/dashboard/billing'
    });
  }

  if (deployConfig && deployConfig.status === 'deployed') {
    stageProgress.deploy.completed = true;
    stageProgress.deploy.percent = 100;
  } else if (deployConfig && deployConfig.status === 'configured') {
    stageProgress.deploy.percent = 50;
    blockingIssues.push({
      id: 'deploy-not-started',
      title: 'Deployment not started',
      description: 'Generate and deploy your application',
      severity: 'warning',
      fixRoute: '/dashboard/deploy'
    });
  } else if (deployConfig) {
    stageProgress.deploy.percent = 25;
  }

  if (verificationRun && deployConfig?.status === 'deployed') {
    stageProgress.live.completed = true;
    stageProgress.live.percent = 100;
  } else if (verificationRun) {
    stageProgress.live.percent = 50;
  }

  let completionPercent = 0;
  for (const [stage, weight] of Object.entries(STAGE_WEIGHTS)) {
    completionPercent += (stageProgress[stage as SuccessStage].percent / 100) * weight;
  }

  let currentStage: SuccessStage = 'onboarding';
  if (stageProgress.onboarding.completed) currentStage = 'preview';
  if (stageProgress.preview.completed) currentStage = 'payment';
  if (stageProgress.payment.completed) currentStage = 'deploy';
  if (stageProgress.deploy.completed) currentStage = 'live';

  let nextBestAction: NextBestAction;
  switch (currentStage) {
    case 'onboarding':
      nextBestAction = {
        title: 'Complete Setup Wizard',
        description: 'Answer a few questions to configure your platform',
        actionType: 'navigate',
        route: '/dashboard/onboarding',
        buttonLabel: 'Start Setup'
      };
      break;
    case 'preview':
      nextBestAction = {
        title: 'Create Preview',
        description: 'Test your configuration with a live preview',
        actionType: 'navigate',
        route: '/dashboard/preview',
        buttonLabel: 'Create Preview'
      };
      break;
    case 'payment':
      nextBestAction = {
        title: 'Subscribe to Go Live',
        description: 'Choose a plan to unlock deployment features',
        actionType: 'navigate',
        route: '/dashboard/billing',
        buttonLabel: 'View Plans'
      };
      break;
    case 'deploy':
      nextBestAction = {
        title: 'Deploy Your App',
        description: 'Generate deployment package and go live',
        actionType: 'navigate',
        route: '/dashboard/deploy',
        buttonLabel: 'Deploy Now'
      };
      break;
    case 'live':
      nextBestAction = {
        title: 'Your App is Live!',
        description: 'Monitor performance and manage your platform',
        actionType: 'navigate',
        route: '/dashboard/monitoring',
        buttonLabel: 'View Dashboard'
      };
      break;
  }

  return {
    currentStage,
    completionPercent: Math.round(completionPercent),
    blockingIssues: blockingIssues.slice(0, 5),
    nextBestAction,
    stageProgress
  };
}

router.get('/path', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const successPath = await calculateSuccessPath(req.tenantId!);

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'SUCCESS_PATH_VIEWED',
        entityType: 'success_path',
        entityId: req.tenantId!,
        metadata: { 
          currentStage: successPath.currentStage,
          completionPercent: successPath.completionPercent
        }
      }
    });

    res.json(successPath);
  } catch (error) {
    console.error('Get success path error:', error);
    res.status(500).json({ error: 'Failed to get success path' });
  }
});

const CONTEXTUAL_HELP: Record<string, { title: string; explanation: string; commonMistakes: string[]; tips: string[] }> = {
  dashboard: {
    title: 'Your Dashboard',
    explanation: 'This is your home base. Here you can see an overview of your platform, recent activity, and quick access to all features.',
    commonMistakes: [
      'Ignoring the success path progress bar',
      'Not checking for blocking issues before trying to deploy'
    ],
    tips: [
      'Check the success path panel to see what to do next',
      'Use the quick actions to navigate to common tasks'
    ]
  },
  deploy: {
    title: 'Deploy Wizard',
    explanation: 'This wizard helps you deploy your platform to production. Follow the steps to configure your deployment settings, generate a deploy pack, and verify your live application.',
    commonMistakes: [
      'Forgetting to set the DATABASE_URL environment variable',
      'Using the wrong App URL format (must include https://)',
      'Not running verification after deployment',
      'Deploying without an active subscription'
    ],
    tips: [
      'Always run remote verification after deploying',
      'Keep your encryption keys safe and backed up',
      'Use the "Fix My Deploy" helper if you get stuck',
      'Check the preflight checklist before deploying'
    ]
  },
  preview: {
    title: 'Live Preview',
    explanation: 'Preview mode lets you test your configuration before going live. Share the preview link with stakeholders to get feedback.',
    commonMistakes: [
      'Sharing preview links with sensitive test data',
      'Forgetting preview sessions expire after 24 hours',
      'Not testing all workflows in preview'
    ],
    tips: [
      'Create a new preview after making configuration changes',
      'Use preview to validate your setup before paying',
      'Share preview links with your team for feedback'
    ]
  },
  billing: {
    title: 'Billing & Subscriptions',
    explanation: 'Manage your subscription plan here. You need an active subscription to deploy and go live with your platform.',
    commonMistakes: [
      'Trying to deploy on the free plan',
      'Not updating payment method when card expires',
      'Canceling subscription before exporting data'
    ],
    tips: [
      'Start with Pro plan for 1 live app',
      'Upgrade to Business for multiple apps and priority support',
      'Check the revenue dashboard to track your earnings'
    ]
  },
  onboarding: {
    title: 'Setup Wizard',
    explanation: 'The setup wizard helps you configure your platform by answering a few questions about your business. This creates a customized blueprint.',
    commonMistakes: [
      'Skipping the wizard and trying to configure manually',
      'Choosing the wrong business type',
      'Not completing all required fields'
    ],
    tips: [
      'Answer honestly about your business needs',
      'You can always modify settings later',
      'The wizard takes about 5 minutes to complete'
    ]
  },
  modules: {
    title: 'Module Configuration',
    explanation: 'Modules are features you can enable or disable for your platform. Each module adds specific functionality like booking, payments, or CRM.',
    commonMistakes: [
      'Enabling too many modules at once',
      'Not configuring module settings after enabling',
      'Disabling modules that have dependencies'
    ],
    tips: [
      'Start with essential modules only',
      'Review module settings after enabling',
      'Check module dependencies before disabling'
    ]
  },
  support: {
    title: 'Support Center',
    explanation: 'Get help from our support team. Create tickets, track progress, and access the Fix My Deploy helper for deployment issues.',
    commonMistakes: [
      'Not providing enough context in support tickets',
      'Creating duplicate tickets for the same issue',
      'Not checking the Fix My Deploy helper first'
    ],
    tips: [
      'Use "Fix My Deploy" for deployment issues first',
      'Include error messages and screenshots',
      'Check ticket status for updates'
    ]
  },
  monitoring: {
    title: 'Monitoring & Health',
    explanation: 'Monitor your live application health, performance, and incidents. Set up alerts to get notified of issues.',
    commonMistakes: [
      'Ignoring warning alerts',
      'Not setting up notification channels',
      'Not reviewing incident history'
    ],
    tips: [
      'Set up email alerts for critical issues',
      'Review health status daily',
      'Configure uptime checks for your app URL'
    ]
  }
};

router.get('/help/context', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const { screen } = req.query;
    const screenKey = (screen as string)?.toLowerCase() || 'dashboard';
    
    const help = CONTEXTUAL_HELP[screenKey] || CONTEXTUAL_HELP['dashboard'];

    res.json({
      screen: screenKey,
      ...help
    });
  } catch (error) {
    console.error('Get contextual help error:', error);
    res.status(500).json({ error: 'Failed to get contextual help' });
  }
});

interface RecoveryIssue {
  issueType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  whyThisHappened: string;
  estimatedFixTime: string;
  recoverySteps: string[];
  autoFixAvailable: boolean;
  autoFixAction?: string;
}

router.get('/recovery/status', requireRole('owner', 'admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    const issues: RecoveryIssue[] = [];

    const [
      lastVerification,
      deployConfig,
      activeIncidents,
      healthChecks,
      subscription
    ] = await Promise.all([
      prisma.deployVerificationRun.findFirst({ 
        where: { tenantId: req.tenantId! }, 
        orderBy: { createdAt: 'desc' } 
      }),
      prisma.deployConfig.findUnique({ where: { tenantId: req.tenantId! } }),
      prisma.incident.findMany({ 
        where: { tenantId: req.tenantId!, status: { in: ['triggered', 'acknowledged'] } } 
      }),
      prisma.healthCheck.findMany({ 
        where: { tenantId: req.tenantId!, enabled: true } 
      }),
      prisma.subscription.findFirst({ where: { tenantId: req.tenantId! } })
    ]);

    if (lastVerification?.status === 'fail') {
      const checks = lastVerification.checks as any[];
      const failedChecks = checks.filter((c: any) => !c.passed);
      
      for (const check of failedChecks) {
        if (check.name === 'health_endpoint') {
          issues.push({
            issueType: 'verification_failed_health',
            severity: 'critical',
            whyThisHappened: 'Your application health endpoint is not responding. This usually means the app is not running or has crashed.',
            estimatedFixTime: '5-15 minutes',
            recoverySteps: [
              'Check your hosting provider dashboard for errors',
              'Review application logs for crash messages',
              'Verify the app is deployed and running',
              'Check if port 5000 is accessible',
              'Re-deploy if necessary'
            ],
            autoFixAvailable: false
          });
        }
        if (check.name === 'ready_endpoint') {
          issues.push({
            issueType: 'verification_failed_database',
            severity: 'critical',
            whyThisHappened: 'The database connection failed. This means your app cannot store or retrieve data.',
            estimatedFixTime: '10-30 minutes',
            recoverySteps: [
              'Verify DATABASE_URL is set correctly in environment',
              'Check database server is running and accessible',
              'Run prisma db push to sync schema',
              'Check for connection pool exhaustion',
              'Verify network/firewall allows database connections'
            ],
            autoFixAvailable: false
          });
        }
      }
    }

    for (const incident of activeIncidents) {
      issues.push({
        issueType: `incident_${incident.type}`,
        severity: incident.severity as any,
        whyThisHappened: `Active incident detected: ${incident.title}`,
        estimatedFixTime: incident.severity === 'critical' ? 'Immediate action required' : '15-60 minutes',
        recoverySteps: [
          'Review incident details in monitoring',
          'Check related logs and metrics',
          'Follow incident playbook if available',
          'Escalate if unable to resolve'
        ],
        autoFixAvailable: false
      });
    }

    for (const check of healthChecks) {
      const lastStatus = check.lastStatus as any;
      if (lastStatus?.status === 'down') {
        issues.push({
          issueType: 'health_check_failing',
          severity: 'high',
          whyThisHappened: `Health check "${check.name}" is failing. The monitored endpoint is not responding.`,
          estimatedFixTime: '5-30 minutes',
          recoverySteps: [
            `Check the URL: ${check.url}`,
            'Verify the service is running',
            'Check for network issues',
            'Review recent deployments for breaking changes'
          ],
          autoFixAvailable: false
        });
      }
    }

    if (subscription && subscription.status === 'past_due') {
      issues.push({
        issueType: 'payment_past_due',
        severity: 'high',
        whyThisHappened: 'Your subscription payment is past due. Service may be interrupted.',
        estimatedFixTime: '5 minutes',
        recoverySteps: [
          'Go to Billing page',
          'Update payment method',
          'Retry payment'
        ],
        autoFixAvailable: false
      });
    }

    if (!deployConfig || deployConfig.status === 'pending') {
      issues.push({
        issueType: 'deploy_not_configured',
        severity: 'medium',
        whyThisHappened: 'Deployment is not configured. You need to set up deployment settings to go live.',
        estimatedFixTime: '10 minutes',
        recoverySteps: [
          'Go to Deploy Wizard',
          'Configure provider and settings',
          'Save configuration'
        ],
        autoFixAvailable: false
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'RECOVERY_STATUS_CHECKED',
        entityType: 'recovery',
        entityId: req.tenantId!,
        metadata: { issueCount: issues.length }
      }
    });

    res.json({
      status: issues.length === 0 ? 'healthy' : issues.some(i => i.severity === 'critical') ? 'critical' : 'issues_found',
      issueCount: issues.length,
      issues: issues.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
    });
  } catch (error) {
    console.error('Get recovery status error:', error);
    res.status(500).json({ error: 'Failed to get recovery status' });
  }
});

interface NextStep {
  id: string;
  title: string;
  reason: string;
  route: string;
  priority: number;
}

router.get('/next-steps', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const { lastAction } = req.query;
    const nextSteps: NextStep[] = [];

    const [
      builderRequest,
      previewSession,
      subscription,
      deployConfig,
      verificationRun
    ] = await Promise.all([
      prisma.builderRequest.findFirst({ where: { tenantId: req.tenantId! }, orderBy: { createdAt: 'desc' } }),
      prisma.previewSession.findFirst({ where: { tenantId: req.tenantId!, status: 'active' } }),
      prisma.subscription.findFirst({ where: { tenantId: req.tenantId! } }),
      prisma.deployConfig.findUnique({ where: { tenantId: req.tenantId! } }),
      prisma.deployVerificationRun.findFirst({ where: { tenantId: req.tenantId!, status: 'pass' } })
    ]);

    switch (lastAction) {
      case 'onboarding_done':
        nextSteps.push({
          id: 'create-preview',
          title: 'Create a Preview',
          reason: 'Test your configuration before going live',
          route: '/dashboard/preview',
          priority: 1
        });
        nextSteps.push({
          id: 'review-modules',
          title: 'Review Modules',
          reason: 'Fine-tune which features are enabled',
          route: '/dashboard/modules',
          priority: 2
        });
        break;

      case 'preview_created':
        nextSteps.push({
          id: 'share-preview',
          title: 'Share Preview Link',
          reason: 'Get feedback from stakeholders',
          route: '/dashboard/preview',
          priority: 1
        });
        nextSteps.push({
          id: 'subscribe',
          title: 'Subscribe to Go Live',
          reason: 'Unlock deployment features with a paid plan',
          route: '/dashboard/billing',
          priority: 2
        });
        break;

      case 'payment_completed':
        nextSteps.push({
          id: 'configure-deploy',
          title: 'Configure Deployment',
          reason: 'Set up your hosting provider and settings',
          route: '/dashboard/deploy',
          priority: 1
        });
        nextSteps.push({
          id: 'setup-monitoring',
          title: 'Set Up Monitoring',
          reason: 'Get alerts when something goes wrong',
          route: '/dashboard/monitoring',
          priority: 2
        });
        break;

      case 'go_live_completed':
        nextSteps.push({
          id: 'view-monitoring',
          title: 'View Monitoring Dashboard',
          reason: 'Check your live app health and performance',
          route: '/dashboard/monitoring',
          priority: 1
        });
        nextSteps.push({
          id: 'configure-alerts',
          title: 'Configure Alerts',
          reason: 'Get notified of issues automatically',
          route: '/dashboard/monitoring/alerts',
          priority: 2
        });
        nextSteps.push({
          id: 'view-revenue',
          title: 'Track Revenue',
          reason: 'Monitor your business performance',
          route: '/dashboard/revenue',
          priority: 3
        });
        break;

      default:
        if (!builderRequest) {
          nextSteps.push({
            id: 'start-onboarding',
            title: 'Complete Setup Wizard',
            reason: 'Configure your platform with guided questions',
            route: '/dashboard/onboarding',
            priority: 1
          });
        } else if (!previewSession) {
          nextSteps.push({
            id: 'create-preview',
            title: 'Create a Preview',
            reason: 'Test your configuration before going live',
            route: '/dashboard/preview',
            priority: 1
          });
        } else if (!subscription || subscription.status !== 'active') {
          nextSteps.push({
            id: 'subscribe',
            title: 'Subscribe to Go Live',
            reason: 'Choose a plan to deploy your app',
            route: '/dashboard/billing',
            priority: 1
          });
        } else if (!deployConfig || deployConfig.status !== 'deployed') {
          nextSteps.push({
            id: 'deploy',
            title: 'Deploy Your App',
            reason: 'Go live with your platform',
            route: '/dashboard/deploy',
            priority: 1
          });
        } else if (!verificationRun) {
          nextSteps.push({
            id: 'verify',
            title: 'Verify Deployment',
            reason: 'Confirm your app is running correctly',
            route: '/dashboard/deploy',
            priority: 1
          });
        } else {
          nextSteps.push({
            id: 'monitor',
            title: 'Monitor Your App',
            reason: 'Keep an eye on performance and health',
            route: '/dashboard/monitoring',
            priority: 1
          });
        }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        actorUserId: req.user!.id,
        action: 'NEXT_STEP_SHOWN',
        entityType: 'next_steps',
        entityId: req.tenantId!,
        metadata: { lastAction, stepCount: nextSteps.length }
      }
    });

    res.json({
      lastAction: lastAction || 'default',
      nextSteps: nextSteps.sort((a, b) => a.priority - b.priority)
    });
  } catch (error) {
    console.error('Get next steps error:', error);
    res.status(500).json({ error: 'Failed to get next steps' });
  }
});

router.get('/context-for-support', requireRole('owner', 'admin', 'staff', 'viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const successPath = await calculateSuccessPath(req.tenantId!);

    const [
      lastIncident,
      lastVerification,
      deployConfig
    ] = await Promise.all([
      prisma.incident.findFirst({ 
        where: { tenantId: req.tenantId! }, 
        orderBy: { createdAt: 'desc' } 
      }),
      prisma.deployVerificationRun.findFirst({ 
        where: { tenantId: req.tenantId! }, 
        orderBy: { createdAt: 'desc' } 
      }),
      prisma.deployConfig.findUnique({ where: { tenantId: req.tenantId! } })
    ]);

    res.json({
      tenantStage: successPath.currentStage,
      successPercent: successPath.completionPercent,
      blockingIssues: successPath.blockingIssues,
      lastError: lastIncident ? {
        type: lastIncident.type,
        title: lastIncident.title,
        createdAt: lastIncident.createdAt
      } : null,
      lastVerification: lastVerification ? {
        status: lastVerification.status,
        createdAt: lastVerification.createdAt
      } : null,
      deployStatus: deployConfig?.status || 'not_configured',
      message: 'We already know your context - no need to explain your setup'
    });
  } catch (error) {
    console.error('Get support context error:', error);
    res.status(500).json({ error: 'Failed to get support context' });
  }
});

export default router;
