"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, UserCircle, Users, ShoppingCart, Copy, ExternalLink, AlertCircle } from "lucide-react";

interface PreviewSession {
  previewUrl: string;
  token: string;
  role: string;
  expiresAt: string;
}

interface DemoData {
  users: { id: string; name: string; email: string; role: string; isDemo: boolean }[];
  stats: { totalUsers: number; activeModules: number; recentOrders: number; revenue: string; isDemo: boolean };
  recentActivity: { type: string; message: string; time: string; isDemo: boolean }[];
}

export default function PreviewPage() {
  const { token, currentTenant } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [demoData, setDemoData] = useState<DemoData | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const createPreview = async () => {
    if (!token || !currentTenant) return;
    setCreating(true);
    try {
      const res = await fetch("/api/preview/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant.id,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: selectedRole }),
      });
      if (res.ok) {
        const json = await res.json();
        setSession(json);
        await fetchDemoData(json.token);
      }
    } catch (err) {
      console.error("Failed to create preview:", err);
    } finally {
      setCreating(false);
    }
  };

  const fetchDemoData = async (previewToken: string) => {
    try {
      const res = await fetch(`/api/preview/demo-data?token=${previewToken}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || "",
        },
      });
      if (res.ok) {
        const json = await res.json();
        setDemoData(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch demo data:", err);
    }
  };

  const copyLink = () => {
    if (session) {
      navigator.clipboard.writeText(window.location.origin + session.previewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <UserCircle className="h-5 w-5" />;
      case "staff":
        return <Users className="h-5 w-5" />;
      case "customer":
        return <ShoppingCart className="h-5 w-5" />;
      default:
        return <Eye className="h-5 w-5" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Live Preview Mode</h1>
          <p className="text-muted-foreground">Preview your app as different user roles with demo data</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Create Preview Session
            </CardTitle>
            <CardDescription>
              Generate a preview link to see your app as a specific role
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">View as Role</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4" />
                        Admin - Full access
                      </div>
                    </SelectItem>
                    <SelectItem value="staff">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Staff - Limited access
                      </div>
                    </SelectItem>
                    <SelectItem value="customer">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Customer - Read-only
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createPreview} disabled={creating} data-testid="button-create-preview">
                {creating ? "Creating..." : "Preview Your App"}
              </Button>
            </div>

            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-600">Preview Mode Restrictions</p>
                  <ul className="mt-1 text-muted-foreground list-disc list-inside">
                    <li>Cannot send real emails or SMS</li>
                    <li>Cannot process real payments</li>
                    <li>All data is clearly marked as &quot;Demo&quot;</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {session && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {getRoleIcon(session.role)}
                    Preview as {session.role.charAt(0).toUpperCase() + session.role.slice(1)}
                  </span>
                  <Badge variant="outline">Demo Mode</Badge>
                </CardTitle>
                <CardDescription>
                  Expires: {new Date(session.expiresAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm" data-testid="text-preview-url">
                    {window.location.origin}{session.previewUrl}
                  </code>
                  <Button variant="outline" size="icon" onClick={copyLink} data-testid="button-copy-link">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" asChild>
                    <a href={session.previewUrl} target="_blank" rel="noopener noreferrer" data-testid="link-open-preview">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
                {copied && <p className="text-sm text-green-600">Link copied to clipboard!</p>}
              </CardContent>
            </Card>

            {demoData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Demo Data Preview
                    <Badge variant="secondary">Sample Data</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-medium mb-2">Dashboard Stats</h3>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div className="rounded-lg border p-3">
                        <p className="text-sm text-muted-foreground">Total Users</p>
                        <p className="text-2xl font-bold" data-testid="stat-users">{demoData.stats.totalUsers}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-sm text-muted-foreground">Active Modules</p>
                        <p className="text-2xl font-bold" data-testid="stat-modules">{demoData.stats.activeModules}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-sm text-muted-foreground">Recent Orders</p>
                        <p className="text-2xl font-bold" data-testid="stat-orders">{demoData.stats.recentOrders}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-sm text-muted-foreground">Revenue</p>
                        <p className="text-2xl font-bold" data-testid="stat-revenue">{demoData.stats.revenue}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">Demo Users</h3>
                    <div className="space-y-2">
                      {demoData.users.map((user) => (
                        <div key={user.id} className="flex items-center justify-between rounded-lg border p-3">
                          <div className="flex items-center gap-3">
                            {getRoleIcon(user.role)}
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                          <Badge variant="outline">{user.role}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">Recent Activity</h3>
                    <div className="space-y-2">
                      {demoData.recentActivity.map((activity, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                          <p className="text-sm">{activity.message}</p>
                          <span className="text-sm text-muted-foreground">{activity.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
