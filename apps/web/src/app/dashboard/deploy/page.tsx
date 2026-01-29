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
} from "lucide-react";

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
                  <Button
                    key={p.value}
                    variant={provider === p.value ? "default" : "outline"}
                    className="justify-start h-auto py-3"
                    onClick={() => setProvider(p.value)}
                    data-testid={`provider-${p.value.toLowerCase()}`}
                  >
                    <div className="text-left">
                      <div className="font-medium">{p.label}</div>
                      {p.recommended && <Badge variant="secondary" className="text-xs mt-1">Recommended</Badge>}
                    </div>
                  </Button>
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
                  Minimum 16 characters. Used to sign JWT tokens.
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

              <Button onClick={() => setStep(6)} className="w-full" data-testid="next-step-6">
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
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

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
      </div>
    </DashboardLayout>
  );
}
