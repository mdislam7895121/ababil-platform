"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n/context";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Key, Puzzle, Plug, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardStats {
  users: number;
  apiKeys: number;
  modules: number;
  connectors: number;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: string;
    actor: { id: string; name: string; email: string } | null;
  }>;
}

export default function DashboardPage() {
  const { token, currentTenant } = useAuth();
  const { t, language } = useTranslation();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || "",
        },
      });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground" data-testid="text-dashboard-welcome">{t("common.welcome")} {t("dashboard.workspace")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-user-count">{stats?.users || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Keys</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-api-key-count">{stats?.apiKeys || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Modules</CardTitle>
              <Puzzle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-module-count">{stats?.modules || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connectors</CardTitle>
              <Plug className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-connector-count">{stats?.connectors || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : stats?.recentActivity?.length ? (
              <div className="space-y-3">
                {stats.recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                    data-testid={`activity-${activity.id}`}
                  >
                    <div>
                      <p className="font-medium">{activity.action.replace(/_/g, " ")}</p>
                      <p className="text-sm text-muted-foreground">
                        {activity.entityType}
                        {activity.entityId ? `: ${activity.entityId}` : ""}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{activity.actor?.name || "System"}</p>
                      <p>{new Date(activity.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
