'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle2, 
  Circle, 
  AlertTriangle, 
  XCircle, 
  ArrowRight, 
  Lightbulb, 
  HelpCircle, 
  RefreshCcw,
  Rocket,
  Clock,
  AlertCircle
} from 'lucide-react';

interface SuccessStage {
  completed: boolean;
  percent: number;
}

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
  actionType: string;
  route?: string;
  buttonLabel?: string;
}

interface SuccessPathData {
  currentStage: string;
  completionPercent: number;
  blockingIssues: BlockingIssue[];
  nextBestAction: NextBestAction;
  stageProgress: Record<string, SuccessStage>;
}

interface ContextualHelpData {
  screen: string;
  title: string;
  explanation: string;
  commonMistakes: string[];
  tips: string[];
}

interface RecoveryIssue {
  issueType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  whyThisHappened: string;
  estimatedFixTime: string;
  recoverySteps: string[];
  autoFixAvailable: boolean;
}

interface RecoveryData {
  status: string;
  issueCount: number;
  issues: RecoveryIssue[];
}

interface NextStep {
  id: string;
  title: string;
  reason: string;
  route: string;
  priority: number;
}

interface NextStepsData {
  lastAction: string;
  nextSteps: NextStep[];
}

const STAGE_LABELS: Record<string, string> = {
  onboarding: 'Setup Wizard',
  preview: 'Preview',
  payment: 'Subscribe',
  deploy: 'Deploy',
  live: 'Live'
};

const STAGE_ORDER = ['onboarding', 'preview', 'payment', 'deploy', 'live'];

export default function SuccessPage() {
  const { token, tenantId } = useAuth();
  const router = useRouter();
  const [successPath, setSuccessPath] = useState<SuccessPathData | null>(null);
  const [contextualHelp, setContextualHelp] = useState<ContextualHelpData | null>(null);
  const [recovery, setRecovery] = useState<RecoveryData | null>(null);
  const [nextSteps, setNextSteps] = useState<NextStepsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHelpScreen, setSelectedHelpScreen] = useState('dashboard');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'x-tenant-id': tenantId || ''
  };

  const fetchSuccessPath = async () => {
    try {
      const res = await fetch('/api/success/path', { headers });
      if (res.ok) setSuccessPath(await res.json());
    } catch (error) {
      console.error('Failed to fetch success path:', error);
    }
  };

  const fetchContextualHelp = async (screen: string) => {
    try {
      const res = await fetch(`/api/success/help/context?screen=${screen}`, { headers });
      if (res.ok) setContextualHelp(await res.json());
    } catch (error) {
      console.error('Failed to fetch contextual help:', error);
    }
  };

  const fetchRecovery = async () => {
    try {
      const res = await fetch('/api/success/recovery/status', { headers });
      if (res.ok) setRecovery(await res.json());
    } catch (error) {
      console.error('Failed to fetch recovery status:', error);
    }
  };

  const fetchNextSteps = async (lastAction?: string) => {
    try {
      const url = lastAction 
        ? `/api/success/next-steps?lastAction=${lastAction}` 
        : '/api/success/next-steps';
      const res = await fetch(url, { headers });
      if (res.ok) setNextSteps(await res.json());
    } catch (error) {
      console.error('Failed to fetch next steps:', error);
    }
  };

  useEffect(() => {
    if (token && tenantId) {
      Promise.all([
        fetchSuccessPath(),
        fetchContextualHelp('dashboard'),
        fetchRecovery(),
        fetchNextSteps()
      ]).finally(() => setLoading(false));
    }
  }, [token, tenantId]);

  const handleHelpScreenChange = (screen: string) => {
    setSelectedHelpScreen(screen);
    fetchContextualHelp(screen);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      case 'high': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      case 'low': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
      case 'error': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      case 'warning': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'high':
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6" data-testid="success-page-loading">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-48 bg-muted rounded"></div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-64 bg-muted rounded"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="success-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Success Center</h1>
          <p className="text-muted-foreground">Track your progress and get help when you need it</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => {
            setLoading(true);
            Promise.all([
              fetchSuccessPath(),
              fetchRecovery(),
              fetchNextSteps()
            ]).finally(() => setLoading(false));
          }}
          data-testid="button-refresh"
        >
          <RefreshCcw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {successPath && (
        <Card data-testid="success-path-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="w-5 h-5" />
                  Your Success Path
                </CardTitle>
                <CardDescription>
                  {successPath.completionPercent === 100 
                    ? 'Congratulations! Your app is live!' 
                    : `${successPath.completionPercent}% complete - ${STAGE_LABELS[successPath.currentStage]} in progress`}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold" data-testid="text-completion-percent">
                  {successPath.completionPercent}%
                </div>
                <div className="text-sm text-muted-foreground">Complete</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={successPath.completionPercent} className="h-3" data-testid="progress-bar" />
            
            <div className="flex items-center justify-between" data-testid="stage-indicators">
              {STAGE_ORDER.map((stage, idx) => {
                const stageData = successPath.stageProgress[stage];
                const isCompleted = stageData?.completed;
                const isCurrent = stage === successPath.currentStage;
                
                return (
                  <div 
                    key={stage} 
                    className={`flex flex-col items-center ${idx < STAGE_ORDER.length - 1 ? 'flex-1' : ''}`}
                  >
                    <div className="flex items-center w-full">
                      <div className={`
                        flex items-center justify-center w-10 h-10 rounded-full border-2 
                        ${isCompleted ? 'bg-green-500 border-green-500 text-white' : 
                          isCurrent ? 'border-primary bg-primary/10 text-primary' : 
                          'border-muted-foreground/30 text-muted-foreground'}
                      `} data-testid={`stage-${stage}`}>
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </div>
                      {idx < STAGE_ORDER.length - 1 && (
                        <div className={`flex-1 h-1 mx-2 ${
                          isCompleted ? 'bg-green-500' : 'bg-muted'
                        }`} />
                      )}
                    </div>
                    <span className={`mt-2 text-xs font-medium ${
                      isCurrent ? 'text-primary' : isCompleted ? 'text-green-600' : 'text-muted-foreground'
                    }`}>
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                );
              })}
            </div>

            {successPath.nextBestAction && (
              <Card className="bg-primary/5 border-primary/20" data-testid="next-action-card">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <ArrowRight className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold">{successPath.nextBestAction.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {successPath.nextBestAction.description}
                        </div>
                      </div>
                    </div>
                    {successPath.nextBestAction.route && (
                      <Button 
                        onClick={() => router.push(successPath.nextBestAction.route!)}
                        data-testid="button-next-action"
                      >
                        {successPath.nextBestAction.buttonLabel || 'Continue'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {successPath.blockingIssues.length > 0 && (
              <div className="space-y-3" data-testid="blocking-issues">
                <h4 className="font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Issues to Address ({successPath.blockingIssues.length})
                </h4>
                {successPath.blockingIssues.map((issue) => (
                  <div 
                    key={issue.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${getSeverityColor(issue.severity)}`}
                    data-testid={`issue-${issue.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {getSeverityIcon(issue.severity)}
                      <div>
                        <div className="font-medium">{issue.title}</div>
                        <div className="text-sm opacity-80">{issue.description}</div>
                      </div>
                    </div>
                    {issue.fixRoute && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => router.push(issue.fixRoute!)}
                        data-testid={`button-fix-${issue.id}`}
                      >
                        Fix
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card data-testid="recovery-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCcw className="w-5 h-5" />
              Recovery Status
            </CardTitle>
            <CardDescription>
              Detected issues and how to fix them
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recovery ? (
              <div className="space-y-4">
                <div className={`flex items-center gap-3 p-3 rounded-lg ${
                  recovery.status === 'healthy' ? 'bg-green-100 dark:bg-green-900/30' :
                  recovery.status === 'critical' ? 'bg-red-100 dark:bg-red-900/30' :
                  'bg-yellow-100 dark:bg-yellow-900/30'
                }`} data-testid="recovery-status">
                  {recovery.status === 'healthy' ? (
                    <>
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                      <div>
                        <div className="font-semibold text-green-700 dark:text-green-400">All Systems Healthy</div>
                        <div className="text-sm text-green-600 dark:text-green-500">No issues detected</div>
                      </div>
                    </>
                  ) : (
                    <>
                      {recovery.status === 'critical' ? (
                        <XCircle className="w-6 h-6 text-red-600" />
                      ) : (
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                      )}
                      <div>
                        <div className={`font-semibold ${
                          recovery.status === 'critical' ? 'text-red-700 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-400'
                        }`}>
                          {recovery.issueCount} Issue{recovery.issueCount !== 1 ? 's' : ''} Found
                        </div>
                        <div className="text-sm opacity-80">Action required</div>
                      </div>
                    </>
                  )}
                </div>

                {recovery.issues.length > 0 && (
                  <div className="space-y-3 max-h-80 overflow-y-auto" data-testid="recovery-issues">
                    {recovery.issues.map((issue, idx) => (
                      <div 
                        key={idx}
                        className={`p-3 rounded-lg border-l-4 ${getSeverityColor(issue.severity)}`}
                        style={{
                          borderLeftColor: issue.severity === 'critical' ? '#dc2626' :
                                          issue.severity === 'high' ? '#ea580c' :
                                          issue.severity === 'medium' ? '#ca8a04' : '#2563eb'
                        }}
                        data-testid={`recovery-issue-${idx}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge className={getSeverityColor(issue.severity)}>
                            {issue.severity}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {issue.estimatedFixTime}
                          </div>
                        </div>
                        <div className="text-sm font-medium mb-1">
                          {issue.issueType.replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {issue.whyThisHappened}
                        </div>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-primary hover:underline">
                            View recovery steps
                          </summary>
                          <ol className="list-decimal list-inside mt-2 space-y-1 text-muted-foreground">
                            {issue.recoverySteps.map((step, stepIdx) => (
                              <li key={stepIdx}>{step}</li>
                            ))}
                          </ol>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No recovery data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="next-steps-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5" />
              What's Next
            </CardTitle>
            <CardDescription>
              Recommended actions based on your progress
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nextSteps?.nextSteps.length ? (
              <div className="space-y-3" data-testid="next-steps-list">
                {nextSteps.nextSteps.map((step, idx) => (
                  <div 
                    key={step.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => router.push(step.route)}
                    data-testid={`next-step-${step.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-medium">{step.title}</div>
                        <div className="text-sm text-muted-foreground">{step.reason}</div>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>You're all caught up!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="contextual-help-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            Contextual Help
          </CardTitle>
          <CardDescription>
            Get tips and avoid common mistakes for each area
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedHelpScreen} onValueChange={handleHelpScreenChange}>
            <TabsList className="flex-wrap h-auto gap-1 mb-4">
              <TabsTrigger value="dashboard" data-testid="help-tab-dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="onboarding" data-testid="help-tab-onboarding">Setup</TabsTrigger>
              <TabsTrigger value="preview" data-testid="help-tab-preview">Preview</TabsTrigger>
              <TabsTrigger value="billing" data-testid="help-tab-billing">Billing</TabsTrigger>
              <TabsTrigger value="deploy" data-testid="help-tab-deploy">Deploy</TabsTrigger>
              <TabsTrigger value="monitoring" data-testid="help-tab-monitoring">Monitoring</TabsTrigger>
              <TabsTrigger value="support" data-testid="help-tab-support">Support</TabsTrigger>
            </TabsList>
            
            {contextualHelp && (
              <div className="space-y-4" data-testid="help-content">
                <div>
                  <h3 className="text-lg font-semibold">{contextualHelp.title}</h3>
                  <p className="text-muted-foreground mt-1">{contextualHelp.explanation}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                    <h4 className="font-medium text-red-700 dark:text-red-400 flex items-center gap-2 mb-2">
                      <XCircle className="w-4 h-4" />
                      Common Mistakes
                    </h4>
                    <ul className="space-y-1 text-sm text-red-600 dark:text-red-400">
                      {contextualHelp.commonMistakes.map((mistake, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1">•</span>
                          <span>{mistake}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                    <h4 className="font-medium text-green-700 dark:text-green-400 flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4" />
                      Tips
                    </h4>
                    <ul className="space-y-1 text-sm text-green-600 dark:text-green-400">
                      {contextualHelp.tips.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
