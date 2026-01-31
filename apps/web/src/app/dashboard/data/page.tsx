"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Download, HardDrive, AlertTriangle, RotateCcw, Trash2, Shield, Clock, FileArchive, Database, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ExportJob {
  id: string;
  status: "pending" | "processing" | "ready" | "failed" | "expired";
  format: string;
  fileSize: number | null;
  expiresAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface BackupSnapshot {
  id: string;
  type: "manual" | "scheduled";
  counts: Record<string, number>;
  createdAt: string;
}

interface TenantStatus {
  id: string;
  name: string;
  status: "active" | "deleted" | "expired";
  deletedAt: string | null;
  restoreDeadline: string | null;
  retentionDays: number;
}

export default function DataManagementPage() {
  const { token, currentTenant } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteStep, setDeleteStep] = useState<"idle" | "requested">("idle");
  const [confirmToken, setConfirmToken] = useState("");
  const [confirmInput, setConfirmInput] = useState("");

  const { data: exports, refetch: refetchExports } = useQuery<{ exports: ExportJob[] }>({
    queryKey: ["/api/exports/tenant", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/exports/tenant", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) return { exports: [] };
      return res.json();
    },
    enabled: !!token && !!currentTenant
  });

  const { data: snapshots, refetch: refetchSnapshots } = useQuery<{ snapshots: BackupSnapshot[] }>({
    queryKey: ["/api/backups/snapshots", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/backups/snapshots", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) return { snapshots: [] };
      return res.json();
    },
    enabled: !!token && !!currentTenant
  });

  const { data: tenantStatus, refetch: refetchStatus } = useQuery<TenantStatus>({
    queryKey: ["/api/tenants/status", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${currentTenant?.id}/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    enabled: !!token && !!currentTenant
  });

  const startExport = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/exports/tenant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to start export");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Export started", description: "Your data export is being prepared." });
      setTimeout(() => refetchExports(), 3000);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const createSnapshot = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/backups/snapshot", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to create snapshot");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Snapshot created", description: "Backup snapshot saved." });
      refetchSnapshots();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const requestDelete = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${currentTenant?.id}/request-delete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to request delete");
      return res.json();
    },
    onSuccess: (data) => {
      setConfirmToken(data.confirmationToken);
      setDeleteStep("requested");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const confirmDelete = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${currentTenant?.id}/confirm-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        },
        body: JSON.stringify({ confirmationToken: confirmInput })
      });
      if (!res.ok) throw new Error("Failed to delete workspace");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Workspace deleted", description: "You can restore within 30 days." });
      setDeleteStep("idle");
      setConfirmToken("");
      setConfirmInput("");
      refetchStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const restoreWorkspace = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${currentTenant?.id}/restore`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to restore workspace");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Workspace restored", description: "Your workspace is now active." });
      refetchStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "ready":
        return <Badge data-testid="badge-status-ready" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Ready</Badge>;
      case "pending":
      case "processing":
        return <Badge data-testid="badge-status-processing" variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing</Badge>;
      case "failed":
        return <Badge data-testid="badge-status-failed" variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "expired":
        return <Badge data-testid="badge-status-expired" variant="outline"><Clock className="w-3 h-3 mr-1" /> Expired</Badge>;
      default:
        return <Badge data-testid="badge-status-unknown" variant="outline">{status}</Badge>;
    }
  }

  function downloadExport(exportId: string) {
    const url = `/api/exports/tenant/${exportId}/download`;
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "");
    document.body.appendChild(link);
    
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-tenant-id": currentTenant?.id || ""
      }
    })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        link.href = blobUrl;
        link.click();
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast({ title: "Download failed", variant: "destructive" }));
    
    document.body.removeChild(link);
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
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Management</h1>
            <p className="text-muted-foreground">Export data, manage backups, and control your workspace</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchExports(); refetchSnapshots(); refetchStatus(); }} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {tenantStatus?.status === "deleted" && (
          <Card className="border-yellow-500 bg-yellow-500/10" data-testid="card-deleted-warning">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="w-5 h-5" />
                Workspace Deleted
              </CardTitle>
              <CardDescription>
                Your workspace was deleted on {tenantStatus.deletedAt ? format(new Date(tenantStatus.deletedAt), "PPp") : "Unknown"}.
                You can restore it until {tenantStatus.restoreDeadline ? format(new Date(tenantStatus.restoreDeadline), "PPp") : "Unknown"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => restoreWorkspace.mutate()} disabled={restoreWorkspace.isPending} data-testid="button-restore">
                {restoreWorkspace.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                Restore Workspace
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card data-testid="card-export">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileArchive className="w-5 h-5" />
                Data Export
              </CardTitle>
              <CardDescription>
                Export all your workspace data as a ZIP file. Includes users, settings, billing, and audit logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => startExport.mutate()} disabled={startExport.isPending || tenantStatus?.status === "deleted"} data-testid="button-start-export">
                {startExport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Start Export
              </Button>

              {exports?.exports && exports.exports.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Recent Exports</h4>
                  {exports.exports.slice(0, 5).map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`row-export-${exp.id}`}>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(exp.status)}
                        <div>
                          <p className="text-sm">{format(new Date(exp.createdAt), "MMM d, h:mm a")}</p>
                          {exp.fileSize && <p className="text-xs text-muted-foreground">{formatBytes(exp.fileSize)}</p>}
                        </div>
                      </div>
                      {exp.status === "ready" && (
                        <Button variant="outline" size="sm" onClick={() => downloadExport(exp.id)} data-testid={`button-download-${exp.id}`}>
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-backup">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Backup Snapshots
              </CardTitle>
              <CardDescription>
                Create snapshots to track your workspace state. Useful for record-keeping.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => createSnapshot.mutate()} disabled={createSnapshot.isPending || tenantStatus?.status === "deleted"} data-testid="button-create-snapshot">
                {createSnapshot.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <HardDrive className="w-4 h-4 mr-2" />}
                Create Snapshot
              </Button>

              {snapshots?.snapshots && snapshots.snapshots.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Recent Snapshots</h4>
                  {snapshots.snapshots.slice(0, 5).map((snap) => (
                    <div key={snap.id} className="p-3 bg-muted/50 rounded-lg" data-testid={`row-snapshot-${snap.id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={snap.type === "manual" ? "default" : "secondary"} data-testid={`badge-snapshot-type-${snap.id}`}>
                          {snap.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(snap.createdAt), "MMM d, h:mm a")}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>Users: {snap.counts.users || 0}</span>
                        <span>Blueprints: {snap.counts.blueprints || 0}</span>
                        <span>Audit: {snap.counts.auditLogs || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {tenantStatus?.status !== "deleted" && (
          <Card className="border-destructive/50" data-testid="card-danger-zone">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Shield className="w-5 h-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Permanently delete your workspace. This action requires confirmation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {deleteStep === "idle" && (
                <Button variant="destructive" onClick={() => requestDelete.mutate()} disabled={requestDelete.isPending} data-testid="button-request-delete">
                  {requestDelete.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete Workspace
                </Button>
              )}

              {deleteStep === "requested" && (
                <div className="space-y-4 p-4 border border-destructive rounded-lg" data-testid="container-confirm-delete">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Confirm Deletion</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your data will be retained for 30 days. You can restore during this period.
                    To confirm, paste the confirmation token below:
                  </p>
                  <div className="p-2 bg-muted rounded font-mono text-xs break-all" data-testid="text-confirm-token">
                    {confirmToken}
                  </div>
                  <Input
                    placeholder="Paste confirmation token"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    data-testid="input-confirm-token"
                  />
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={() => confirmDelete.mutate()} disabled={confirmDelete.isPending || !confirmInput} data-testid="button-confirm-delete">
                      {confirmDelete.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Confirm Delete
                    </Button>
                    <Button variant="outline" onClick={() => { setDeleteStep("idle"); setConfirmToken(""); setConfirmInput(""); }} data-testid="button-cancel-delete">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                <Clock className="w-3 h-3 inline mr-1" />
                Deleted workspaces are retained for {tenantStatus?.retentionDays || 30} days before permanent removal.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
