"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Calendar, ShoppingCart, Users, Headphones, BarChart, Bot } from "lucide-react";

const MODULE_INFO: Record<string, { name: string; description: string; icon: React.ReactNode }> = {
  booking: { name: "Booking", description: "Appointment and reservation management", icon: <Calendar className="h-5 w-5" /> },
  ecommerce: { name: "E-commerce", description: "Online store and product catalog", icon: <ShoppingCart className="h-5 w-5" /> },
  crm: { name: "CRM", description: "Customer relationship management", icon: <Users className="h-5 w-5" /> },
  support: { name: "Support", description: "Help desk and ticket system", icon: <Headphones className="h-5 w-5" /> },
  analytics: { name: "Analytics", description: "Business intelligence and reporting", icon: <BarChart className="h-5 w-5" /> },
  ai_assistant: { name: "AI Assistant", description: "AI-powered platform assistant", icon: <Bot className="h-5 w-5" /> },
};

interface Module {
  key: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

export default function ModulesPage() {
  const { token, currentTenant } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: modules, isLoading } = useQuery<Module[]>({
    queryKey: ["modules", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/modules", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || "",
        },
      });
      if (!res.ok) throw new Error("Failed to load modules");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const res = await fetch(`/api/modules/${key}/toggle`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to toggle module");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      toast({ title: "Module updated" });
    },
    onError: () => {
      toast({ title: "Failed to update module", variant: "destructive" });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Modules</h1>
          <p className="text-muted-foreground">Enable or disable platform features</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array(6)
                .fill(0)
                .map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full" />
                    </CardContent>
                  </Card>
                ))
            : modules?.map((module) => {
                const info = MODULE_INFO[module.key] || { name: module.key, description: "", icon: null };
                return (
                  <Card key={module.key} data-testid={`card-module-${module.key}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">{info.icon}</div>
                        <div>
                          <CardTitle className="text-lg">{info.name}</CardTitle>
                          {module.enabled && <Badge variant="secondary">Active</Badge>}
                        </div>
                      </div>
                      <Switch
                        checked={module.enabled}
                        onCheckedChange={(enabled) => toggleMutation.mutate({ key: module.key, enabled })}
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-module-${module.key}`}
                      />
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{info.description}</CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
      </div>
    </DashboardLayout>
  );
}
