"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Rocket,
  Loader2,
  CheckCircle,
  AlertCircle,
  Server,
  Database,
  Key,
  Globe,
  ClipboardCopy,
  Play,
  History,
  Shield,
  CreditCard,
  Lock,
  Sparkles,
  X,
  Package,
  Download,
  RefreshCw,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DeployConfig {
  configured: boolean;
  provider: string | null;
  appUrl: string | null;
  status: string;
  hasDbUrl: boolean;
  hasJwtSecret: boolean;
  hasEncryptionKey: boolean;
}

interface Checklist {
  provider: string;
  envVars: Array<{ key: string; required: boolean; description: string }>;
  migration: string;
  startCommand: string;
  verificationUrls: string[];
  status: string;
  appUrl: string | null;
}

interface DeployRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  resultsJson: Record<string, { passed: boolean; message: string }> | null;
  createdAt: string;
}

interface VerifyResult {
  status: string;
  deployRunId: string;
  results: Record<string, { passed: boolean; message: string }>;
}

interface GeneratedSecrets {
  ok: boolean;
  secrets: Array<{ key: string; value: string; description: string }>;
  warning: string;
  instructions: string[];
}

interface PreflightResult {
  canDeploy: boolean;
  message: string;
  checks: Array<{ key: string; label: string; passed: boolean; message: string; blocking: boolean }>;
  blockingIssues: Array<{ key: string; label: string; message: string }>;
}

interface BillingStatus {
  plan: string;
  status: string;
  canGoLive: boolean;
  liveAppsLimit: number;
  liveAppsUsed: number;
  currentPeriodEnd?: string;
  message: string;
}

interface DeployPack {
  id: string;
  provider: string;
  appName: string;
  appUrl: string | null;
  status: string;
  downloadUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface VerificationRun {
  id: string;
  appUrl: string;
  status: string;
  checks: Array<{ name: string; passed: boolean; message: string }>;
  guidance: string | null;
  createdAt: string;
}

interface PreflightCheck {
  ready: boolean;
  hasWarnings: boolean;
  checks: Array<{ key: string; status: 'pass' | 'fail' | 'warn'; message: string; fix?: string }>;
  canGoLive: boolean;
}

interface Plan {
  key: string;
  name: string;
  priceMonthly: number;
  liveAppsLimit: number;
  features: string[];
}

const PROVIDERS = [
  { value: "REPLIT", label: "Replit", recommended: true },
  { value: "RENDER", label: "Render", recommended: false },
  { value: "RAILWAY", label: "Railway", recommended: false },
  { value: "FLY", label: "Fly.io", recommended: false },
  { value: "DOCKER", label: "Docker", recommended: false },
];

export default function DeployPage() {
  const { token, currentTenant } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState("REPLIT");
  const [appUrl, setAppUrl] = useState("");
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [jwtSecret, setJwtSecret] = useState("");
  const [generatedSecrets, setGeneratedSecrets] = useState<GeneratedSecrets | null>(null);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("pro");
  const [subscribing, setSubscribing] = useState(false);
  
  const [packProvider, setPackProvider] = useState<string>("render");
  const [packAppName, setPackAppName] = useState<string>("");
  const [remoteVerifyUrl, setRemoteVerifyUrl] = useState<string>("");

  const headers = {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": currentTenant?.id || "",
    "Content-Type": "application/json",
  };

  const { data: config, isLoading: configLoading } = useQuery<DeployConfig>({
    queryKey: ["deploy-config", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/deploy/config", { headers });
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const { data: checklist } = useQuery<Checklist>({
    queryKey: ["deploy-checklist", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/deploy/checklist", { headers });
      if (!res.ok) throw new Error("Failed to fetch checklist");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const { data: runs, isLoading: runsLoading } = useQuery<DeployRun[]>({
    queryKey: ["deploy-runs", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/deploy/runs", { headers });
      if (!res.ok) throw new Error("Failed to fetch runs");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const { data: billingStatus, refetch: refetchBilling } = useQuery<BillingStatus>({
    queryKey: ["billing-status", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/billing/status", { headers });
      if (!res.ok) throw new Error("Failed to fetch billing status");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const { data: plansData } = useQuery<{ plans: Plan[] }>({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const res = await fetch("/api/billing/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
  });

  const { data: packsData, isLoading: packsLoading } = useQuery<{ packs: DeployPack[] }>({
    queryKey: ["deploy-packs", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/deploy/packs", { headers });
      if (!res.ok) throw new Error("Failed to fetch packs");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const { data: verifyRunsData } = useQuery<{ runs: VerificationRun[] }>({
    queryKey: ["deploy-verify-runs", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/deploy/verify/runs", { headers });
      if (!res.ok) throw new Error("Failed to fetch verify runs");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const { data: preflightData } = useQuery<PreflightCheck>({
    queryKey: ["deploy-preflight", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/deploy/preflight", { headers });
      if (!res.ok) throw new Error("Failed to fetch preflight");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/deploy/config", {
        method: "POST",
        headers,
        body: JSON.stringify({ provider, appUrl, databaseUrl, jwtSecret }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save config");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Config saved", description: "Your deployment configuration has been saved securely." });
      queryClient.invalidateQueries({ queryKey: ["deploy-config"] });
      queryClient.invalidateQueries({ queryKey: ["deploy-checklist"] });
      setStep(5);
      setDatabaseUrl("");
      setJwtSecret("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation<VerifyResult>({
    mutationFn: async () => {
      const res = await fetch("/api/deploy/verify", {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Verification failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deploy-runs"] });
      queryClient.invalidateQueries({ queryKey: ["deploy-config"] });
      if (data.status === "passed") {
        toast({ title: "Verification passed", description: "Your deployment is live and healthy!" });
      } else {
        toast({ title: "Verification failed", description: "Some checks did not pass.", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Copied to clipboard" });
  };

  const generateSecretsMutation = useMutation<GeneratedSecrets>({
    mutationFn: async () => {
      const res = await fetch("/api/env/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "all" }),
      });
      if (!res.ok) throw new Error("Failed to generate secrets");
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedSecrets(data);
      toast({ title: "Secrets generated", description: data.warning });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const preflightMutation = useMutation<PreflightResult>({
    mutationFn: async () => {
      const res = await fetch("/api/deploy/preflight", {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Pre-flight check failed");
      return res.json();
    },
    onSuccess: (data) => {
      setPreflightResult(data);
      if (data.canDeploy) {
        toast({ title: "Pre-flight passed", description: "Ready to deploy!" });
      } else {
        toast({ title: "Pre-flight failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const generatePackMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/deploy/packs/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ provider: packProvider, appName: packAppName, appUrl: config?.appUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate pack");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deploy-packs"] });
      toast({ title: "Deploy pack generated!", description: `Your ${data.provider} deploy pack is ready to download.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const remoteVerifyMutation = useMutation<VerificationRun>({
    mutationFn: async () => {
      const res = await fetch("/api/deploy/verify/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ appUrl: remoteVerifyUrl }),
      });
      if (res.status === 429) {
        const err = await res.json();
        throw new Error(err.message || "Rate limit exceeded. Try again later.");
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Verification failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deploy-verify-runs"] });
      if (data.status === "pass") {
        toast({ title: "Verification passed!", description: data.guidance || "All checks passed." });
      } else {
        toast({ title: "Verification failed", description: data.guidance || "Some checks failed.", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const goLiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/deploy/go-live", {
        method: "POST",
        headers,
      });
      if (res.status === 402) {
        const data = await res.json();
        throw { code: data.code, message: data.message, isPaymentRequired: true };
      }
      if (!res.ok) throw new Error("Failed to mark as live");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deploy-config"] });
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      toast({ title: "You're LIVE!", description: "Your platform is now publicly accessible." });
    },
    onError: (err: any) => {
      if (err.isPaymentRequired) {
        setShowPaywall(true);
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

  const handleSubscribe = async (planId: string) => {
    setSubscribing(true);
    try {
      const res = await fetch("/api/billing/simulate-payment", {
        method: "POST",
        headers,
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) throw new Error("Payment failed");
      const data = await res.json();
      
      toast({ 
        title: "Subscription Active!", 
        description: data.message 
      });
      
      setShowPaywall(false);
      refetchBilling();
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubscribing(false);
    }
  };

  if (configLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Rocket className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Deploy Wizard</h1>
            <p className="text-muted-foreground">Configure and verify your production deployment</p>
          </div>
        </div>

        {config?.status === "live" && (
          <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">Your platform is LIVE</p>
                  <a href={config.appUrl || "#"} target="_blank" rel="noopener noreferrer" className="text-sm text-green-600 hover:underline">
                    {config.appUrl}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <Button
              key={s}
              variant={step === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStep(s)}
              data-testid={`step-${s}`}
            >
              Step {s}
            </Button>
          ))}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Choose Provider
              </CardTitle>
              <CardDescription>Select where you want to deploy your platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PROVIDERS.map((p) => (
                  <div
                    key={p.value}
                    className={`p-3 rounded-md border cursor-pointer transition-colors hover-elevate ${
                      provider === p.value 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setProvider(p.value)}
                    data-testid={`provider-${p.value.toLowerCase()}`}
                  >
                    <div className="font-medium">{p.label}</div>
                    {p.recommended && <Badge variant="secondary" className="text-xs mt-1">Recommended</Badge>}
                  </div>
                ))}
              </div>
              <Button onClick={() => setStep(2)} className="w-full" data-testid="next-step-2">
                Next: Enter App URL
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Live App URL
              </CardTitle>
              <CardDescription>Enter the URL where your app will be deployed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="appUrl">App URL</Label>
                <Input
                  id="appUrl"
                  type="url"
                  placeholder="https://myapp.replit.app"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  data-testid="input-app-url"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This is the public URL of your deployed application
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} disabled={!appUrl} className="flex-1" data-testid="next-step-3">
                  Next: Database & Secrets
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database & Secrets
              </CardTitle>
              <CardDescription>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  These values are encrypted and never shown again
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Need secure secrets?</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateSecretsMutation.mutate()}
                    disabled={generateSecretsMutation.isPending}
                    data-testid="generate-secrets"
                  >
                    {generateSecretsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Generate Secrets"
                    )}
                  </Button>
                </div>
                {generatedSecrets && (
                  <div className="space-y-2 mt-3">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">{generatedSecrets.warning}</p>
                    {generatedSecrets.secrets.map((secret) => (
                      <div key={secret.key} className="flex items-center justify-between p-2 bg-background rounded border">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-mono font-medium">{secret.key}</span>
                          <p className="text-xs text-muted-foreground truncate">{secret.value}</p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => copyToClipboard(secret.value)} data-testid={`copy-${secret.key.toLowerCase()}`}>
                          <ClipboardCopy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="databaseUrl">DATABASE_URL</Label>
                <Input
                  id="databaseUrl"
                  type="password"
                  placeholder="postgresql://user:pass@host:5432/db"
                  value={databaseUrl}
                  onChange={(e) => setDatabaseUrl(e.target.value)}
                  data-testid="input-database-url"
                />
              </div>
              <div>
                <Label htmlFor="jwtSecret">JWT_SECRET (SESSION_SECRET)</Label>
                <Input
                  id="jwtSecret"
                  type="password"
                  placeholder="your-32-character-secret-here!!"
                  value={jwtSecret}
                  onChange={(e) => setJwtSecret(e.target.value)}
                  data-testid="input-jwt-secret"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum 16 characters. Use the generated value or enter your own.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(4)} disabled={!databaseUrl || !jwtSecret} className="flex-1" data-testid="next-step-4">
                  Next: Review & Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Review Configuration</CardTitle>
              <CardDescription>Confirm your deployment settings before saving</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="font-medium">{provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">App URL:</span>
                  <span className="font-medium">{appUrl}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Database URL:</span>
                  <span className="font-medium">********</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">JWT Secret:</span>
                  <span className="font-medium">********</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
                <Button 
                  onClick={() => saveMutation.mutate()} 
                  disabled={saveMutation.isPending}
                  className="flex-1"
                  data-testid="save-config"
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Deploy Checklist
              </CardTitle>
              <CardDescription>Follow these steps to deploy your platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-2">1. Environment Variables</h3>
                <div className="space-y-2 p-3 bg-muted rounded-lg font-mono text-sm">
                  {checklist?.envVars.map((env) => (
                    <div key={env.key} className="flex items-center justify-between">
                      <div>
                        <span className={env.required ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                          {env.key}
                        </span>
                        {env.required && <Badge variant="outline" className="ml-2 text-xs">Required</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{env.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">2. Run Database Migration</h3>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                  <code className="flex-1">{checklist?.migration}</code>
                  <Button size="icon" variant="ghost" onClick={() => copyToClipboard(checklist?.migration || "")}>
                    <ClipboardCopy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">3. Start Command</h3>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm">
                  <code className="flex-1">{checklist?.startCommand}</code>
                  <Button size="icon" variant="ghost" onClick={() => copyToClipboard(checklist?.startCommand || "")}>
                    <ClipboardCopy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">4. Verification Endpoints</h3>
                <div className="space-y-1 p-3 bg-muted rounded-lg font-mono text-sm">
                  {checklist?.verificationUrls.map((url) => (
                    <div key={url}>{url}</div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">5. Pre-Flight Check</h3>
                <Button
                  variant="outline"
                  onClick={() => preflightMutation.mutate()}
                  disabled={preflightMutation.isPending}
                  className="w-full mb-3"
                  data-testid="run-preflight"
                >
                  {preflightMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  Run Pre-Flight Check
                </Button>
                {preflightResult && (
                  <div className="space-y-2">
                    <div className={`p-3 rounded-lg flex items-center gap-2 ${
                      preflightResult.canDeploy
                        ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
                        : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                    }`}>
                      {preflightResult.canDeploy ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <AlertCircle className="h-5 w-5" />
                      )}
                      <span className="font-medium">{preflightResult.message}</span>
                    </div>
                    <div className="space-y-1">
                      {preflightResult.checks.map((check) => (
                        <div key={check.key} className="flex items-center justify-between p-2 border rounded text-sm">
                          <span>{check.label}</span>
                          <div className="flex items-center gap-2">
                            {check.passed ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-red-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Button 
                onClick={() => setStep(6)} 
                className="w-full" 
                disabled={preflightResult ? !preflightResult.canDeploy : false}
                data-testid="next-step-6"
              >
                <Play className="h-4 w-4 mr-2" />
                Verify Live URL
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 6 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Verify Deployment
              </CardTitle>
              <CardDescription>
                Run verification checks against your live URL: {config?.appUrl || "Not configured"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!config?.configured && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-amber-700 dark:text-amber-400">
                  Please complete the configuration steps first.
                </div>
              )}

              {config?.configured && (
                <>
                  <Button
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending}
                    className="w-full"
                    data-testid="run-verify"
                  >
                    {verifyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Run Verification
                  </Button>

                  {verifyMutation.data && (
                    <div className="space-y-2">
                      <div className={`p-3 rounded-lg flex items-center gap-2 ${
                        verifyMutation.data.status === "passed" 
                          ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
                          : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                      }`}>
                        {verifyMutation.data.status === "passed" ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <AlertCircle className="h-5 w-5" />
                        )}
                        <span className="font-medium">
                          {verifyMutation.data.status === "passed" ? "All checks passed!" : "Some checks failed"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {Object.entries(verifyMutation.data.results).map(([key, result]) => (
                          <div key={key} className="flex items-center justify-between p-2 border rounded">
                            <span className="text-sm">{key.replace(/_/g, " ")}</span>
                            <div className="flex items-center gap-2">
                              {result.passed ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-600" />
                              )}
                              <span className="text-xs text-muted-foreground">{result.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {verifyMutation.data.status === "passed" && (config?.status === "verified" || config?.status === "pending") && (
                        <Button
                          onClick={() => goLiveMutation.mutate()}
                          disabled={goLiveMutation.isPending}
                          className="w-full"
                          data-testid="go-live"
                        >
                          {goLiveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Rocket className="h-4 w-4 mr-2" />
                          )}
                          Go LIVE
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Deploy Packs Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Deploy Packs
            </CardTitle>
            <CardDescription>
              Generate provider-specific deployment configurations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Provider</Label>
                <Select value={packProvider} onValueChange={setPackProvider}>
                  <SelectTrigger data-testid="select-pack-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="render">Render</SelectItem>
                    <SelectItem value="railway">Railway</SelectItem>
                    <SelectItem value="fly">Fly.io</SelectItem>
                    <SelectItem value="docker">Docker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="packAppName">App Name</Label>
                <Input
                  id="packAppName"
                  placeholder="my-platform"
                  value={packAppName}
                  onChange={(e) => setPackAppName(e.target.value)}
                  data-testid="input-pack-app-name"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => generatePackMutation.mutate()}
                  disabled={generatePackMutation.isPending || !packAppName}
                  className="w-full"
                  data-testid="generate-pack"
                >
                  {generatePackMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Package className="h-4 w-4 mr-2" />
                  )}
                  Generate Pack
                </Button>
              </div>
            </div>

            {packsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : packsData?.packs && packsData.packs.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Generated Packs</h4>
                {packsData.packs.slice(0, 5).map((pack) => (
                  <div key={pack.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      <Badge variant={pack.status === "ready" ? "default" : "secondary"}>
                        {pack.provider.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{pack.appName}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(pack.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {pack.status === "ready" && pack.downloadUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(pack.downloadUrl!, "_blank")}
                        data-testid={`download-pack-${pack.id}`}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}
                    {pack.status === "generating" && (
                      <Badge variant="outline">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Generating...
                      </Badge>
                    )}
                    {pack.expiresAt && new Date(pack.expiresAt) < new Date() && (
                      <Badge variant="destructive">Expired</Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No deploy packs generated yet</p>
            )}
          </CardContent>
        </Card>

        {/* Remote Verification Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Remote Verification
            </CardTitle>
            <CardDescription>
              Verify a deployed application is working correctly (30 checks/hour limit)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="https://your-app.onrender.com"
                value={remoteVerifyUrl}
                onChange={(e) => setRemoteVerifyUrl(e.target.value)}
                className="flex-1"
                data-testid="input-remote-verify-url"
              />
              <Button
                onClick={() => remoteVerifyMutation.mutate()}
                disabled={remoteVerifyMutation.isPending || !remoteVerifyUrl}
                data-testid="run-remote-verify"
              >
                {remoteVerifyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Verify
              </Button>
            </div>

            {remoteVerifyMutation.data && (
              <div className="space-y-2">
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  remoteVerifyMutation.data.status === "pass"
                    ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
                    : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                }`}>
                  {remoteVerifyMutation.data.status === "pass" ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                  <span className="font-medium">
                    {remoteVerifyMutation.data.status === "pass" ? "All checks passed!" : "Some checks failed"}
                  </span>
                </div>

                {remoteVerifyMutation.data.guidance && (
                  <p className="text-sm text-muted-foreground">{remoteVerifyMutation.data.guidance}</p>
                )}

                <div className="space-y-1">
                  {remoteVerifyMutation.data.checks.map((check, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 border rounded text-sm">
                      <span>{check.name.replace(/_/g, " ")}</span>
                      <div className="flex items-center gap-2">
                        {check.passed ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-xs text-muted-foreground max-w-[200px] truncate">{check.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verifyRunsData?.runs && verifyRunsData.runs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Recent Verification Runs</h4>
                {verifyRunsData.runs.slice(0, 5).map((run) => (
                  <div key={run.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div className="flex items-center gap-2">
                      {run.status === "pass" ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="truncate max-w-[200px]">{run.appUrl}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preflight Checks Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Preflight Checks
            </CardTitle>
            <CardDescription>
              Verify your environment is configured correctly before going live
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preflightData ? (
              <div className="space-y-3">
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  preflightData.ready
                    ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
                    : preflightData.hasWarnings
                    ? "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400"
                    : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                }`}>
                  {preflightData.ready ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : preflightData.hasWarnings ? (
                    <AlertCircle className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                  <span className="font-medium">
                    {preflightData.ready 
                      ? "All preflight checks passed" 
                      : preflightData.hasWarnings 
                      ? "Some warnings found" 
                      : "Preflight checks failed"}
                  </span>
                </div>

                <div className="space-y-2">
                  {preflightData.checks.map((check) => (
                    <div key={check.key} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div className="flex items-center gap-2">
                        {check.status === "pass" ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : check.status === "warn" ? (
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span>{check.key.replace(/_/g, " ")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{check.message}</span>
                        {check.fix && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(check.fix!)}
                            className="h-6 px-2"
                            data-testid={`copy-fix-${check.key}`}
                          >
                            <ClipboardCopy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Verification History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : runs && runs.length > 0 ? (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div key={run.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {run.status === "passed" ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : run.status === "failed" ? (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <Badge variant={run.status === "passed" ? "default" : "destructive"}>
                        {run.status}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No verification runs yet</p>
            )}
          </CardContent>
        </Card>

        {showPaywall && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="paywall-overlay">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader className="relative">
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-4 top-4"
                  onClick={() => setShowPaywall(false)}
                  data-testid="close-paywall"
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-3">
                  <Lock className="h-8 w-8 text-primary" />
                  <div>
                    <CardTitle>Go Live Requires a Subscription</CardTitle>
                    <CardDescription>
                      Build and preview for free, subscribe to go live
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Your platform is ready to go live! Choose a plan to unlock deployment and make your app publicly accessible.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plansData?.plans.filter(p => p.key !== "free").map((plan) => (
                    <div
                      key={plan.key}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover-elevate ${
                        selectedPlan === plan.key
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      onClick={() => setSelectedPlan(plan.key)}
                      data-testid={`plan-${plan.key}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-lg">{plan.name}</h3>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold">${plan.priceMonthly}</span>
                            <span className="text-muted-foreground text-sm">/month</span>
                          </div>
                        </div>
                        {plan.key === "pro" && (
                          <Badge variant="secondary">Popular</Badge>
                        )}
                        {plan.key === "business" && (
                          <Badge>Best Value</Badge>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {billingStatus?.status === "active" && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-400">
                        You have an active {billingStatus.plan} subscription!
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-500">
                        {billingStatus.liveAppsUsed} of {billingStatus.liveAppsLimit} live apps used
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowPaywall(false)}
                    className="flex-1"
                    data-testid="cancel-subscribe"
                  >
                    Maybe Later
                  </Button>
                  <Button
                    onClick={() => handleSubscribe(selectedPlan)}
                    disabled={subscribing}
                    className="flex-1"
                    data-testid="subscribe-button"
                  >
                    {subscribing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Subscribe & Go Live
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  You can cancel anytime. Payments are securely processed via Stripe.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
