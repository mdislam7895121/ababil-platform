"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  Users,
  CreditCard,
  TrendingUp,
  Building2,
  Loader2,
  ShieldAlert,
  Calendar,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";
import { format } from "date-fns";

interface RevenueSummary {
  activeSubscriptions: number;
  mrr: number;
  payingWorkspaces: number;
  freeWorkspaces: number;
  totalWorkspaces: number;
  freeVsPaidRatio: string;
  planBreakdown: {
    free: number;
    pro: number;
    business: number;
    proLimits: { liveApps: number; price: number };
    businessLimits: { liveApps: number; price: number };
  };
  liveAppsUsage: {
    used: number;
    limit: number;
  };
  recentPayments: Array<{
    id: string;
    date: string;
    tenantName: string;
    action: string;
    plan: string;
    amount: number;
    status: string;
    actorName: string;
  }>;
  period: string;
}

export default function RevenuePage() {
  const { token, currentRole, currentTenant } = useAuth();
  const [period, setPeriod] = useState("all");

  const isOwnerOrAdmin = currentRole === "owner" || currentRole === "admin";

  const { data: summary, isLoading, error } = useQuery<RevenueSummary>({
    queryKey: ["/api/revenue/summary", period, currentTenant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/revenue/summary?period=${period}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to fetch revenue data");
      return res.json();
    },
    enabled: !!token && !!currentTenant && isOwnerOrAdmin
  });

  if (!isOwnerOrAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12">
          <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            Only owners and admins can access the revenue dashboard.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !summary) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12">
          <XCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Failed to Load</h2>
          <p className="text-muted-foreground">Could not load revenue data.</p>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusIcon = (action: string) => {
    if (action.includes("canceled")) return <XCircle className="h-4 w-4 text-destructive" />;
    if (action.includes("created") || action.includes("checkout")) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <Clock className="h-4 w-4 text-yellow-500" />;
  };

  const getActionLabel = (action: string) => {
    if (action === "subscription.created") return "New Subscription";
    if (action === "subscription.updated") return "Plan Updated";
    if (action === "subscription.canceled") return "Canceled";
    if (action === "billing.checkout") return "Checkout Started";
    return action;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-revenue-title">Revenue Dashboard</h1>
            <p className="text-muted-foreground">Business metrics and subscription analytics</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]" data-testid="select-time-filter">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Time period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d" data-testid="option-7d">Last 7 days</SelectItem>
              <SelectItem value="30d" data-testid="option-30d">Last 30 days</SelectItem>
              <SelectItem value="all" data-testid="option-all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-active-subscriptions">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="value-active-subscriptions">
                {summary.activeSubscriptions}
              </div>
              <p className="text-xs text-muted-foreground">
                Paying customers
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-mrr">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">MRR</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="value-mrr">
                ${summary.mrr}
              </div>
              <p className="text-xs text-muted-foreground">
                Monthly Recurring Revenue
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-paying-workspaces">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Paying Workspaces</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="value-paying-workspaces">
                {summary.payingWorkspaces}
              </div>
              <p className="text-xs text-muted-foreground">
                Out of {summary.totalWorkspaces} total
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-free-vs-paid">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Free vs Paid</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="value-free-vs-paid">
                {summary.freeVsPaidRatio}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.freeWorkspaces} free, {summary.payingWorkspaces} paid
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-plan-breakdown">
            <CardHeader>
              <CardTitle>Plan Breakdown</CardTitle>
              <CardDescription>Subscriptions by plan type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">Free</Badge>
                  <span className="text-sm">$0/mo</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold" data-testid="value-free-count">
                    {summary.planBreakdown.free}
                  </span>
                  <p className="text-xs text-muted-foreground">0 live apps</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Badge className="bg-blue-500">Pro</Badge>
                  <span className="text-sm">${summary.planBreakdown.proLimits.price}/mo</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold" data-testid="value-pro-count">
                    {summary.planBreakdown.pro}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {summary.planBreakdown.proLimits.liveApps} live app each
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Badge className="bg-purple-500">Business</Badge>
                  <span className="text-sm">${summary.planBreakdown.businessLimits.price}/mo</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold" data-testid="value-business-count">
                    {summary.planBreakdown.business}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {summary.planBreakdown.businessLimits.liveApps} live apps each
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Live Apps Usage</span>
                  <span className="font-medium">
                    {summary.liveAppsUsage.used} / {summary.liveAppsUsage.limit} used
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-recent-activity">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest billing events</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.recentPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No billing activity yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Workspace</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.recentPayments.slice(0, 10).map((payment) => (
                        <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(payment.date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="font-medium">
                            {payment.tenantName}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(payment.action)}
                              <span className="text-sm">{getActionLabel(payment.action)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{payment.plan}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${payment.amount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
