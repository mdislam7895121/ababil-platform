"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { 
  Shield, FileText, Download, Users, Key, AlertTriangle, 
  Settings, Clock, FileCheck, RefreshCw, CheckCircle, XCircle 
} from "lucide-react";

export default function CompliancePage() {
  const { token, currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [exportType, setExportType] = useState("audit");
  const [exportFormat, setExportFormat] = useState("json");
  const [legalData, setLegalData] = useState({
    docType: "terms",
    companyName: "",
    country: "",
    supportEmail: "",
    billingModel: "subscription",
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    "x-tenant-id": tenantId || "",
    "Content-Type": "application/json",
  };

  const { data: securitySettings } = useQuery({
    queryKey: ["security-settings", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/security-center/settings", { headers });
      return res.json();
    },
    enabled: !!token && !!tenantId,
  });

  const { data: permissionsMatrix } = useQuery({
    queryKey: ["permissions-matrix", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/security-center/permissions-matrix", { headers });
      return res.json();
    },
    enabled: !!token && !!tenantId,
  });

  const { data: accessReview } = useQuery({
    queryKey: ["access-review", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/access-review/summary", { headers });
      return res.json();
    },
    enabled: !!token && !!tenantId,
  });

  const { data: slaReport } = useQuery({
    queryKey: ["sla-report", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/reports/sla", { headers });
      return res.json();
    },
    enabled: !!token && !!tenantId,
  });

  const { data: evidenceExports, refetch: refetchExports } = useQuery({
    queryKey: ["evidence-exports", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/evidence/exports", { headers });
      return res.json();
    },
    enabled: !!token && !!tenantId,
  });

  const { data: legalTemplates } = useQuery({
    queryKey: ["legal-templates", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/legal/templates", { headers });
      return res.json();
    },
    enabled: !!token && !!tenantId,
  });

  const updateSecurityMutation = useMutation({
    mutationFn: async (settings: any) => {
      const res = await fetch("/api/security-center/settings", {
        method: "POST",
        headers,
        body: JSON.stringify(settings),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Security settings updated" });
      queryClient.invalidateQueries({ queryKey: ["security-settings"] });
    },
  });

  const createExportMutation = useMutation({
    mutationFn: async ({ type, format }: { type: string; format: string }) => {
      const res = await fetch("/api/evidence/exports", {
        method: "POST",
        headers,
        body: JSON.stringify({ type, format }),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Export job created", description: "Your export is being processed" });
      setTimeout(() => refetchExports(), 2000);
    },
  });

  const generateLegalDocMutation = useMutation({
    mutationFn: async (data: typeof legalData) => {
      const res = await fetch("/api/legal/generate", {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Legal document generated" });
      if (data.html) {
        const blob = new Blob([data.html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.docType || "document"}.html`;
        a.click();
      }
    },
  });

  const settings = securitySettings?.settings;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Enterprise Compliance</h1>
          <p className="text-muted-foreground">Security settings, access reviews, and compliance exports</p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Shield className="h-4 w-4 mr-1" />
          Trust Pack
        </Badge>
      </div>

      <Tabs defaultValue="security" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="security" data-testid="tab-security">
            <Settings className="h-4 w-4 mr-1" />
            Security
          </TabsTrigger>
          <TabsTrigger value="access" data-testid="tab-access">
            <Users className="h-4 w-4 mr-1" />
            Access
          </TabsTrigger>
          <TabsTrigger value="evidence" data-testid="tab-evidence">
            <FileCheck className="h-4 w-4 mr-1" />
            Evidence
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <Clock className="h-4 w-4 mr-1" />
            SLA
          </TabsTrigger>
          <TabsTrigger value="legal" data-testid="tab-legal">
            <FileText className="h-4 w-4 mr-1" />
            Legal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Configure data retention and security policies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Data Retention Period</Label>
                  <p className="text-sm text-muted-foreground">How long to keep audit logs and data</p>
                </div>
                <Select
                  value={String(settings?.dataRetentionDays || 90)}
                  onValueChange={(v) => updateSecurityMutation.mutate({ dataRetentionDays: parseInt(v) })}
                >
                  <SelectTrigger className="w-40" data-testid="select-retention">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">365 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>PII Redaction</Label>
                  <p className="text-sm text-muted-foreground">Automatically redact sensitive data in exports</p>
                </div>
                <Switch
                  checked={settings?.piiRedactionEnabled ?? true}
                  onCheckedChange={(v) => updateSecurityMutation.mutate({ piiRedactionEnabled: v })}
                  data-testid="switch-pii-redaction"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Require 2FA for Admins</Label>
                  <p className="text-sm text-muted-foreground">Enforce two-factor authentication for admin users</p>
                </div>
                <Switch
                  checked={settings?.require2faForAdmins ?? false}
                  onCheckedChange={(v) => updateSecurityMutation.mutate({ require2faForAdmins: v })}
                  data-testid="switch-2fa"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Permissions Matrix</CardTitle>
              <CardDescription>Role-based access control overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Capability</th>
                      {permissionsMatrix?.matrix?.roles?.map((role: string) => (
                        <th key={role} className="text-center py-2 px-3 capitalize">{role}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissionsMatrix?.matrix?.capabilities?.map((cap: any, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 px-3">{cap.name}</td>
                        {permissionsMatrix?.matrix?.roles?.map((role: string) => (
                          <td key={role} className="text-center py-2 px-3">
                            {cap[role] ? (
                              <CheckCircle className="h-4 w-4 text-green-500 inline" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground inline" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl">{accessReview?.summary?.usersCount || 0}</CardTitle>
                <CardDescription>Total Users</CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl">{accessReview?.summary?.dormantUsersCount || 0}</CardTitle>
                <CardDescription>Dormant Users (30d)</CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl">{accessReview?.summary?.apiKeysTotal || 0}</CardTitle>
                <CardDescription>API Keys</CardDescription>
              </CardHeader>
            </Card>
          </div>

          {accessReview?.recommendations?.length > 0 && (
            <Card className="border-yellow-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {accessReview.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-yellow-500">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>API Keys Overview</CardTitle>
              <CardDescription>
                {accessReview?.summary?.apiKeysOlderThan90d || 0} keys older than 90 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accessReview?.apiKeys?.length > 0 ? (
                <div className="space-y-2">
                  {accessReview.apiKeys.map((key: any) => (
                    <div key={key.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        <span>{key.name}</span>
                        {key.isOld && <Badge variant="secondary">Old</Badge>}
                        {key.isExpired && <Badge variant="destructive">Expired</Badge>}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        Created: {new Date(key.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No API keys found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Evidence Export</CardTitle>
              <CardDescription>Generate audit-ready exports for compliance reviews</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-48">
                  <Label>Export Type</Label>
                  <Select value={exportType} onValueChange={setExportType}>
                    <SelectTrigger data-testid="select-export-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="audit">Audit Logs</SelectItem>
                      <SelectItem value="support">Support Tickets</SelectItem>
                      <SelectItem value="incidents">Incidents</SelectItem>
                      <SelectItem value="access_review">Access Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-48">
                  <Label>Format</Label>
                  <Select value={exportFormat} onValueChange={setExportFormat}>
                    <SelectTrigger data-testid="select-export-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => createExportMutation.mutate({ type: exportType, format: exportFormat })}
                    disabled={createExportMutation.isPending}
                    data-testid="button-create-export"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {createExportMutation.isPending ? "Creating..." : "Create Export"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Recent Exports
                <Button variant="ghost" size="icon" onClick={() => refetchExports()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {evidenceExports?.exports?.length > 0 ? (
                <div className="space-y-2">
                  {evidenceExports.exports.slice(0, 10).map((exp: any) => (
                    <div key={exp.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3">
                        <FileCheck className="h-5 w-5" />
                        <div>
                          <p className="font-medium capitalize">{exp.type} Export</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(exp.createdAt).toLocaleString()} • {exp.format.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={exp.status === "ready" ? "default" : exp.status === "failed" ? "destructive" : "secondary"}>
                          {exp.status}
                        </Badge>
                        {exp.status === "ready" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/api/evidence/exports/${exp.id}/download`, "_blank")}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No exports yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Support Ticket Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-bold">{slaReport?.ticketMetrics?.created || 0}</p>
                    <p className="text-sm text-muted-foreground">Tickets Created</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{slaReport?.ticketMetrics?.solved || 0}</p>
                    <p className="text-sm text-muted-foreground">Tickets Solved</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{slaReport?.ticketMetrics?.avgFirstResponseMins || 0}m</p>
                    <p className="text-sm text-muted-foreground">Avg First Response</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{slaReport?.ticketMetrics?.slaBreaches || 0}</p>
                    <p className="text-sm text-muted-foreground">SLA Breaches</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Incident Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-bold">{slaReport?.incidentMetrics?.count || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Incidents</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{slaReport?.incidentMetrics?.criticalCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Critical Incidents</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-3xl font-bold">{slaReport?.incidentMetrics?.avgTimeToResolveMins || 0}m</p>
                    <p className="text-sm text-muted-foreground">Avg Time to Resolve</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="legal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generate Legal Documents</CardTitle>
              <CardDescription>Auto-generate Terms of Service, Privacy Policy, and Refund Policy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Document Type</Label>
                  <Select
                    value={legalData.docType}
                    onValueChange={(v) => setLegalData({ ...legalData, docType: v })}
                  >
                    <SelectTrigger data-testid="select-doc-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {legalTemplates?.templates?.map((t: any) => (
                        <SelectItem key={t.type} value={t.type}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={legalData.companyName}
                    onChange={(e) => setLegalData({ ...legalData, companyName: e.target.value })}
                    placeholder="ACME Corporation"
                    data-testid="input-company-name"
                  />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input
                    value={legalData.country}
                    onChange={(e) => setLegalData({ ...legalData, country: e.target.value })}
                    placeholder="United States"
                    data-testid="input-country"
                  />
                </div>
                <div>
                  <Label>Support Email</Label>
                  <Input
                    type="email"
                    value={legalData.supportEmail}
                    onChange={(e) => setLegalData({ ...legalData, supportEmail: e.target.value })}
                    placeholder="support@acme.com"
                    data-testid="input-support-email"
                  />
                </div>
                <div>
                  <Label>Billing Model</Label>
                  <Select
                    value={legalData.billingModel}
                    onValueChange={(v) => setLegalData({ ...legalData, billingModel: v })}
                  >
                    <SelectTrigger data-testid="select-billing-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="subscription">Subscription</SelectItem>
                      <SelectItem value="one-time">One-time</SelectItem>
                      <SelectItem value="usage-based">Usage-based</SelectItem>
                      <SelectItem value="freemium">Freemium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={() => generateLegalDocMutation.mutate(legalData)}
                disabled={!legalData.companyName || !legalData.country || !legalData.supportEmail || generateLegalDocMutation.isPending}
                data-testid="button-generate-legal"
              >
                <FileText className="h-4 w-4 mr-2" />
                {generateLegalDocMutation.isPending ? "Generating..." : "Generate & Download"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
