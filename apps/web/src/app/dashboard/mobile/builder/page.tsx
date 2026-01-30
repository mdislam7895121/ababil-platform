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
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone,
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
  AlertTriangle,
  Calendar,
  ShoppingCart,
  Truck,
  MessageCircle,
  FileText,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Users,
  CreditCard,
  Globe,
  Bell,
  Map,
  Star,
  Package,
  Headphones,
} from "lucide-react";
import { SiFlutter } from "react-icons/si";

type MobileTarget = "expo" | "flutter" | "flutterflow";

type TemplateType = "booking" | "ecommerce" | "delivery" | "support" | "blank";

interface TemplateConfig {
  id: TemplateType;
  name: string;
  description: string;
  icon: React.ReactNode;
  defaultFeatures: string[];
  suggestedScreens: string[];
}

interface FeatureOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
}

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

const TEMPLATES: TemplateConfig[] = [
  {
    id: "booking",
    name: "Booking & Appointments",
    description: "Schedule appointments, manage bookings, and handle reservations",
    icon: <Calendar className="h-8 w-8" />,
    defaultFeatures: ["Authentication", "User Profile", "Calendar", "Notifications"],
    suggestedScreens: ["Home", "Book Appointment", "My Bookings", "Calendar View", "Settings"],
  },
  {
    id: "ecommerce",
    name: "E-commerce & Shopping",
    description: "Product catalog, shopping cart, checkout, and order tracking",
    icon: <ShoppingCart className="h-8 w-8" />,
    defaultFeatures: ["Authentication", "User Profile", "Payments", "Notifications"],
    suggestedScreens: ["Home", "Products", "Product Detail", "Cart", "Checkout", "Orders"],
  },
  {
    id: "delivery",
    name: "Delivery & Logistics",
    description: "Track deliveries, manage orders, and real-time location updates",
    icon: <Truck className="h-8 w-8" />,
    defaultFeatures: ["Authentication", "User Profile", "Location Tracking", "Notifications"],
    suggestedScreens: ["Home", "Track Order", "Order History", "Live Map", "Settings"],
  },
  {
    id: "support",
    name: "Support & Chat",
    description: "Customer support, chat messaging, and help desk functionality",
    icon: <MessageCircle className="h-8 w-8" />,
    defaultFeatures: ["Authentication", "User Profile", "Chat", "Notifications"],
    suggestedScreens: ["Home", "Conversations", "Chat Room", "Help Center", "Settings"],
  },
  {
    id: "blank",
    name: "Blank Template",
    description: "Start from scratch with minimal setup and full customization",
    icon: <FileText className="h-8 w-8" />,
    defaultFeatures: ["Authentication", "User Profile"],
    suggestedScreens: ["Home", "Settings"],
  },
];

const FEATURE_OPTIONS: FeatureOption[] = [
  { id: "auth", name: "Authentication", description: "User login and registration", icon: <Lock className="h-4 w-4" />, category: "Core" },
  { id: "profile", name: "User Profile", description: "Profile management and settings", icon: <Users className="h-4 w-4" />, category: "Core" },
  { id: "payments", name: "Payments", description: "Stripe/payment integration", icon: <CreditCard className="h-4 w-4" />, category: "Commerce" },
  { id: "notifications", name: "Push Notifications", description: "Mobile push notifications", icon: <Bell className="h-4 w-4" />, category: "Engagement" },
  { id: "i18n", name: "Multi-Language", description: "Internationalization support", icon: <Globe className="h-4 w-4" />, category: "Accessibility" },
  { id: "location", name: "Location Tracking", description: "GPS and maps integration", icon: <Map className="h-4 w-4" />, category: "Features" },
  { id: "calendar", name: "Calendar", description: "Date picking and scheduling", icon: <Calendar className="h-4 w-4" />, category: "Features" },
  { id: "chat", name: "Chat/Messaging", description: "Real-time chat functionality", icon: <MessageCircle className="h-4 w-4" />, category: "Communication" },
  { id: "reviews", name: "Reviews & Ratings", description: "Star ratings and reviews", icon: <Star className="h-4 w-4" />, category: "Engagement" },
  { id: "orders", name: "Order Management", description: "Order tracking and history", icon: <Package className="h-4 w-4" />, category: "Commerce" },
  { id: "support", name: "Help Center", description: "FAQ and support tickets", icon: <Headphones className="h-4 w-4" />, category: "Support" },
];

const TARGET_INFO = {
  expo: {
    name: "Expo (React Native)",
    description: "Cross-platform with JavaScript/TypeScript. Fastest setup for React developers.",
    icon: <Smartphone className="h-6 w-6" />,
    fileCount: "~15 files",
    buildTime: "Instant",
  },
  flutter: {
    name: "Flutter (Dart)",
    description: "Native performance with Dart. Google's UI toolkit for beautiful apps.",
    icon: <SiFlutter className="h-6 w-6" />,
    fileCount: "~12 files",
    buildTime: "Instant",
  },
  flutterflow: {
    name: "FlutterFlow Export",
    description: "Visual builder import format. No-code friendly project export.",
    icon: <Sparkles className="h-6 w-6" />,
    fileCount: "~3 files",
    buildTime: "Instant",
  },
};

type WizardStep = "target" | "template" | "features" | "preview" | "generate";

export default function MobileBuilderPage() {
  const { token, currentTenant, currentRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>("target");
  const [selectedTarget, setSelectedTarget] = useState<MobileTarget | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [appName, setAppName] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [currentSpec, setCurrentSpec] = useState<MobileSpec | null>(null);
  const [buildJob, setBuildJob] = useState<BuildJob | null>(null);
  const [error, setError] = useState<{ code: number; message: string } | null>(null);

  const headers = {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": currentTenant?.id || "",
    "Content-Type": "application/json",
  };

  const isAdmin = currentRole === "owner" || currentRole === "admin";

  const handleApiError = (status: number, errorData: any) => {
    setError({ code: status, message: errorData?.error || "An error occurred" });

    let errorMessage = "";
    if (status === 401) {
      errorMessage = "Your session has expired. Please log in again to continue.";
    } else if (status === 403) {
      errorMessage = "You don't have permission to use the Mobile Builder. Admin access required.";
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

  const buildPromptFromConfig = () => {
    const template = TEMPLATES.find(t => t.id === selectedTemplate);
    const featureNames = Array.from(selectedFeatures)
      .map(id => FEATURE_OPTIONS.find(f => f.id === id)?.name)
      .filter(Boolean);

    let prompt = `Build a ${template?.name || "mobile"} app`;
    if (appName) {
      prompt += ` called "${appName}"`;
    }
    if (featureNames.length > 0) {
      prompt += ` with ${featureNames.join(", ")}`;
    }
    if (template && template.id !== "blank") {
      prompt += `. Include screens for: ${template.suggestedScreens.join(", ")}`;
    }

    return prompt;
  };

  const draftMutation = useMutation({
    mutationFn: async () => {
      const prompt = buildPromptFromConfig();
      const res = await fetch("/api/mobile/spec/draft", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          target: selectedTarget,
          appName: appName || undefined,
        }),
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
      setStep("preview");
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
        description: "You can now generate the project",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (approvedSpecId: string) => {
      const res = await fetch("/api/mobile/project/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ approvedSpecId, target: selectedTarget }),
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
      setStep("generate");
      setError(null);
      toast({
        title: "Project Generated",
        description: "Your mobile app is ready for download",
      });
    },
  });

  const handleSelectTemplate = (templateId: TemplateType) => {
    setSelectedTemplate(templateId);
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      const defaultFeatureIds = new Set<string>();
      template.defaultFeatures.forEach(name => {
        const feature = FEATURE_OPTIONS.find(f => f.name === name);
        if (feature) defaultFeatureIds.add(feature.id);
      });
      setSelectedFeatures(defaultFeatureIds);
    }
    setStep("features");
  };

  const handleToggleFeature = (featureId: string) => {
    const newFeatures = new Set(selectedFeatures);
    if (newFeatures.has(featureId)) {
      newFeatures.delete(featureId);
    } else {
      newFeatures.add(featureId);
    }
    setSelectedFeatures(newFeatures);
  };

  const handleGenerateSpec = () => {
    setError(null);
    setBuildJob(null);
    setCurrentSpec(null);
    draftMutation.mutate();
  };

  const handleApprove = () => {
    if (!currentSpec) return;
    approveMutation.mutate(currentSpec.id);
  };

  const handleGenerate = () => {
    if (!currentSpec) return;
    generateMutation.mutate(currentSpec.id);
  };

  const handleDownload = async () => {
    if (!buildJob?.downloadUrl || !token || !currentTenant?.id) return;
    try {
      const url = `${buildJob.downloadUrl}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": currentTenant.id }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        toast({
          title: "Download Failed",
          description: errorData?.error || "Could not download the project. Please try again.",
          variant: "destructive",
        });
        return;
      }
      
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${currentSpec?.appName || "mobile-app"}.zip`;
      link.click();
      URL.revokeObjectURL(blobUrl);
      
      toast({
        title: "Download Started",
        description: "Your project is being downloaded.",
      });
    } catch (err) {
      toast({
        title: "Download Failed",
        description: "Network error. Please check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setStep("target");
    setSelectedTarget(null);
    setSelectedTemplate(null);
    setAppName("");
    setSelectedFeatures(new Set());
    setCurrentSpec(null);
    setBuildJob(null);
    setError(null);
  };

  const isLoading = draftMutation.isPending || approveMutation.isPending || generateMutation.isPending;
  const isAuthenticated = token && currentTenant?.id;

  const stepProgress = {
    target: 20,
    template: 40,
    features: 60,
    preview: 80,
    generate: 100,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Mobile App Builder</h1>
              <p className="text-muted-foreground">Build mobile apps for Expo, Flutter, or FlutterFlow</p>
            </div>
          </div>
          {step !== "target" && (
            <Button variant="outline" onClick={handleReset} data-testid="button-start-over">
              Start Over
            </Button>
          )}
        </div>

        <Progress value={stepProgress[step]} className="h-2" data-testid="progress-wizard" />

        {!isAuthenticated && (
          <Alert variant="destructive" data-testid="alert-auth-required">
            <Lock className="h-4 w-4" />
            <AlertTitle>Authentication Required</AlertTitle>
            <AlertDescription>
              Please sign in and select a workspace to use the Mobile App Builder.
            </AlertDescription>
          </Alert>
        )}

        {isAuthenticated && !isAdmin && (
          <Alert variant="destructive" data-testid="alert-admin-required">
            <Shield className="h-4 w-4" />
            <AlertTitle>Admin Access Required</AlertTitle>
            <AlertDescription>
              Only workspace owners and admins can use the Mobile App Builder.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" data-testid="alert-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error {error.code}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {step === "target" && (
          <Card data-testid="card-target-selector">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Step 1: Choose Your Platform
              </CardTitle>
              <CardDescription>
                Select the mobile development platform for your app
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {(Object.entries(TARGET_INFO) as [MobileTarget, typeof TARGET_INFO.expo][]).map(([targetId, info]) => (
                  <Card
                    key={targetId}
                    className={`cursor-pointer transition-all hover-elevate ${
                      selectedTarget === targetId ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => {
                      setSelectedTarget(targetId);
                      if (isAuthenticated && isAdmin) {
                        setStep("template");
                      }
                    }}
                    data-testid={`card-target-${targetId}`}
                  >
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="p-3 rounded-full bg-primary/10 text-primary">
                          {info.icon}
                        </div>
                        <div>
                          <h3 className="font-semibold">{info.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">{info.fileCount}</Badge>
                          <Badge variant="secondary">{info.buildTime}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {step === "template" && (
          <Card data-testid="card-template-selector">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layout className="h-5 w-5" />
                    Step 2: Choose a Template
                  </CardTitle>
                  <CardDescription>
                    Select a starting template for your {TARGET_INFO[selectedTarget!]?.name} app
                  </CardDescription>
                </div>
                <Button variant="ghost" onClick={() => setStep("target")} data-testid="button-back-target">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {TEMPLATES.map((template) => (
                  <Card
                    key={template.id}
                    className={`cursor-pointer transition-all hover-elevate ${
                      selectedTemplate === template.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => handleSelectTemplate(template.id)}
                    data-testid={`card-template-${template.id}`}
                  >
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="p-3 rounded-full bg-primary/10 text-primary">
                          {template.icon}
                        </div>
                        <div>
                          <h3 className="font-semibold">{template.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-center mt-2">
                          {template.defaultFeatures.slice(0, 3).map((f, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{f}</Badge>
                          ))}
                          {template.defaultFeatures.length > 3 && (
                            <Badge variant="secondary" className="text-xs">+{template.defaultFeatures.length - 3}</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {step === "features" && (
          <Card data-testid="card-feature-builder">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Step 3: Configure Features
                  </CardTitle>
                  <CardDescription>
                    Customize your app name and select features
                  </CardDescription>
                </div>
                <Button variant="ghost" onClick={() => setStep("template")} data-testid="button-back-template">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="appName">App Name (optional)</Label>
                <Input
                  id="appName"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="MyAwesomeApp"
                  data-testid="input-app-name"
                />
                <p className="text-xs text-muted-foreground">Leave blank for auto-generated name</p>
              </div>

              <div className="space-y-4">
                <Label>Features</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  {FEATURE_OPTIONS.map((feature) => (
                    <div
                      key={feature.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        selectedFeatures.has(feature.id)
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      data-testid={`feature-${feature.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-md bg-muted">
                          {feature.icon}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{feature.name}</div>
                          <div className="text-xs text-muted-foreground">{feature.description}</div>
                        </div>
                      </div>
                      <Switch
                        checked={selectedFeatures.has(feature.id)}
                        onCheckedChange={() => handleToggleFeature(feature.id)}
                        data-testid={`switch-feature-${feature.id}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedFeatures.size} features selected
              </div>
              <Button
                onClick={handleGenerateSpec}
                disabled={isLoading || !isAuthenticated || !isAdmin}
                data-testid="button-create-spec"
              >
                {draftMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Spec...
                  </>
                ) : (
                  <>
                    Create Spec
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === "preview" && currentSpec && (
          <Card data-testid="card-spec-preview">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <Layout className="h-5 w-5" />
                    {currentSpec.appName}
                  </CardTitle>
                  <Badge variant={currentSpec.status === "approved" ? "default" : "secondary"}>
                    {currentSpec.status}
                  </Badge>
                </div>
                <Button variant="ghost" onClick={() => setStep("features")} data-testid="button-back-features">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              </div>
              <CardDescription>
                Target: {TARGET_INFO[currentSpec.target as MobileTarget]?.name} | Bundle ID: {currentSpec.bundleId}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
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
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Screens ({currentSpec.screens.length})
                </h4>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {currentSpec.screens.map((screen, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg" data-testid={`card-screen-${i}`}>
                      <div className="font-medium text-sm">{screen.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{screen.path}</div>
                      <div className="text-xs text-muted-foreground mt-1">{screen.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Environment Variables
                </h4>
                <div className="space-y-2">
                  {currentSpec.envRequirements.map((env, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm" data-testid={`text-env-${i}`}>
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{env.key}</code>
                      {env.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                      <span className="text-muted-foreground text-xs">{env.description}</span>
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
            <CardFooter className="flex justify-between flex-wrap gap-3">
              <div className="text-sm text-muted-foreground">
                Created: {new Date(currentSpec.createdAt).toLocaleString()}
              </div>
              <div className="flex gap-3">
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

                {currentSpec.status === "approved" && (
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
                        Generate {TARGET_INFO[selectedTarget!]?.name.split(" ")[0]} App
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        )}

        {step === "generate" && buildJob && (
          <Card data-testid="card-download">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                {TARGET_INFO[selectedTarget!]?.name} App Ready
              </CardTitle>
              <CardDescription>
                Your mobile app project has been generated and is ready for download.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold text-primary">{TARGET_INFO[selectedTarget!]?.fileCount}</div>
                  <div className="text-sm text-muted-foreground">Files Generated</div>
                </div>
                <div className="p-4 bg-muted rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">Complete</div>
                  <div className="text-sm text-muted-foreground">Status</div>
                </div>
                <div className="p-4 bg-muted rounded-lg text-center">
                  <div className="text-lg font-semibold">{selectedTarget?.toUpperCase()}</div>
                  <div className="text-sm text-muted-foreground">Target Platform</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Download expires: {new Date(buildJob.expiresAt).toLocaleString()}
              </div>

              <Alert>
                <Code className="h-4 w-4" />
                <AlertTitle>Next Steps</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  {selectedTarget === "expo" && (
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Download and extract the ZIP file</li>
                      <li>Run <code className="bg-muted px-1 rounded">npm install</code> in the project directory</li>
                      <li>Create a <code className="bg-muted px-1 rounded">.env</code> file with required variables</li>
                      <li>Run <code className="bg-muted px-1 rounded">npx expo start</code> to start development</li>
                      <li>Run <code className="bg-muted px-1 rounded">npx eas build</code> for production builds</li>
                    </ol>
                  )}
                  {selectedTarget === "flutter" && (
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Download and extract the ZIP file</li>
                      <li>Run <code className="bg-muted px-1 rounded">flutter pub get</code> to install dependencies</li>
                      <li>Run <code className="bg-muted px-1 rounded">flutter run</code> to start development</li>
                      <li>Run <code className="bg-muted px-1 rounded">flutter build apk</code> or <code className="bg-muted px-1 rounded">flutter build ios</code> for production</li>
                    </ol>
                  )}
                  {selectedTarget === "flutterflow" && (
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Download and extract the ZIP file</li>
                      <li>Open FlutterFlow and create a new project</li>
                      <li>Import the <code className="bg-muted px-1 rounded">export.json</code> file</li>
                      <li>Customize your app in the visual builder</li>
                      <li>Deploy directly from FlutterFlow</li>
                    </ol>
                  )}
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="flex justify-between flex-wrap gap-3">
              <Button variant="outline" onClick={handleReset} data-testid="button-build-another">
                Build Another App
              </Button>
              <Button onClick={handleDownload} size="lg" data-testid="button-download">
                <Download className="h-4 w-4 mr-2" />
                Download {selectedTarget?.charAt(0).toUpperCase()}{selectedTarget?.slice(1)} App
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
