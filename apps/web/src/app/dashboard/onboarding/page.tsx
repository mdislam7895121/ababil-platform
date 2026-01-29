"use client";

import { useState, useEffect, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useSearchParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Scissors,
  Stethoscope,
  Truck,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle,
  Puzzle,
  Plug,
  ListChecks,
  Play,
  DollarSign,
  Users,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  BellOff,
  CreditCard,
  Sparkles,
} from "lucide-react";

type BusinessType = "salon" | "clinic" | "courier";
type StaffCount = "1" | "2-5" | "6-20" | "20+";
type NotificationType = "email" | "sms" | "whatsapp" | "none";
type WorkingHours = "9-6" | "10-8" | "24/7";

interface OnboardingAnswers {
  businessType: BusinessType | null;
  businessName: string;
  city: string;
  staffCount: StaffCount | null;
  needsPayment: boolean | null;
  notifications: NotificationType[];
  workingHours: WorkingHours | null;
}

interface Blueprint {
  templateKey: string;
  templateName: string;
  description: string;
  modules: string[];
  connectors: string[];
  checklist: string[];
}

interface DraftResponse {
  builderRequestId: string;
  blueprintId: string;
  blueprint: Blueprint;
  summary: string;
  context: OnboardingAnswers;
}

interface CostEstimate {
  summary: {
    totalMin: number;
    totalMax: number;
    currency: string;
    period: string;
  };
}

const BUSINESS_TYPES = [
  { key: "salon" as const, label: "Hair Salon / Beauty", description: "Appointments, styling, treatments", Icon: Scissors },
  { key: "clinic" as const, label: "Clinic / Diagnostic", description: "Medical appointments, patient records", Icon: Stethoscope },
  { key: "courier" as const, label: "Courier / Delivery", description: "Package tracking, deliveries", Icon: Truck },
];

const STAFF_OPTIONS = [
  { key: "1" as const, label: "Just me", description: "Solo operation" },
  { key: "2-5" as const, label: "2-5 people", description: "Small team" },
  { key: "6-20" as const, label: "6-20 people", description: "Growing team" },
  { key: "20+" as const, label: "20+ people", description: "Large team" },
];

const NOTIFICATION_OPTIONS = [
  { key: "email" as const, label: "Email", Icon: Mail },
  { key: "sms" as const, label: "SMS", Icon: Phone },
  { key: "whatsapp" as const, label: "WhatsApp", Icon: MessageSquare },
  { key: "none" as const, label: "None", Icon: BellOff },
];

const HOURS_OPTIONS = [
  { key: "9-6" as const, label: "9 AM - 6 PM", description: "Standard hours" },
  { key: "10-8" as const, label: "10 AM - 8 PM", description: "Extended hours" },
  { key: "24/7" as const, label: "24/7", description: "Always open" },
];

function OnboardingContent() {
  const { token, currentTenant, memberships, currentRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    businessType: null,
    businessName: "",
    city: "",
    staffCount: null,
    needsPayment: null,
    notifications: [],
    workingHours: null,
  });
  const [draftResult, setDraftResult] = useState<DraftResponse | null>(null);
  const [buildComplete, setBuildComplete] = useState(false);
  
  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";

  useEffect(() => {
    const industryParam = searchParams.get("industry");
    if (industryParam && ["salon", "clinic", "courier"].includes(industryParam)) {
      setAnswers(prev => ({ ...prev, businessType: industryParam as BusinessType }));
    }
  }, [searchParams]);
  
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": currentTenant?.id || "",
    "Content-Type": "application/json",
  };

  const { data: costs } = useQuery<CostEstimate>({
    queryKey: ["costs", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/costs", { headers });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!token && !!currentTenant && step === 7,
  });
  
  const draftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding/draft", {
        method: "POST",
        headers,
        body: JSON.stringify(answers),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate blueprint");
      }
      return res.json() as Promise<DraftResponse>;
    },
    onSuccess: (data) => {
      setDraftResult(data);
      toast({ title: "Blueprint ready", description: "Review your platform configuration below" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  const approveMutation = useMutation({
    mutationFn: async (builderRequestId: string) => {
      const res = await fetch("/api/builder/approve", {
        method: "POST",
        headers,
        body: JSON.stringify({ builderRequestId }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
  });
  
  const runMutation = useMutation({
    mutationFn: async (builderRequestId: string) => {
      const res = await fetch("/api/builder/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ builderRequestId }),
      });
      if (!res.ok) throw new Error("Failed to build");
      return res.json();
    },
    onSuccess: () => {
      setBuildComplete(true);
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      toast({ title: "Build complete", description: "Redirecting to preview..." });
      setTimeout(() => {
        router.push("/dashboard/preview");
      }, 1500);
    },
    onError: (error: Error) => {
      toast({ title: "Build failed", description: error.message, variant: "destructive" });
    },
  });
  
  const handleGeneratePlatform = () => {
    draftMutation.mutate();
  };
  
  const handleApproveAndBuild = async () => {
    if (!draftResult) return;
    try {
      await approveMutation.mutateAsync(draftResult.builderRequestId);
      await runMutation.mutateAsync(draftResult.builderRequestId);
    } catch (error) {
      console.error("Build error:", error);
    }
  };
  
  const toggleNotification = (notif: NotificationType) => {
    if (notif === "none") {
      setAnswers({ ...answers, notifications: ["none"] });
    } else {
      const current = answers.notifications.filter(n => n !== "none");
      if (current.includes(notif)) {
        setAnswers({ ...answers, notifications: current.filter(n => n !== notif) });
      } else {
        setAnswers({ ...answers, notifications: [...current, notif] });
      }
    }
  };
  
  const canProceed = () => {
    switch (step) {
      case 1: return !!answers.businessType;
      case 2: return answers.businessName.trim().length >= 2 && answers.city.trim().length >= 2;
      case 3: return !!answers.staffCount;
      case 4: return answers.needsPayment !== null;
      case 5: return answers.notifications.length > 0;
      case 6: return !!answers.workingHours;
      case 7: return true;
      default: return false;
    }
  };
  
  const handleNext = () => {
    if (step === 7) {
      handleGeneratePlatform();
    } else {
      setStep(step + 1);
    }
  };
  
  const isProcessing = draftMutation.isPending || approveMutation.isPending || runMutation.isPending;

  if (buildComplete && draftResult) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto space-y-6">
          <Card className="border-green-500">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>Your Platform is Ready!</CardTitle>
              <CardDescription>
                {draftResult.blueprint.templateName} has been configured
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Puzzle className="h-4 w-4" />
                  Enabled Modules
                </h3>
                <div className="flex flex-wrap gap-2">
                  {draftResult.blueprint.modules.map((mod) => (
                    <Badge key={mod} className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" data-testid={`badge-enabled-${mod}`}>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {mod}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Next Steps
                </h3>
                <ul className="space-y-2">
                  {draftResult.blueprint.checklist.slice(0, 3).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm p-2 bg-muted rounded-lg">
                      <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">
                        {idx + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <Button asChild data-testid="link-checklist">
                  <a href="/dashboard/checklist">
                    <ListChecks className="mr-2 h-4 w-4" />
                    Go to Checklist
                  </a>
                </Button>
                <Button variant="outline" asChild data-testid="link-modules">
                  <a href="/dashboard/modules">
                    <Puzzle className="mr-2 h-4 w-4" />
                    View Modules
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (draftResult) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto space-y-6">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Your Platform Blueprint</CardTitle>
              <CardDescription>
                {answers.businessName} in {answers.city}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Badge variant="secondary" className="text-base mb-2" data-testid="badge-template">
                  {draftResult.blueprint.templateName}
                </Badge>
                <p className="text-sm text-muted-foreground">{draftResult.blueprint.description}</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Puzzle className="h-4 w-4" />
                  Modules
                </h3>
                <div className="flex flex-wrap gap-2">
                  {draftResult.blueprint.modules.map((mod) => (
                    <Badge key={mod} variant="outline" data-testid={`badge-module-${mod}`}>{mod}</Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  Connectors
                </h3>
                <div className="flex flex-wrap gap-2">
                  {draftResult.blueprint.connectors.map((conn) => (
                    <Badge key={conn} variant="outline" data-testid={`badge-connector-${conn}`}>{conn}</Badge>
                  ))}
                </div>
              </div>

              {costs && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Estimated Monthly Cost
                  </h3>
                  <p className="text-2xl font-bold">
                    ${costs.summary.totalMin} - ${costs.summary.totalMax}
                    <span className="text-sm font-normal text-muted-foreground"> /month</span>
                  </p>
                </div>
              )}

              {isAdminOrOwner ? (
                <Button
                  onClick={handleApproveAndBuild}
                  disabled={isProcessing}
                  className="w-full"
                  data-testid="button-approve-build"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Building...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Approve & Build
                    </>
                  )}
                </Button>
              ) : (
                <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-center">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Ask an admin to run the build.
                  </p>
                </div>
              )}

              <Button
                variant="ghost"
                onClick={() => { setDraftResult(null); setStep(1); }}
                className="w-full"
                data-testid="button-start-over"
              >
                Start Over
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Step {step} of 7</span>
            <span className="text-sm font-medium">{Math.round((step / 7) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300" 
              style={{ width: `${(step / 7) * 100}%` }}
            />
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {step === 1 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold" data-testid="step-title">What type of business?</h2>
                  <p className="text-sm text-muted-foreground">Choose the option that best describes your business</p>
                </div>
                <div className="space-y-3">
                  {BUSINESS_TYPES.map(({ key, label, description, Icon }) => (
                    <div
                      key={key}
                      onClick={() => setAnswers({ ...answers, businessType: key })}
                      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors hover-elevate ${
                        answers.businessType === key
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      data-testid={`option-${key}`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        answers.businessType === key ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{label}</p>
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </div>
                      {answers.businessType === key && (
                        <CheckCircle className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold" data-testid="step-title">About your business</h2>
                  <p className="text-sm text-muted-foreground">Tell us the basics</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name</Label>
                    <Input
                      id="businessName"
                      placeholder="e.g., Style Studio"
                      value={answers.businessName}
                      onChange={(e) => setAnswers({ ...answers, businessName: e.target.value })}
                      data-testid="input-business-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="e.g., New York"
                      value={answers.city}
                      onChange={(e) => setAnswers({ ...answers, city: e.target.value })}
                      data-testid="input-city"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold" data-testid="step-title">
                    <Users className="inline-block mr-2 h-6 w-6" />
                    Team size
                  </h2>
                  <p className="text-sm text-muted-foreground">How many people work at your business?</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {STAFF_OPTIONS.map(({ key, label, description }) => (
                    <div
                      key={key}
                      onClick={() => setAnswers({ ...answers, staffCount: key })}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors text-center hover-elevate ${
                        answers.staffCount === key
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      data-testid={`option-staff-${key}`}
                    >
                      <p className="font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold" data-testid="step-title">
                    <CreditCard className="inline-block mr-2 h-6 w-6" />
                    Online payments
                  </h2>
                  <p className="text-sm text-muted-foreground">Do you want customers to pay online?</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setAnswers({ ...answers, needsPayment: true })}
                    className={`p-6 rounded-lg border cursor-pointer transition-colors text-center hover-elevate ${
                      answers.needsPayment === true
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                    data-testid="option-payment-yes"
                  >
                    <CreditCard className="h-8 w-8 mx-auto mb-2" />
                    <p className="font-medium">Yes</p>
                    <p className="text-xs text-muted-foreground">Accept cards online</p>
                  </div>
                  <div
                    onClick={() => setAnswers({ ...answers, needsPayment: false })}
                    className={`p-6 rounded-lg border cursor-pointer transition-colors text-center hover-elevate ${
                      answers.needsPayment === false
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                    data-testid="option-payment-no"
                  >
                    <DollarSign className="h-8 w-8 mx-auto mb-2" />
                    <p className="font-medium">No</p>
                    <p className="text-xs text-muted-foreground">Pay in person</p>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold" data-testid="step-title">Notifications</h2>
                  <p className="text-sm text-muted-foreground">How should we notify your customers?</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {NOTIFICATION_OPTIONS.map(({ key, label, Icon }) => {
                    const isSelected = answers.notifications.includes(key);
                    return (
                      <div
                        key={key}
                        onClick={() => toggleNotification(key)}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors text-center hover-elevate ${
                          isSelected ? "border-primary bg-primary/5" : "border-border"
                        }`}
                        data-testid={`option-notif-${key}`}
                      >
                        <Icon className="h-6 w-6 mx-auto mb-2" />
                        <p className="font-medium">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold" data-testid="step-title">
                    <Clock className="inline-block mr-2 h-6 w-6" />
                    Working hours
                  </h2>
                  <p className="text-sm text-muted-foreground">When are you open?</p>
                </div>
                <div className="space-y-3">
                  {HOURS_OPTIONS.map(({ key, label, description }) => (
                    <div
                      key={key}
                      onClick={() => setAnswers({ ...answers, workingHours: key })}
                      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors hover-elevate ${
                        answers.workingHours === key
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      data-testid={`option-hours-${key}`}
                    >
                      <div className="flex-1">
                        <p className="font-medium">{label}</p>
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </div>
                      {answers.workingHours === key && (
                        <CheckCircle className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold" data-testid="step-title">Review & Generate</h2>
                  <p className="text-sm text-muted-foreground">Everything looks good?</p>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Business Type</span>
                    <span className="font-medium">{BUSINESS_TYPES.find(b => b.key === answers.businessType)?.label}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{answers.businessName}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">City</span>
                    <span className="font-medium">{answers.city}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Team Size</span>
                    <span className="font-medium">{STAFF_OPTIONS.find(s => s.key === answers.staffCount)?.label}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Online Payments</span>
                    <span className="font-medium">{answers.needsPayment ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Notifications</span>
                    <span className="font-medium">{answers.notifications.join(", ")}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Hours</span>
                    <span className="font-medium">{HOURS_OPTIONS.find(h => h.key === answers.workingHours)?.label}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              {step > 1 && (
                <Button
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                  disabled={isProcessing}
                  data-testid="button-back"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button
                onClick={handleNext}
                disabled={!canProceed() || isProcessing}
                className="flex-1"
                data-testid="button-next"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : step === 7 ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate my platform
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
