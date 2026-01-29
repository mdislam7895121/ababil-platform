import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { currentTenant, currentRole } = useAuth();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");

  const { data: tenant, isLoading } = useQuery<TenantProfile>({
    queryKey: ["/api/tenants/me"],
    enabled: !!currentTenant,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; plan?: string }) => {
      const response = await apiRequest("PATCH", "/api/tenants/me", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/me"] });
      toast({
        title: "Settings saved",
        description: "Your organization settings have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const updates: { name?: string; plan?: string } = {};
    if (name && name !== tenant?.name) updates.name = name;
    if (plan && plan !== tenant?.plan) updates.plan = plan;
    
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const canEdit = currentRole === "owner" || currentRole === "admin";

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your organization settings and preferences
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organization
              </CardTitle>
              <CardDescription>
                Basic information about your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization name</Label>
                <Input
                  id="name"
                  defaultValue={tenant?.name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canEdit}
                  data-testid="input-org-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Slug</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm">
                    {tenant?.slug}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used in URLs and API access. Cannot be changed.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div>
                  <Badge
                    variant="secondary"
                    className={
                      tenant?.status === "active"
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : "bg-red-500/10 text-red-600 dark:text-red-400"
                    }
                  >
                    {tenant?.status}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Created</Label>
                <p className="text-sm text-muted-foreground">
                  {tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
                </p>
              </div>

              {canEdit && (
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending || (!name && !plan)}
                  className="w-full"
                  data-testid="button-save-settings"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save changes
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
              <CardDescription>
                Your current plan and billing information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plan">Current plan</Label>
                <Select
                  defaultValue={tenant?.plan}
                  onValueChange={setPlan}
                  disabled={!canEdit}
                >
                  <SelectTrigger data-testid="select-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border p-4 space-y-2">
                <h4 className="font-medium">Plan features</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Unlimited team members</li>
                  <li>• API access</li>
                  <li>• All modules included</li>
                  <li>• Priority support</li>
                </ul>
              </div>

              <div className="rounded-md bg-muted p-4">
                <p className="text-sm text-muted-foreground">
                  Need more features? Contact our sales team to discuss enterprise options.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
