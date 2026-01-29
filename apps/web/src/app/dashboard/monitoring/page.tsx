"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw, Play, Loader2, Server, Globe, Workflow } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";

interface Incident {
  id: string;
  type: string;
  severity: string;
  message: string;
  details: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

interface MonitoringStatus {
  overallStatus: "green" | "yellow" | "red";
  lastChecks: Record<string, { time: string | null; status: string | null }>;
  activeIncidentsCount: number;
  activeIncidents: Incident[];
}

interface JobRun {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export default function MonitoringPage() {
  const { token, currentTenant } = useAuth();
  const { toast } = useToast();
  const [incidentFilter, setIncidentFilter] = useState<string>("all");

  const { data: status, refetch: refetchStatus, isLoading: statusLoading } = useQuery<MonitoringStatus>({
    queryKey: ["/api/monitoring/status", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/monitoring/status", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    enabled: !!token && !!currentTenant,
    refetchInterval: 30000
  });

  const { data: incidents, refetch: refetchIncidents } = useQuery<{ incidents: Incident[] }>({
    queryKey: ["/api/monitoring/incidents", currentTenant?.id, incidentFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (incidentFilter === "active") params.set("resolved", "false");
      if (incidentFilter === "resolved") params.set("resolved", "true");
      
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

  const { data: jobRuns, refetch: refetchJobs } = useQuery<{ jobRuns: JobRun[] }>({
    queryKey: ["/api/monitoring/job-runs", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/monitoring/job-runs?limit=20", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to fetch job runs");
      return res.json();
    },
    enabled: !!token && !!currentTenant
  });

  const runCheck = useMutation({
    mutationFn: async (check: string) => {
      const res = await fetch("/api/monitoring/run-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        },
        body: JSON.stringify({ check })
      });
      if (!res.ok) throw new Error("Failed to run check");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Check Passed" : "Check Failed",
        description: data.details?.message || `${data.check} check completed`,
        variant: data.success ? "default" : "destructive"
      });
      refetchStatus();
      refetchJobs();
      refetchIncidents();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  function getStatusColor(statusValue: string): string {
    switch (statusValue) {
      case "green": return "bg-green-500";
      case "yellow": return "bg-yellow-500";
      case "red": return "bg-red-500";
      default: return "bg-gray-500";
    }
  }

  function getSeverityBadge(severity: string) {
    switch (severity) {
      case "high":
        return <Badge variant="destructive" data-testid="badge-severity-high">High</Badge>;
      case "medium":
        return <Badge className="bg-yellow-500" data-testid="badge-severity-medium">Medium</Badge>;
      case "low":
        return <Badge variant="secondary" data-testid="badge-severity-low">Low</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-severity-unknown">{severity}</Badge>;
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
        <div className="flex items-center justify-center min-h-[400px]" data-testid="loading-spinner">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Monitoring</h1>
            <p className="text-muted-foreground">System health, incidents, and monitoring checks</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchStatus(); refetchIncidents(); refetchJobs(); }} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          <Card data-testid="card-overall-status">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full ${getStatusColor(status?.overallStatus || "gray")}`} data-testid="indicator-status" />
                <span className="text-2xl font-bold capitalize" data-testid="text-status">
                  {statusLoading ? "Loading..." : status?.overallStatus || "Unknown"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-active-incidents">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${(status?.activeIncidentsCount || 0) > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                <span className="text-2xl font-bold" data-testid="text-incident-count">
                  {status?.activeIncidentsCount || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-api-health">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">API Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {status?.lastChecks?.checkApiHealth?.status === "success" ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : status?.lastChecks?.checkApiHealth?.status === "failed" ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="text-sm" data-testid="text-api-health">
                  {status?.lastChecks?.checkApiHealth?.time
                    ? formatDistanceToNow(new Date(status.lastChecks.checkApiHealth.time), { addSuffix: true })
                    : "Never"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-web-health">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Web Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {status?.lastChecks?.checkWebHealth?.status === "success" ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : status?.lastChecks?.checkWebHealth?.status === "failed" ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="text-sm" data-testid="text-web-health">
                  {status?.lastChecks?.checkWebHealth?.time
                    ? formatDistanceToNow(new Date(status.lastChecks.checkWebHealth.time), { addSuffix: true })
                    : "Never"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-run-checks">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              Run Checks Manually
            </CardTitle>
            <CardDescription>Trigger health checks on demand</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => runCheck.mutate("api")} disabled={runCheck.isPending} variant="outline" data-testid="button-check-api">
                {runCheck.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
                Check API
              </Button>
              <Button onClick={() => runCheck.mutate("web")} disabled={runCheck.isPending} variant="outline" data-testid="button-check-web">
                {runCheck.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                Check Web
              </Button>
              <Button onClick={() => runCheck.mutate("golden")} disabled={runCheck.isPending} variant="outline" data-testid="button-check-golden">
                {runCheck.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Workflow className="w-4 h-4 mr-2" />}
                Check Golden Flows
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="incidents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="incidents" data-testid="tab-incidents">Incidents</TabsTrigger>
            <TabsTrigger value="job-runs" data-testid="tab-job-runs">Job Runs</TabsTrigger>
          </TabsList>

          <TabsContent value="incidents" className="space-y-4">
            <div className="flex items-center gap-4">
              <Select value={incidentFilter} onValueChange={setIncidentFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-incident-filter">
                  <SelectValue placeholder="Filter incidents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Incidents</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="resolved">Resolved Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {incidents?.incidents && incidents.incidents.length > 0 ? (
                incidents.incidents.map((incident) => (
                  <Card key={incident.id} className={incident.resolvedAt ? "opacity-60" : ""} data-testid={`card-incident-${incident.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {getTypeIcon(incident.type)}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {getSeverityBadge(incident.severity)}
                              <Badge variant="outline">{incident.type.replace(/_/g, " ")}</Badge>
                              {incident.resolvedAt && <Badge variant="secondary">Resolved</Badge>}
                            </div>
                            <p className="font-medium" data-testid={`text-incident-message-${incident.id}`}>{incident.message}</p>
                            <p className="text-sm text-muted-foreground">
                              First seen: {format(new Date(incident.firstSeenAt), "MMM d, h:mm a")}
                              {incident.resolvedAt && ` • Resolved: ${format(new Date(incident.resolvedAt), "MMM d, h:mm a")}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                    <p>No incidents found</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="job-runs" className="space-y-4">
            <div className="space-y-2">
              {jobRuns?.jobRuns && jobRuns.jobRuns.length > 0 ? (
                jobRuns.jobRuns.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`row-job-${job.id}`}>
                    <div className="flex items-center gap-3">
                      {job.status === "success" ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">{job.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(job.createdAt), "MMM d, h:mm:ss a")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={job.status === "success" ? "default" : "destructive"}>
                      {job.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Activity className="w-12 h-12 mx-auto mb-4" />
                    <p>No job runs found</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
