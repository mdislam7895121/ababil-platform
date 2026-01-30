"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  User,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Puzzle,
  Plug,
  DollarSign,
  ExternalLink,
  Play,
  Link as LinkIcon,
  ArrowRight,
  Target,
  Lock,
  CreditCard,
  Clock,
  Sparkles,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  data?: DraftResponse | BuildOutput | PreviewResponse | null;
  type?: "text" | "draft" | "build" | "preview" | "error" | "next-steps";
  nextSteps?: NextStep[];
}

interface DraftResponse {
  builderRequestId: string;
  blueprintId: string;
  blueprint: {
    templateKey: string;
    templateName: string;
    description: string;
    modules: string[];
    connectors: string[];
    workflows: Record<string, any>;
    sampleData: Array<{ type: string; name: string }>;
    dashboardWidgets: string[];
    checklist: string[];
    customizations: Record<string, any>;
  };
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

interface PreviewResponse {
  ok: boolean;
  previewUrl: string;
  token: string;
  role: string;
  expiresAt: string;
}

interface NextStep {
  id: string;
  title: string;
  description: string;
  priority: number;
  action: string;
  actionUrl: string;
  category: string;
  completed: boolean;
}

let messageIdCounter = 0;
function generateMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

export default function AgentPage() {
  const { token, currentTenant } = useAuth();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm your platform builder assistant. Tell me what kind of digital platform you want to create, and I'll generate a complete blueprint for you.\n\nFor example: \"I need a booking platform for a salon with customer management and payments\"",
      timestamp: new Date(),
      type: "text",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [currentDraft, setCurrentDraft] = useState<DraftResponse | null>(null);
  const [currentBuild, setCurrentBuild] = useState<BuildOutput | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<{ code: number; message: string } | null>(null);

  const headers = {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": currentTenant?.id || "",
    "Content-Type": "application/json",
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleApiError = (status: number, errorData: any) => {
    setError({ code: status, message: errorData?.error || "An error occurred" });
    
    let errorMessage = "";
    let errorType: "text" | "error" = "error";
    
    switch (status) {
      case 401:
        errorMessage = "You need to log in to continue. Please refresh and sign in again.";
        break;
      case 403:
        errorMessage = "You don't have permission to perform this action. Please contact your administrator.";
        break;
      case 402:
        errorMessage = "This action requires a paid plan. Please upgrade your billing to continue.";
        break;
      case 429:
        const retryAfter = errorData?.retryAfter || 60;
        errorMessage = `Too many requests. Please wait ${retryAfter} seconds before trying again.`;
        break;
      default:
        errorMessage = errorData?.error || "Something went wrong. Please try again.";
    }
    
    return { errorMessage, errorType, status };
  };

  const addMessage = (message: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateMessageId(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage;
  };

  const draftMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await fetch("/api/builder/draft", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw { status: res.status, data: errorData };
      }
      return res.json() as Promise<DraftResponse>;
    },
    onSuccess: (data) => {
      setCurrentDraft(data);
      setCurrentBuild(null);
      setPreviewUrl(null);
      setError(null);
      
      addMessage({
        role: "assistant",
        content: `I've created a draft blueprint for you: **${data.blueprint.templateName}**\n\n${data.summary}`,
        type: "draft",
        data,
      });
    },
    onError: (error: any) => {
      const { errorMessage, status } = handleApiError(error.status || 500, error.data);
      addMessage({
        role: "assistant",
        content: errorMessage,
        type: "error",
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
        const errorData = await res.json().catch(() => ({}));
        throw { status: res.status, data: errorData };
      }
      return res.json();
    },
  });

  const buildMutation = useMutation({
    mutationFn: async (builderRequestId: string) => {
      const res = await fetch("/api/builder/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ builderRequestId }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw { status: res.status, data: errorData };
      }
      return res.json() as Promise<{ buildRunId: string; status: string; output: BuildOutput }>;
    },
    onSuccess: (data) => {
      setCurrentBuild(data.output);
      setError(null);
      
      addMessage({
        role: "assistant",
        content: `Your platform has been built successfully!\n\n${data.output.message}\n\nYou can now create a preview link to share or open the Success Center to see your next steps.`,
        type: "build",
        data: data.output,
      });
    },
    onError: (error: any) => {
      const { errorMessage } = handleApiError(error.status || 500, error.data);
      addMessage({
        role: "assistant",
        content: errorMessage,
        type: "error",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/preview/create", {
        method: "POST",
        headers,
        body: JSON.stringify({ role: "admin" }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw { status: res.status, data: errorData };
      }
      return res.json() as Promise<PreviewResponse>;
    },
    onSuccess: (data) => {
      setPreviewUrl(data.previewUrl);
      setError(null);
      
      addMessage({
        role: "assistant",
        content: `Preview link created! Share this link to let others see your platform:\n\n**${window.location.origin}${data.previewUrl}**\n\nThis link will expire in 24 hours.`,
        type: "preview",
        data,
      });
    },
    onError: (error: any) => {
      const { errorMessage } = handleApiError(error.status || 500, error.data);
      addMessage({
        role: "assistant",
        content: errorMessage,
        type: "error",
      });
    },
  });

  const { data: nextStepsData, refetch: refetchNextSteps } = useQuery({
    queryKey: ["success-next-steps", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/success/next-steps", { headers });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!token && !!currentTenant?.id && !!currentBuild,
  });

  const handleSubmit = async () => {
    if (!inputValue.trim() || draftMutation.isPending) return;
    
    const userMessage = inputValue.trim();
    setInputValue("");
    
    addMessage({
      role: "user",
      content: userMessage,
      type: "text",
    });
    
    draftMutation.mutate(userMessage);
  };

  const handleApproveAndBuild = async () => {
    if (!currentDraft) return;
    
    addMessage({
      role: "user",
      content: "Approve and build this platform",
      type: "text",
    });
    
    addMessage({
      role: "assistant",
      content: "Approving and building your platform...",
      type: "text",
    });
    
    try {
      await approveMutation.mutateAsync(currentDraft.builderRequestId);
      await buildMutation.mutateAsync(currentDraft.builderRequestId);
      refetchNextSteps();
    } catch (error: any) {
      const { errorMessage } = handleApiError(error.status || 500, error.data);
      addMessage({
        role: "assistant",
        content: errorMessage,
        type: "error",
      });
    }
  };

  const handleCreatePreview = () => {
    previewMutation.mutate();
  };

  const handleShowNextSteps = () => {
    if (nextStepsData?.nextSteps) {
      addMessage({
        role: "assistant",
        content: "Here are your recommended next steps:",
        type: "next-steps",
        nextSteps: nextStepsData.nextSteps.slice(0, 3),
      });
    }
  };

  const isLoading = draftMutation.isPending || approveMutation.isPending || buildMutation.isPending || previewMutation.isPending;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-120px)] max-w-5xl mx-auto" data-testid="agent-page">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6" />
              Platform Builder Agent
            </h1>
            <p className="text-muted-foreground">
              Describe your platform in natural language and let AI build it for you
            </p>
          </div>
        </div>

        {error && (
          <Alert variant={error.code === 402 ? "default" : "destructive"} className="mb-4" data-testid="error-alert">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              {error.code === 401 && <><Lock className="inline h-4 w-4 mr-1" /> Authentication Required</>}
              {error.code === 403 && <><Lock className="inline h-4 w-4 mr-1" /> Permission Denied</>}
              {error.code === 402 && <><CreditCard className="inline h-4 w-4 mr-1" /> Upgrade Required</>}
              {error.code === 429 && <><Clock className="inline h-4 w-4 mr-1" /> Rate Limited</>}
              {![401, 402, 403, 429].includes(error.code) && "Error"}
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error.message}</span>
              {error.code === 402 && (
                <Button size="sm" asChild data-testid="button-upgrade-billing">
                  <a href="/dashboard/billing">Upgrade Now</a>
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`message-${message.id}`}
              >
                {message.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : message.type === "error"
                      ? "bg-destructive/10 border border-destructive/20"
                      : "bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  
                  {message.type === "draft" && message.data && (
                    <DraftSummaryPanel draft={message.data as DraftResponse} />
                  )}
                  
                  {message.type === "build" && message.data && (
                    <BuildSummaryPanel build={message.data as BuildOutput} />
                  )}
                  
                  {message.type === "preview" && message.data && (
                    <PreviewLinkPanel preview={message.data as PreviewResponse} />
                  )}
                  
                  {message.type === "next-steps" && message.nextSteps && (
                    <NextStepsPanel steps={message.nextSteps} />
                  )}
                </div>
                {message.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </CardContent>

          {currentDraft && !currentBuild && (
            <div className="border-t p-4 bg-muted/50" data-testid="draft-actions">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleApproveAndBuild}
                  disabled={isLoading}
                  data-testid="button-approve-build"
                >
                  {approveMutation.isPending || buildMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Approve & Build
                </Button>
              </div>
            </div>
          )}

          {currentBuild && (
            <div className="border-t p-4 bg-muted/50" data-testid="build-actions">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleCreatePreview}
                  disabled={isLoading}
                  variant="outline"
                  data-testid="button-create-preview"
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LinkIcon className="h-4 w-4 mr-2" />
                  )}
                  Create Preview Link
                </Button>
                {previewUrl && (
                  <Button
                    variant="outline"
                    asChild
                    data-testid="button-open-preview"
                  >
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Preview
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleShowNextSteps}
                  disabled={!nextStepsData?.nextSteps}
                  data-testid="button-show-next-steps"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Show Next Steps
                </Button>
                <Button
                  variant="outline"
                  asChild
                  data-testid="button-open-success"
                >
                  <a href="/dashboard/success">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Open Success Center
                  </a>
                </Button>
              </div>
            </div>
          )}

          <CardFooter className="border-t p-4">
            <div className="flex w-full gap-2">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Describe the platform you want to build..."
                className="min-h-[60px] resize-none"
                disabled={isLoading}
                data-testid="input-prompt"
              />
              <Button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isLoading}
                size="lg"
                className="px-4 self-end"
                data-testid="button-send"
              >
                {draftMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function DraftSummaryPanel({ draft }: { draft: DraftResponse }) {
  const { blueprint } = draft;
  
  return (
    <div className="mt-3 p-3 bg-background rounded border space-y-3" data-testid="draft-summary">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{blueprint.templateKey}</Badge>
        <span className="text-sm font-medium">{blueprint.templateName}</span>
      </div>
      
      <p className="text-xs text-muted-foreground">{blueprint.description}</p>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <Puzzle className="h-3 w-3" />
          <span>Modules: {blueprint.modules.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Plug className="h-3 w-3" />
          <span>Connectors: {blueprint.connectors.length}</span>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-1">
        {blueprint.modules.map((mod) => (
          <Badge key={mod} variant="outline" className="text-xs" data-testid={`module-badge-${mod}`}>
            {mod}
          </Badge>
        ))}
      </div>
      
      {blueprint.connectors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {blueprint.connectors.map((conn) => (
            <Badge key={conn} variant="outline" className="text-xs bg-orange-50 dark:bg-orange-900/20" data-testid={`connector-badge-${conn}`}>
              {conn}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildSummaryPanel({ build }: { build: BuildOutput }) {
  return (
    <div className="mt-3 p-3 bg-background rounded border space-y-2" data-testid="build-summary">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span className="text-sm font-medium">{build.templateName}</span>
      </div>
      
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-1">
          <Puzzle className="h-3 w-3" />
          <span>Enabled: {build.enabledModules.join(", ")}</span>
        </div>
        {build.recommendedConnectors.length > 0 && (
          <div className="flex items-center gap-1">
            <Plug className="h-3 w-3" />
            <span>Recommended: {build.recommendedConnectors.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewLinkPanel({ preview }: { preview: PreviewResponse }) {
  const fullUrl = `${window.location.origin}${preview.previewUrl}`;
  
  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
  };
  
  return (
    <div className="mt-3 p-3 bg-background rounded border space-y-2" data-testid="preview-link">
      <div className="flex items-center gap-2">
        <LinkIcon className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium">Preview Link Ready</span>
      </div>
      
      <div className="flex items-center gap-2">
        <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate" data-testid="preview-url">
          {fullUrl}
        </code>
        <Button size="sm" variant="ghost" onClick={handleCopy} data-testid="button-copy-preview">
          Copy
        </Button>
      </div>
      
      <div className="text-xs text-muted-foreground">
        Expires: {new Date(preview.expiresAt).toLocaleString()}
      </div>
    </div>
  );
}

function NextStepsPanel({ steps }: { steps: NextStep[] }) {
  return (
    <div className="mt-3 space-y-2" data-testid="next-steps-panel">
      {steps.map((step, index) => (
        <a
          key={step.id}
          href={step.actionUrl}
          className="block p-3 bg-background rounded border hover-elevate transition-colors"
          data-testid={`next-step-${index}`}
        >
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{step.title}</div>
              <div className="text-xs text-muted-foreground">{step.description}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </div>
        </a>
      ))}
    </div>
  );
}
