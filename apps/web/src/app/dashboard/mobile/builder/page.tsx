"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  Shield,
  Clock,
  Code,
  Layout,
  Settings,
  Lock,
  CreditCard,
  AlertTriangle,
} from "lucide-react";

interface MobileSpec {
  id: string;
  status: string;
  target: string;
  appName: string;
  bundleId: string;
  features: string[];
  screens: Array<{ name: string; path: string; description: string }>;
  envRequirements: Array<{ key: string; description: string; required: boolean }>;
  warnings: string[];
  createdAt: string;
  approvedAt?: string;
}

interface BuildJob {
  jobId: string;
  status: string;
  downloadUrl: string;
  expiresAt: string;
}

let messageIdCounter = 0;
function generateMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

export default function MobileBuilderPage() {
  const { token, currentTenant } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inputValue, setInputValue] = useState("");
  const [currentSpec, setCurrentSpec] = useState<MobileSpec | null>(null);
  const [buildJob, setBuildJob] = useState<BuildJob | null>(null);
  const [error, setError] = useState<{ code: number; message: string } | null>(null);

  const headers = {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": currentTenant?.id || "",
    "Content-Type": "application/json",
  };

  const handleApiError = (status: number, errorData: any) => {
    setError({ code: status, message: errorData?.error || "An error occurred" });
    
    let errorMessage = "";
    if (status === 401) {
      errorMessage = "Your session has expired. Please log in again to continue.";
    } else if (status === 403) {
      errorMessage = "You don't have permission to use the Mobile Builder. Please contact your administrator.";
    } else if (status === 402) {
      errorMessage = "Upgrade to a paid plan to generate mobile apps.";
    } else if (status === 429) {
      errorMessage = "You've made too many requests. Please wait a moment and try again.";
    } else {
      errorMessage = errorData?.error || "Something went wrong. Please try again.";
    }

    toast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });

    return { errorMessage, status };
  };

  const draftMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await fetch("/api/mobile/spec/draft", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, target: "expo" }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        handleApiError(res.status, errorData);
        throw new Error(errorData.error || "Failed to create spec");
      }

      return res.json();
    },
    onSuccess: (data: MobileSpec) => {
      setCurrentSpec(data);
      setError(null);
      toast({
        title: "Spec Created",
        description: `App "${data.appName}" specification ready for review`,
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (specId: string) => {
      const res = await fetch("/api/mobile/spec/approve", {
        method: "POST",
        headers,
        body: JSON.stringify({ specId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        handleApiError(res.status, errorData);
        throw new Error(errorData.error || "Failed to approve spec");
      }

      return res.json();
    },
    onSuccess: (data) => {
      if (currentSpec) {
        setCurrentSpec({ ...currentSpec, status: "approved", approvedAt: data.approvedAt });
      }
      setError(null);
      toast({
        title: "Spec Approved",
        description: "You can now generate the Expo project",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (approvedSpecId: string) => {
      const res = await fetch("/api/mobile/project/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ approvedSpecId, target: "expo" }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        handleApiError(res.status, errorData);
        throw new Error(errorData.error || "Failed to generate project");
      }

      return res.json();
    },
    onSuccess: (data: BuildJob) => {
      setBuildJob(data);
      if (currentSpec) {
        setCurrentSpec({ ...currentSpec, status: "generated" });
      }
      setError(null);
      toast({
        title: "Project Generated",
        description: "Your Expo app is ready for download",
      });
    },
  });

  const handleSubmit = () => {
    if (!inputValue.trim()) return;
    setError(null);
    setBuildJob(null);
    setCurrentSpec(null);
    draftMutation.mutate(inputValue.trim());
  };

  const handleApprove = () => {
    if (!currentSpec) return;
    approveMutation.mutate(currentSpec.id);
  };

  const handleGenerate = () => {
    if (!currentSpec) return;
    generateMutation.mutate(currentSpec.id);
  };

  const handleDownload = () => {
    if (!buildJob?.downloadUrl) return;
    window.open(buildJob.downloadUrl, "_blank");
  };

  const isLoading = draftMutation.isPending || approveMutation.isPending || generateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Smartphone className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Mobile App Builder</h1>
            <p className="text-muted-foreground">Generate a complete Expo mobile app from a description</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" data-testid="alert-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error {error.code}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Describe Your App
            </CardTitle>
            <CardDescription>
              Tell us what kind of mobile app you want to build. Include features like authentication, payments, bookings, etc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Build a booking app with login, preview, settings, and Bengali language support..."
                className="min-h-[80px] resize-none flex-1"
                disabled={isLoading}
                data-testid="input-prompt"
              />
              <Button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isLoading}
                size="lg"
                className="px-4 self-end"
                data-testid="button-generate-spec"
              >
                {draftMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {currentSpec && (
          <Card data-testid="card-spec-summary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Layout className="h-5 w-5" />
                  {currentSpec.appName}
                </CardTitle>
                <Badge variant={currentSpec.status === "approved" || currentSpec.status === "generated" ? "default" : "secondary"}>
                  {currentSpec.status}
                </Badge>
              </div>
              <CardDescription>Bundle ID: {currentSpec.bundleId}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Features ({currentSpec.features.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {currentSpec.features.map((feature, i) => (
                    <Badge key={i} variant="outline" data-testid={`badge-feature-${i}`}>
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Screens ({currentSpec.screens.length})
                </h4>
                <div className="grid gap-2 md:grid-cols-2">
                  {currentSpec.screens.map((screen, i) => (
                    <div key={i} className="p-2 bg-muted rounded-md" data-testid={`card-screen-${i}`}>
                      <div className="font-medium text-sm">{screen.name}</div>
                      <div className="text-xs text-muted-foreground">{screen.path}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Environment Variables
                </h4>
                <div className="space-y-1">
                  {currentSpec.envRequirements.map((env, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm" data-testid={`text-env-${i}`}>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{env.key}</code>
                      {env.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                    </div>
                  ))}
                </div>
              </div>

              {currentSpec.warnings.length > 0 && (
                <Alert variant="default" data-testid="alert-warnings">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      {currentSpec.warnings.map((warning, i) => (
                        <li key={i} className="text-sm">{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex gap-3 flex-wrap">
              {currentSpec.status === "draft" && (
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  data-testid="button-approve"
                >
                  {approveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Approve Spec
                    </>
                  )}
                </Button>
              )}

              {(currentSpec.status === "approved" || currentSpec.status === "generating") && !buildJob && (
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  data-testid="button-generate-project"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Code className="h-4 w-4 mr-2" />
                      Generate Expo App
                    </>
                  )}
                </Button>
              )}
            </CardFooter>
          </Card>
        )}

        {buildJob && (
          <Card data-testid="card-download">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                Expo App Ready
              </CardTitle>
              <CardDescription>
                Your mobile app project has been generated and is ready for download.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Download expires: {new Date(buildJob.expiresAt).toLocaleString()}
              </div>

              <Alert>
                <Code className="h-4 w-4" />
                <AlertTitle>Next Steps</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Download and extract the ZIP file</li>
                    <li>Run <code className="bg-muted px-1 rounded">npm install</code> in the project directory</li>
                    <li>Create a <code className="bg-muted px-1 rounded">.env</code> file with required variables</li>
                    <li>Run <code className="bg-muted px-1 rounded">npx expo start</code> to start development</li>
                    <li>Run <code className="bg-muted px-1 rounded">npx eas build</code> for production builds</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter>
              <Button onClick={handleDownload} size="lg" data-testid="button-download">
                <Download className="h-4 w-4 mr-2" />
                Download Expo App
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
