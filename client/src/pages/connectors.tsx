import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CreditCard,
  Mail,
  HardDrive,
  Bell,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings,
  TestTube,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ConnectorItem {
  key: string;
  connected: boolean;
  config: Record<string, unknown> | null;
}

const connectorInfo: Record<string, {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  configFields: { key: string; label: string; placeholder: string; isSecret?: boolean }[];
}> = {
  stripe: {
    name: "Stripe",
    description: "Accept payments and manage subscriptions",
    icon: CreditCard,
    configFields: [
      { key: "publishableKey", label: "Publishable Key", placeholder: "pk_..." },
      { key: "secretKey", label: "Secret Key", placeholder: "sk_...", isSecret: true },
      { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_...", isSecret: true },
    ],
  },
  email: {
    name: "Email",
    description: "Send transactional and marketing emails",
    icon: Mail,
    configFields: [
      { key: "provider", label: "Provider", placeholder: "sendgrid, mailgun, ses" },
      { key: "apiKey", label: "API Key", placeholder: "Your API key", isSecret: true },
      { key: "fromEmail", label: "From Email", placeholder: "noreply@yourcompany.com" },
    ],
  },
  storage: {
    name: "Storage",
    description: "Store and serve files and media",
    icon: HardDrive,
    configFields: [
      { key: "provider", label: "Provider", placeholder: "s3, gcs, cloudflare" },
      { key: "bucket", label: "Bucket Name", placeholder: "my-bucket" },
      { key: "accessKey", label: "Access Key", placeholder: "Your access key", isSecret: true },
      { key: "secretKey", label: "Secret Key", placeholder: "Your secret key", isSecret: true },
    ],
  },
  push: {
    name: "Push Notifications",
    description: "Send push notifications to mobile apps",
    icon: Bell,
    configFields: [
      { key: "provider", label: "Provider", placeholder: "firebase, onesignal" },
      { key: "apiKey", label: "API Key", placeholder: "Your API key", isSecret: true },
      { key: "appId", label: "App ID", placeholder: "Your app ID" },
    ],
  },
};

export default function ConnectorsPage() {
  const { toast } = useToast();
  const [configureKey, setConfigureKey] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const { data: connectors, isLoading } = useQuery<ConnectorItem[]>({
    queryKey: ["/api/connectors"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ connectorKey, config, secrets }: { connectorKey: string; config: Record<string, string>; secrets: Record<string, string> }) => {
      const response = await apiRequest("POST", `/api/connectors/${connectorKey}`, { config, secrets });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
      const info = connectorInfo[variables.connectorKey];
      toast({
        title: "Connector saved",
        description: `${info?.name || variables.connectorKey} configuration has been saved.`,
      });
      setConfigureKey(null);
      setFormValues({});
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save connector",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (connectorKey: string) => {
      const response = await apiRequest("POST", `/api/connectors/${connectorKey}/test`);
      return response.json();
    },
    onSuccess: (data, connectorKey) => {
      const info = connectorInfo[connectorKey];
      if (data.success) {
        toast({
          title: "Connection successful",
          description: `${info?.name || connectorKey} is working correctly.`,
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.error || "Could not connect to the service.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Test failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenConfigure = (key: string) => {
    const connector = connectors?.find((c) => c.key === key);
    if (connector?.config) {
      setFormValues(connector.config as Record<string, string>);
    } else {
      setFormValues({});
    }
    setConfigureKey(key);
  };

  const handleSave = () => {
    if (!configureKey) return;
    const info = connectorInfo[configureKey];
    const config: Record<string, string> = {};
    const secrets: Record<string, string> = {};

    info.configFields.forEach((field) => {
      const value = formValues[field.key];
      if (value) {
        if (field.isSecret) {
          secrets[field.key] = value;
        } else {
          config[field.key] = value;
        }
      }
    });

    saveMutation.mutate({ connectorKey: configureKey, config, secrets });
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connectors</h1>
          <p className="text-muted-foreground">
            Configure integrations with external services
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-md" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-28" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(connectorInfo).map(([key, info]) => {
              const connector = connectors?.find((c) => c.key === key);
              const isConnected = connector?.connected ?? false;
              const Icon = info.icon;
              const isTesting = testMutation.isPending && testMutation.variables === key;

              return (
                <Card key={key}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-md ${
                            isConnected ? "bg-green-500/10" : "bg-muted"
                          }`}
                        >
                          <Icon
                            className={`h-6 w-6 ${
                              isConnected ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                            }`}
                          />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{info.name}</CardTitle>
                          <CardDescription>{info.description}</CardDescription>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          isConnected
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {isConnected ? (
                          <>
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Connected
                          </>
                        ) : (
                          <>
                            <XCircle className="mr-1 h-3 w-3" />
                            Not configured
                          </>
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleOpenConfigure(key)}
                      data-testid={`button-configure-${key}`}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Configure
                    </Button>
                    {isConnected && (
                      <Button
                        variant="ghost"
                        onClick={() => testMutation.mutate(key)}
                        disabled={isTesting}
                        data-testid={`button-test-${key}`}
                      >
                        {isTesting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="mr-2 h-4 w-4" />
                        )}
                        Test
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!configureKey} onOpenChange={() => setConfigureKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Configure {configureKey ? connectorInfo[configureKey]?.name : ""}
            </DialogTitle>
            <DialogDescription>
              Enter your credentials to connect this service
            </DialogDescription>
          </DialogHeader>
          {configureKey && (
            <div className="space-y-4 py-4">
              {connectorInfo[configureKey].configFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label className="text-sm font-medium">{field.label}</label>
                  <Input
                    type={field.isSecret ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={formValues[field.key] || ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    data-testid={`input-${configureKey}-${field.key}`}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigureKey(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-connector"
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
