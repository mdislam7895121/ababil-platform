import { useQuery } from "@tanstack/react-query";
import { Users, Key, Puzzle, Activity, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/Layout";

interface DashboardStats {
  totalUsers: number;
  totalApiKeys: number;
  enabledModules: number;
  connectedConnectors: number;
  recentActivity: number;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: number | string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your platform metrics and activity
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Team Members"
            value={stats?.totalUsers ?? 0}
            description="Active users in your organization"
            icon={Users}
            isLoading={isLoading}
          />
          <StatCard
            title="API Keys"
            value={stats?.totalApiKeys ?? 0}
            description="Active programmatic access keys"
            icon={Key}
            isLoading={isLoading}
          />
          <StatCard
            title="Active Modules"
            value={stats?.enabledModules ?? 0}
            description="Features enabled for your org"
            icon={Puzzle}
            isLoading={isLoading}
          />
          <StatCard
            title="Connectors"
            value={stats?.connectedConnectors ?? 0}
            description="Integrations configured"
            icon={Activity}
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Quick Actions
              </CardTitle>
              <CardDescription>Common tasks for your organization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-md border p-3 hover-elevate cursor-pointer">
                <div className="font-medium">Invite team members</div>
                <div className="text-sm text-muted-foreground">Add users to your organization</div>
              </div>
              <div className="rounded-md border p-3 hover-elevate cursor-pointer">
                <div className="font-medium">Create API key</div>
                <div className="text-sm text-muted-foreground">Generate programmatic access</div>
              </div>
              <div className="rounded-md border p-3 hover-elevate cursor-pointer">
                <div className="font-medium">Enable modules</div>
                <div className="text-sm text-muted-foreground">Activate platform features</div>
              </div>
              <div className="rounded-md border p-3 hover-elevate cursor-pointer">
                <div className="font-medium">Configure connectors</div>
                <div className="text-sm text-muted-foreground">Set up integrations</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest actions in your organization</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Activity will appear here once you start using the platform
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
