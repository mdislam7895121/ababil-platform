"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Server, Globe, Workflow, Loader2, ArrowLeft } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface Incident {
  id: string;
  type: string;
  severity: string;
  message: string;
  details: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  alertSentAt: string | null;
  createdAt: string;
}

export default function IncidentsHistoryPage() {
  const { token, currentTenant } = useAuth();
  const [filter, setFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, refetch, isLoading } = useQuery<{ incidents: Incident[] }>({
    queryKey: ["/api/monitoring/incidents", currentTenant?.id, filter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (filter === "active") params.set("resolved", "false");
      if (filter === "resolved") params.set("resolved", "true");
      if (typeFilter !== "all") params.set("type", typeFilter);
      
      const res = await fetch(`/api/monitoring/incidents?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to fetch incidents");
      return res.json();
    },
    enabled: !!token && !!currentTenant
  });

  function getSeverityBadge(severity: string) {
    switch (severity) {
      case "high":
        return <Badge variant="destructive" data-testid="badge-severity-high">High</Badge>;
      case "medium":
        return <Badge className="bg-yellow-500 text-white" data-testid="badge-severity-medium">Medium</Badge>;
      case "low":
        return <Badge variant="secondary" data-testid="badge-severity-low">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case "api_down": return <Server className="w-4 h-4" />;
      case "web_down": return <Globe className="w-4 h-4" />;
      case "golden_flow_failed": return <Workflow className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  }

  if (!currentTenant) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/monitoring">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Incident History</h1>
              <p className="text-muted-foreground">View and filter all incidents</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Incidents</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="resolved">Resolved Only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-type-filter">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="api_down">API Down</SelectItem>
              <SelectItem value="web_down">Web Down</SelectItem>
              <SelectItem value="golden_flow_failed">Golden Flow Failed</SelectItem>
            </SelectContent>
          </Select>

          <div className="text-sm text-muted-foreground">
            {data?.incidents?.length || 0} incidents found
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : data?.incidents && data.incidents.length > 0 ? (
          <div className="space-y-3">
            {data.incidents.map((incident) => (
              <Card
                key={incident.id}
                className={incident.resolvedAt ? "opacity-70" : ""}
                data-testid={`card-incident-${incident.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        {getTypeIcon(incident.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {getSeverityBadge(incident.severity)}
                          <Badge variant="outline">{incident.type.replace(/_/g, " ")}</Badge>
                          {incident.resolvedAt ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Resolved
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <Clock className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium mb-1" data-testid={`text-incident-message-${incident.id}`}>
                          {incident.message}
                        </p>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>First seen: {format(new Date(incident.firstSeenAt), "MMM d, yyyy h:mm:ss a")}</p>
                          <p>Last seen: {format(new Date(incident.lastSeenAt), "MMM d, yyyy h:mm:ss a")}</p>
                          {incident.resolvedAt && (
                            <p className="text-green-600 dark:text-green-400">
                              Resolved: {format(new Date(incident.resolvedAt), "MMM d, yyyy h:mm:ss a")}
                              {" "}({formatDistanceToNow(new Date(incident.resolvedAt), { addSuffix: true })})
                            </p>
                          )}
                          {incident.alertSentAt && (
                            <p>Alert sent: {format(new Date(incident.alertSentAt), "MMM d, yyyy h:mm:ss a")}</p>
                          )}
                        </div>
                        {incident.details && Object.keys(incident.details).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-sm text-muted-foreground cursor-pointer hover:underline">
                              View details
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(incident.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-medium mb-2">No Incidents Found</h3>
              <p>No incidents match your current filters.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
