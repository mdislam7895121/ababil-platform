"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Puzzle,
  Plug,
  ListChecks,
  Play,
  FileText,
  Clock,
} from "lucide-react";

interface Blueprint {
  templateKey: string;
  templateName: string;
  description: string;
  modules: string[];
  connectors: string[];
  workflows: Record<string, any>;
  sampleData: Array<{ type: string; name: string; [key: string]: any }>;
  dashboardWidgets: string[];
  checklist: string[];
  customizations: Record<string, any>;
}

interface DraftResponse {
  builderRequestId: string;
  blueprintId: string;
  blueprint: Blueprint;
  summary: string;
}

interface BuildOutput {
  success: boolean;
  templateKey: string;
  templateName: string;
  enabledModules: string[];
  recommendedConnectors: string[];
  checklist: string[];
  dashboardWidgets: string[];
  message: string;
}

interface BuilderRequest {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string };
  blueprint: {
    id: string;
    templateKey: string;
    summary: string;
  } | null;
  lastBuildRun: {
    id: string;
    status: string;
    finishedAt: string;
  } | null;
}

export default function BuilderPage() {
  const { token, currentTenant } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [prompt, setPrompt] = useState("");
  const [currentDraft, setCurrentDraft] = useState<DraftResponse | null>(null);
  const [buildResult, setBuildResult] = useState<BuildOutput | null>(null);

  const headers = {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": currentTenant?.id || "",
    "Content-Type": "application/json",
  };

  const { data: requests, isLoading: requestsLoading } = useQuery<BuilderRequest[]>({
    queryKey: ["builder-requests", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/builder/requests", { headers });
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const draftMutation = useMutation({
    mutationFn: async (promptText: string) => {
      const res = await fetch("/api/builder/draft", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: promptText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create draft");
      }
      return res.json() as Promise<DraftResponse>;
    },
    onSuccess: (data) => {
      setCurrentDraft(data);
      toast({
        title: "Blueprint Generated",
        description: `Template: ${data.blueprint.templateName}`,
      });
      queryClient.invalidateQueries({ queryKey: ["builder-requests"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (builderRequestId: string) => {
      const res = await fetch("/api/builder/approve", {
        method: "POST",
        headers,
        body: JSON.stringify({ builderRequestId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to approve");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Approved",
        description: "Blueprint approved. Starting build...",
      });
      if (currentDraft) {
        runMutation.mutate(currentDraft.builderRequestId);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: async (builderRequestId: string) => {
      const res = await fetch("/api/builder/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ builderRequestId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to run build");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setBuildResult(data.output);
      toast({
        title: "Build Complete",
        description: data.output.message,
      });
      queryClient.invalidateQueries({ queryKey: ["builder-requests"] });
      queryClient.invalidateQueries({ queryKey: ["modules"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Build Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerateBlueprint = () => {
    if (!prompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a prompt",
        variant: "destructive",
      });
      return;
    }
    setCurrentDraft(null);
    setBuildResult(null);
    draftMutation.mutate(prompt);
  };

  const handleApproveAndBuild = () => {
    if (!currentDraft) return;
    approveMutation.mutate(currentDraft.builderRequestId);
  };

  const isProcessing = draftMutation.isPending || approveMutation.isPending || runMutation.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wand2 className="h-8 w-8" />
            Build from Prompt
          </h1>
          <p className="text-muted-foreground">
            Describe what you want to build and we will configure your platform automatically
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Describe Your Business</CardTitle>
            <CardDescription>
              Tell us about your business and what you want to build. We will generate a configuration blueprint for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              className="w-full min-h-32 p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-background"
              placeholder="Example: I want to build a booking system for my hair salon called 'Style Studio'. I need to accept appointments for haircuts ($30), coloring ($80), and styling ($50)."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isProcessing}
              data-testid="input-prompt"
            />
            <Button
              onClick={handleGenerateBlueprint}
              disabled={isProcessing || !prompt.trim()}
              data-testid="button-generate-blueprint"
            >
              {draftMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generate Blueprint
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {currentDraft && !buildResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Blueprint Preview
              </CardTitle>
              <CardDescription>
                Review the configuration before applying
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Template</h3>
                <Badge variant="secondary" className="text-base" data-testid="badge-template">
                  {currentDraft.blueprint.templateName}
                </Badge>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentDraft.blueprint.description}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Puzzle className="h-4 w-4" />
                  Modules to Enable
                </h3>
                <div className="flex flex-wrap gap-2">
                  {currentDraft.blueprint.modules.map((mod) => (
                    <Badge key={mod} variant="outline" data-testid={`badge-module-${mod}`}>
                      {mod}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  Recommended Connectors
                </h3>
                <div className="flex flex-wrap gap-2">
                  {currentDraft.blueprint.connectors.map((conn) => (
                    <Badge key={conn} variant="outline" data-testid={`badge-connector-${conn}`}>
                      {conn}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Setup Checklist
                </h3>
                <ul className="space-y-1">
                  {currentDraft.blueprint.checklist.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground">{idx + 1}.</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                onClick={handleApproveAndBuild}
                disabled={isProcessing}
                className="w-full"
                data-testid="button-approve-build"
              >
                {approveMutation.isPending || runMutation.isPending ? (
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
            </CardContent>
          </Card>
        )}

        {buildResult && (
          <Card className="border-green-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                Build Complete
              </CardTitle>
              <CardDescription>
                {buildResult.message}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Enabled Modules</h3>
                <div className="flex flex-wrap gap-2">
                  {buildResult.enabledModules.map((mod) => (
                    <Badge key={mod} className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" data-testid={`badge-enabled-${mod}`}>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {mod}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Next Steps</h3>
                <ul className="space-y-2">
                  {buildResult.checklist.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm p-2 bg-muted rounded-lg" data-testid={`checklist-item-${idx}`}>
                      <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">
                        {idx + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <a href="/dashboard/modules" data-testid="link-modules">
                    <Puzzle className="mr-2 h-4 w-4" />
                    View Modules
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/dashboard/connectors" data-testid="link-connectors">
                    <Plug className="mr-2 h-4 w-4" />
                    Configure Connectors
                  </a>
                </Button>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setCurrentDraft(null);
                  setBuildResult(null);
                  setPrompt("");
                }}
                data-testid="button-new-build"
              >
                Start New Build
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Builds
            </CardTitle>
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : requests?.length ? (
              <div className="space-y-2">
                {requests.slice(0, 5).map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`request-${req.id}`}
                  >
                    <div>
                      <p className="font-medium">
                        {req.blueprint?.templateKey?.replace(/_/g, " ") || "Unknown"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        req.status === "done"
                          ? "default"
                          : req.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                      data-testid={`status-${req.id}`}
                    >
                      {req.status === "done" && <CheckCircle className="h-3 w-3 mr-1" />}
                      {req.status === "failed" && <AlertCircle className="h-3 w-3 mr-1" />}
                      {req.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No build history yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
