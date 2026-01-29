import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calendar,
  ShoppingCart,
  Users,
  HeadphonesIcon,
  BarChart3,
  Bot,
  Loader2,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ModuleItem {
  key: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

const moduleInfo: Record<string, { name: string; description: string; icon: React.ComponentType<{ className?: string }>; category: string }> = {
  booking: {
    name: "Booking",
    description: "Appointment scheduling and calendar management",
    icon: Calendar,
    category: "Operations",
  },
  ecommerce: {
    name: "E-Commerce",
    description: "Online store, products, and order management",
    icon: ShoppingCart,
    category: "Sales",
  },
  crm: {
    name: "CRM",
    description: "Customer relationship management and contacts",
    icon: Users,
    category: "Sales",
  },
  support: {
    name: "Support",
    description: "Help desk, tickets, and customer support",
    icon: HeadphonesIcon,
    category: "Service",
  },
  analytics: {
    name: "Analytics",
    description: "Business intelligence and reporting dashboards",
    icon: BarChart3,
    category: "Insights",
  },
  ai_assistant: {
    name: "AI Assistant",
    description: "Intelligent chat assistant powered by AI",
    icon: Bot,
    category: "AI",
  },
};

export default function ModulesPage() {
  const { toast } = useToast();

  const { data: modules, isLoading } = useQuery<ModuleItem[]>({
    queryKey: ["/api/modules"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) => {
      const endpoint = enabled
        ? `/api/modules/${moduleKey}/enable`
        : `/api/modules/${moduleKey}/disable`;
      const response = await apiRequest("POST", endpoint);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/modules"] });
      const info = moduleInfo[variables.moduleKey];
      toast({
        title: variables.enabled ? "Module enabled" : "Module disabled",
        description: `${info?.name || variables.moduleKey} has been ${variables.enabled ? "enabled" : "disabled"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update module",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const categories = Array.from(new Set(Object.values(moduleInfo).map((m) => m.category)));

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Modules</h1>
          <p className="text-muted-foreground">
            Enable or disable platform features for your organization
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          categories.map((category) => {
            const categoryModules = Object.entries(moduleInfo).filter(
              ([, info]) => info.category === category
            );

            return (
              <div key={category} className="space-y-4">
                <h2 className="text-lg font-semibold">{category}</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categoryModules.map(([key, info]) => {
                    const moduleData = modules?.find((m) => m.key === key);
                    const isEnabled = moduleData?.enabled ?? false;
                    const Icon = info.icon;
                    const isPending = toggleMutation.isPending && toggleMutation.variables?.moduleKey === key;

                    return (
                      <Card key={key} className={isEnabled ? "border-primary/50" : ""}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-10 w-10 items-center justify-center rounded-md ${
                                  isEnabled ? "bg-primary text-primary-foreground" : "bg-muted"
                                }`}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <CardTitle className="text-base">{info.name}</CardTitle>
                                <Badge variant="secondary" className="mt-1 text-xs">
                                  {info.category}
                                </Badge>
                              </div>
                            </div>
                            {isPending ? (
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            ) : (
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) =>
                                  toggleMutation.mutate({ moduleKey: key, enabled: checked })
                                }
                                data-testid={`switch-module-${key}`}
                              />
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription>{info.description}</CardDescription>
                          {isEnabled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-3 -ml-2"
                              data-testid={`button-configure-${key}`}
                            >
                              <Settings className="mr-2 h-4 w-4" />
                              Configure
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
