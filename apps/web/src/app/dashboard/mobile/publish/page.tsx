"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  Clock,
  Key,
  Play,
  XCircle,
  RefreshCw,
  FileText,
  AlertTriangle,
  Trash2,
  Plus,
} from "lucide-react";
import { SiFlutter, SiApple, SiGoogleplay, SiExpo } from "react-icons/si";

type CredentialType = 
  | "apple_api_key" 
  | "apple_cert" 
  | "android_keystore" 
  | "play_service_account" 
  | "expo_token";

interface CredentialStatus {
  configured: boolean;
  name?: string;
  updatedAt?: string;
}

interface CredentialsStatusResponse {
  credentials: Record<CredentialType, CredentialStatus>;
  missing: {
    expo: string[];
    flutter: string[];
    flutterflow: string[];
  };
  readyFor: {
    expo: boolean;
    flutter: boolean;
    flutterflow: boolean;
  };
}

interface PublishArtifact {
  id: string;
  kind: string;
  path?: string;
  url?: string;
  size?: number;
  expiresAt?: string;
}

interface PublishJob {
  id: string;
  target: string;
  platform: string;
  stage?: string;
  provider?: string;
  channel?: string;
  status: string;
  runMode?: string;
  ciStatus?: string;
  ciRunUrl?: string;
  error?: string;
  logs?: string;
  artifacts: PublishArtifact[];
  startedAt?: string;
  completedAt?: string;
  expiresAt: string;
  createdAt: string;
}

interface CapabilityInfo {
  name: string;
  localSupported: boolean;
  ciSupported: boolean;
  requiredCredentials: Record<string, string[]>;
  missingCredentials: Record<string, string[]>;
  readyFor: Record<string, boolean>;
  ciRequiredSecrets: string[];
  note?: string;
}

interface CapabilitiesResponse {
  capabilities: Record<string, CapabilityInfo>;
  configuredCredentials: { type: string; name: string; expires?: string; valid: boolean }[];
  ciEnvironment: {
    configured: boolean;
    provider: string;
    missingEnvVars: string[];
    workflowPath: string;
  };
  recommendations: Record<string, string>;
}

const CREDENTIAL_INFO: Record<CredentialType, { 
  name: string; 
  icon: React.ReactNode; 
  description: string;
  requiredFor: string[];
}> = {
  expo_token: {
    name: "Expo Token",
    icon: <SiExpo className="h-5 w-5" />,
    description: "Expo project access token for EAS Build",
    requiredFor: ["expo"],
  },
  apple_api_key: {
    name: "Apple API Key",
    icon: <SiApple className="h-5 w-5" />,
    description: "App Store Connect API Key for iOS submissions",
    requiredFor: ["expo"],
  },
  apple_cert: {
    name: "Apple Certificate",
    icon: <SiApple className="h-5 w-5" />,
    description: "iOS signing certificate (.p12) for Flutter builds",
    requiredFor: ["flutter", "flutterflow"],
  },
  android_keystore: {
    name: "Android Keystore",
    icon: <SiGoogleplay className="h-5 w-5" />,
    description: "Android signing keystore for release builds",
    requiredFor: ["expo", "flutter", "flutterflow"],
  },
  play_service_account: {
    name: "Play Service Account",
    icon: <SiGoogleplay className="h-5 w-5" />,
    description: "Google Play Console service account JSON",
    requiredFor: ["flutter"],
  },
};

export default function MobilePublishPage() {
  const { token, currentTenant, currentRole } = useAuth();
  const tenantId = currentTenant?.id;
  const role = currentRole;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("credentials");
  const [addingCredential, setAddingCredential] = useState<CredentialType | null>(null);
  const [credentialData, setCredentialData] = useState("");
  const [credentialName, setCredentialName] = useState("");
  const [startingJob, setStartingJob] = useState<{ target: string; platform: string } | null>(null);

  const isAdmin = role === "owner" || role === "admin";
  const [runMode, setRunMode] = useState<"local" | "ci">("local");
  const [selectedStage, setSelectedStage] = useState<"build" | "submit">("build");
  const [selectedChannel, setSelectedChannel] = useState<"preview" | "production">("preview");

  const { data: credentialsStatus, isLoading: loadingCredentials, refetch: refetchCredentials } = useQuery<CredentialsStatusResponse>({
    queryKey: ["/api/mobile/publish/credentials/status"],
    enabled: !!token && !!tenantId && isAdmin,
  });

  const { data: jobsData, isLoading: loadingJobs, refetch: refetchJobs } = useQuery<{ jobs: PublishJob[]; total: number }>({
    queryKey: ["/api/mobile/publish/jobs"],
    enabled: !!token && !!tenantId && isAdmin,
    refetchInterval: 5000,
  });

  const { data: capabilities, isLoading: loadingCapabilities } = useQuery<CapabilitiesResponse>({
    queryKey: ["/api/mobile/publish/capabilities"],
    enabled: !!token && !!tenantId && isAdmin,
  });

  const storeCredentialMutation = useMutation({
    mutationFn: async (data: { type: CredentialType; name: string; data: string }) => {
      const res = await fetch("/api/mobile/publish/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId || "",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to store credential");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Credential Stored", description: "Credential has been securely saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/publish/credentials/status"] });
      setAddingCredential(null);
      setCredentialData("");
      setCredentialName("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: async (type: CredentialType) => {
      const res = await fetch(`/api/mobile/publish/credentials/${type}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId || "",
        },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to delete credential");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Credential Deleted", description: "Credential has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/publish/credentials/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startJobMutation = useMutation({
    mutationFn: async (data: { target: string; platform: string; stage: string; channel: string }) => {
      const res = await fetch("/api/mobile/publish/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId || "",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to start job");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Job Started", description: "Publish job has been queued." });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/publish/jobs"] });
      setStartingJob(null);
      setActiveTab("jobs");
      
      // If CI mode, trigger CI
      if (runMode === "ci" && data.id) {
        triggerCiMutation.mutate(data.id);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setStartingJob(null);
    },
  });

  const triggerCiMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`/api/mobile/publish/jobs/${jobId}/trigger-ci`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId || "",
        },
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to trigger CI");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "CI Triggered", 
        description: data.ciRunUrl ? `Workflow started: ${data.ciRunUrl}` : "CI build triggered" 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/publish/jobs"] });
    },
    onError: (error: Error) => {
      toast({ title: "CI Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`/api/mobile/publish/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId || "",
        },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to cancel job");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job Canceled", description: "Publish job has been canceled." });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/publish/jobs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              Mobile Publish is only available to workspace owners and admins.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const handleStoreCredential = () => {
    if (!addingCredential || !credentialData || !credentialName) return;
    storeCredentialMutation.mutate({
      type: addingCredential,
      name: credentialName,
      data: credentialData,
    });
  };

  const handleStartJob = (target: string, platform: string) => {
    setStartingJob({ target, platform });
    startJobMutation.mutate({ 
      target, 
      platform, 
      stage: selectedStage, 
      channel: selectedChannel 
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "queued":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Queued</Badge>;
      case "running":
        return <Badge className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running</Badge>;
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Completed</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
      case "canceled":
        return <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" /> Canceled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Smartphone className="h-6 w-6" />
              Mobile Publish
            </h1>
            <p className="text-muted-foreground">
              Manage store credentials and publish your mobile apps
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchCredentials();
              refetchJobs();
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3" data-testid="tabs-publish">
            <TabsTrigger value="credentials" data-testid="tab-credentials">
              <Key className="h-4 w-4 mr-2" />
              Credentials
            </TabsTrigger>
            <TabsTrigger value="jobs" data-testid="tab-jobs">
              <Play className="h-4 w-4 mr-2" />
              Jobs
            </TabsTrigger>
            <TabsTrigger value="artifacts" data-testid="tab-artifacts">
              <FileText className="h-4 w-4 mr-2" />
              Artifacts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="credentials" className="space-y-4 mt-4">
            {loadingCredentials ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className={credentialsStatus?.readyFor.expo ? "border-green-500" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <SiExpo className="h-5 w-5" />
                        Expo (EAS)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {credentialsStatus?.readyFor.expo ? (
                        <Badge className="bg-green-500" data-testid="badge-expo-ready">Ready</Badge>
                      ) : (
                        <div className="space-y-1">
                          <Badge variant="outline" className="text-yellow-600" data-testid="badge-expo-missing">
                            Missing {credentialsStatus?.missing.expo.length} credentials
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {credentialsStatus?.missing.expo.join(", ")}
                          </p>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button 
                        size="sm" 
                        disabled={!credentialsStatus?.readyFor.expo}
                        onClick={() => handleStartJob("expo", "both")}
                        data-testid="button-start-expo"
                      >
                        {startingJob?.target === "expo" ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Start Build
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className={credentialsStatus?.readyFor.flutter ? "border-green-500" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <SiFlutter className="h-5 w-5" />
                        Flutter
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {credentialsStatus?.readyFor.flutter ? (
                        <Badge className="bg-green-500" data-testid="badge-flutter-ready">Ready</Badge>
                      ) : (
                        <div className="space-y-1">
                          <Badge variant="outline" className="text-yellow-600" data-testid="badge-flutter-missing">
                            Missing {credentialsStatus?.missing.flutter.length} credentials
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {credentialsStatus?.missing.flutter.join(", ")}
                          </p>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button 
                        size="sm" 
                        disabled={!credentialsStatus?.readyFor.flutter}
                        onClick={() => handleStartJob("flutter", "both")}
                        data-testid="button-start-flutter"
                      >
                        {startingJob?.target === "flutter" ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Start Build
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className={credentialsStatus?.readyFor.flutterflow ? "border-green-500" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <SiFlutter className="h-5 w-5 text-blue-400" />
                        FlutterFlow
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {credentialsStatus?.readyFor.flutterflow ? (
                        <Badge className="bg-green-500" data-testid="badge-flutterflow-ready">Ready</Badge>
                      ) : (
                        <div className="space-y-1">
                          <Badge variant="outline" className="text-yellow-600" data-testid="badge-flutterflow-missing">
                            Missing {credentialsStatus?.missing.flutterflow.length} credentials
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {credentialsStatus?.missing.flutterflow.join(", ")}
                          </p>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button 
                        size="sm" 
                        disabled={!credentialsStatus?.readyFor.flutterflow}
                        onClick={() => handleStartJob("flutterflow", "both")}
                        data-testid="button-start-flutterflow"
                      >
                        {startingJob?.target === "flutterflow" ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Start Build
                      </Button>
                    </CardFooter>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Store Credentials
                    </CardTitle>
                    <CardDescription>
                      Securely store your app store credentials (encrypted at rest)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(Object.entries(CREDENTIAL_INFO) as [CredentialType, typeof CREDENTIAL_INFO[CredentialType]][]).map(
                      ([type, info]) => {
                        const status = credentialsStatus?.credentials[type];
                        return (
                          <div
                            key={type}
                            className="flex items-center justify-between p-3 border rounded-lg"
                            data-testid={`credential-row-${type}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-muted">
                                {info.icon}
                              </div>
                              <div>
                                <div className="font-medium">{info.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {info.description}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Required for: {info.requiredFor.join(", ")}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {status?.configured ? (
                                <>
                                  <Badge className="bg-green-500">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Configured
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteCredentialMutation.mutate(type)}
                                    disabled={deleteCredentialMutation.isPending}
                                    data-testid={`button-delete-${type}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setAddingCredential(type);
                                    setCredentialName(info.name);
                                  }}
                                  data-testid={`button-add-${type}`}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </CardContent>
                </Card>

                {addingCredential && (
                  <Card className="border-primary">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5" />
                        Add {CREDENTIAL_INFO[addingCredential].name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Alert>
                        <Shield className="h-4 w-4" />
                        <AlertTitle>Secure Storage</AlertTitle>
                        <AlertDescription>
                          Credentials are encrypted using AES-256-GCM before storage.
                          They are never logged or exposed in responses.
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-2">
                        <Label htmlFor="credentialName">Display Name</Label>
                        <Input
                          id="credentialName"
                          value={credentialName}
                          onChange={(e) => setCredentialName(e.target.value)}
                          placeholder="My Production Key"
                          data-testid="input-credential-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="credentialData">
                          Credential Data (API Key, Certificate, or JSON)
                        </Label>
                        <Textarea
                          id="credentialData"
                          className="h-32 font-mono text-sm resize-none"
                          value={credentialData}
                          onChange={(e) => setCredentialData(e.target.value)}
                          placeholder="Paste your credential here..."
                          data-testid="input-credential-data"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAddingCredential(null);
                          setCredentialData("");
                          setCredentialName("");
                        }}
                        data-testid="button-cancel-credential"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleStoreCredential}
                        disabled={!credentialData || !credentialName || storeCredentialMutation.isPending}
                        data-testid="button-save-credential"
                      >
                        {storeCredentialMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Save Credential
                      </Button>
                    </CardFooter>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4 mt-4">
            {loadingJobs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : jobsData?.jobs.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Publish Jobs</h3>
                  <p className="text-muted-foreground">
                    Start a build from the Credentials tab to create a publish job.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {jobsData?.jobs.map((job) => (
                  <Card key={job.id} data-testid={`job-card-${job.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {job.target === "expo" && <SiExpo className="h-5 w-5" />}
                          {job.target === "flutter" && <SiFlutter className="h-5 w-5" />}
                          {job.target === "flutterflow" && <SiFlutter className="h-5 w-5 text-blue-400" />}
                          {job.target.charAt(0).toUpperCase() + job.target.slice(1)} - {job.platform}
                        </CardTitle>
                        <div className="flex items-center gap-2 flex-wrap">
                          {job.stage && (
                            <Badge variant="outline" className="capitalize" data-testid={`badge-stage-${job.id}`}>
                              {job.stage}
                            </Badge>
                          )}
                          {job.channel && (
                            <Badge variant="secondary" className="capitalize" data-testid={`badge-channel-${job.id}`}>
                              {job.channel}
                            </Badge>
                          )}
                          <span data-testid={`badge-status-${job.id}`}>{getStatusBadge(job.status)}</span>
                        </div>
                      </div>
                      <CardDescription className="flex flex-wrap gap-2">
                        <span>Created: {new Date(job.createdAt).toLocaleString()}</span>
                        {job.completedAt && <span>• Completed: {new Date(job.completedAt).toLocaleString()}</span>}
                        {job.provider && <span>• Provider: {job.provider}</span>}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {job.error && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{job.error}</AlertDescription>
                        </Alert>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        Expires: {new Date(job.expiresAt).toLocaleString()}
                      </div>
                      {job.artifacts.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-sm font-medium">Artifacts:</span>
                          <div className="grid gap-2">
                            {job.artifacts.map((a) => (
                              <div 
                                key={a.id} 
                                className="flex items-center justify-between p-2 border rounded-md text-sm"
                                data-testid={`artifact-row-${a.id}`}
                              >
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  <span className="font-medium" data-testid={`text-artifact-kind-${a.id}`}>{a.kind}</span>
                                  {a.size && (
                                    <span className="text-muted-foreground" data-testid={`text-artifact-size-${a.id}`}>
                                      ({(a.size / 1024 / 1024).toFixed(2)} MB)
                                    </span>
                                  )}
                                  {a.expiresAt && (
                                    <span className="text-xs text-muted-foreground" data-testid={`text-artifact-expiry-${a.id}`}>
                                      Expires: {new Date(a.expiresAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                {a.url && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(a.url, "_blank")}
                                    data-testid={`button-artifact-open-${a.id}`}
                                  >
                                    Open
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                    {(job.status === "queued" || job.status === "running") && (
                      <CardFooter>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => cancelJobMutation.mutate(job.id)}
                          disabled={cancelJobMutation.isPending}
                          data-testid={`button-cancel-job-${job.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Job
                        </Button>
                      </CardFooter>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="artifacts" className="space-y-4 mt-4">
            {loadingJobs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {jobsData?.jobs.filter((j) => j.artifacts.length > 0).length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium">No Artifacts</h3>
                      <p className="text-muted-foreground">
                        Complete a publish job to generate downloadable artifacts.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {jobsData?.jobs
                      .filter((j) => j.artifacts.length > 0)
                      .map((job) => (
                        <Card key={job.id}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">
                              {job.target} - {job.platform}
                            </CardTitle>
                            <CardDescription>
                              {new Date(job.createdAt).toLocaleString()}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="grid gap-2 md:grid-cols-2">
                              {job.artifacts.map((artifact) => (
                                <div
                                  key={artifact.id}
                                  className="flex items-center justify-between p-3 border rounded-lg"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    <span className="font-medium">{artifact.kind}</span>
                                    {artifact.size && (
                                      <span className="text-sm text-muted-foreground">
                                        ({(artifact.size / 1024 / 1024).toFixed(2)} MB)
                                      </span>
                                    )}
                                  </div>
                                  <Button size="sm" variant="outline">
                                    Download
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
