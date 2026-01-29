"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth";
import { Plus, Users, DollarSign, TrendingUp, Building2, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Reseller {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
  domain?: string;
  subdomain?: string;
  commissionType: string;
  commissionValue: number;
  status: string;
  createdAt: string;
  owner?: { id: string; name: string; email: string };
  _count?: { tenants: number; invoices: number };
}

interface PlatformSummary {
  summary: {
    totalResellers: number;
    activeResellers: number;
    totalTenants: number;
    totalRevenue: number;
    totalCommissions: number;
    platformRevenue: number;
  };
  resellers: Array<{
    id: string;
    name: string;
    customerCount: number;
    totalRevenue: number;
    totalCommission: number;
    status: string;
  }>;
}

export default function ResellersManagementPage() {
  const { t } = useI18n();
  const { token, currentTenant } = useAuth();
  const tenantId = currentTenant?.id || "";
  
  const formatCurrency = (amount: number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  };
  const { toast } = useToast();

  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    commissionType: "percentage",
    commissionValue: "20",
    domain: "",
    subdomain: "",
    primaryColor: "#3B82F6",
  });

  const fetchData = async () => {
    if (!token) return;
    try {
      const [resellersRes, summaryRes] = await Promise.all([
        fetch("/api/resellers", {
          headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId || "" },
        }),
        fetch("/api/resellers/platform/summary", {
          headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId || "" },
        }),
      ]);

      if (resellersRes.ok) {
        const data = await resellersRes.json();
        setResellers(data.resellers || []);
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }
    } catch (err) {
      console.error("Failed to fetch resellers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, tenantId]);

  const handleCreate = async () => {
    if (!formData.name || !formData.slug) {
      toast({ title: "Error", description: "Name and slug are required", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/resellers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId || "",
        },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
          commissionType: formData.commissionType,
          commissionValue: parseFloat(formData.commissionValue),
          domain: formData.domain || undefined,
          subdomain: formData.subdomain || undefined,
          primaryColor: formData.primaryColor,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create reseller");
      }

      toast({ title: "Success", description: "Reseller created successfully" });
      setShowCreateDialog(false);
      setFormData({
        name: "",
        slug: "",
        commissionType: "percentage",
        commissionValue: "20",
        domain: "",
        subdomain: "",
        primaryColor: "#3B82F6",
      });
      fetchData();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create reseller",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Reseller Management</h1>
          <p className="text-muted-foreground">Manage white-label partners and track commissions</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-reseller">
              <Plus className="h-4 w-4 mr-2" />
              Add Reseller
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Reseller</DialogTitle>
              <DialogDescription>Add a new white-label partner to your platform</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Reseller Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Acme Solutions"
                  data-testid="input-reseller-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL-friendly)</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  placeholder="acme-solutions"
                  data-testid="input-reseller-slug"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commissionType">Commission Type</Label>
                  <Select
                    value={formData.commissionType}
                    onValueChange={(value) => setFormData({ ...formData, commissionType: value })}
                  >
                    <SelectTrigger id="commissionType" data-testid="select-commission-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionValue">
                    {formData.commissionType === "percentage" ? "Commission %" : "Fixed Amount"}
                  </Label>
                  <Input
                    id="commissionValue"
                    type="number"
                    value={formData.commissionValue}
                    onChange={(e) => setFormData({ ...formData, commissionValue: e.target.value })}
                    min="0"
                    max={formData.commissionType === "percentage" ? "100" : undefined}
                    data-testid="input-commission-value"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Custom Domain (optional)</Label>
                <Input
                  id="domain"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  placeholder="platform.acme.com"
                  data-testid="input-domain"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subdomain">Subdomain (optional)</Label>
                <Input
                  id="subdomain"
                  value={formData.subdomain}
                  onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                  placeholder="acme"
                />
                <p className="text-xs text-muted-foreground">
                  Will be accessible at {formData.subdomain || "subdomain"}.platformfactory.app
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Primary Brand Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    className="w-14 h-10 p-1"
                    data-testid="input-primary-color"
                  />
                  <Input
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    placeholder="#3B82F6"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating} data-testid="button-confirm-create">
                {creating ? "Creating..." : "Create Reseller"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Total Resellers</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-resellers">
                {summary.summary.totalResellers}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.summary.activeResellers} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-customers">
                {summary.summary.totalTenants}
              </div>
              <p className="text-xs text-muted-foreground">Via resellers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Commissions Paid</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-commissions">
                {formatCurrency(summary.summary.totalCommissions)}
              </div>
              <p className="text-xs text-muted-foreground">To resellers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Platform Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-platform-revenue">
                {formatCurrency(summary.summary.platformRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">After commissions</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resellers</CardTitle>
          <CardDescription>All white-label partners on your platform</CardDescription>
        </CardHeader>
        <CardContent>
          {resellers.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No resellers yet. Click "Add Reseller" to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {resellers.map((reseller) => (
                <div
                  key={reseller.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover-elevate"
                  data-testid={`reseller-card-${reseller.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: reseller.primaryColor }}
                    >
                      {reseller.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium" data-testid={`text-reseller-name-${reseller.id}`}>
                        {reseller.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        @{reseller.slug} &middot; {reseller.commissionValue}%{" "}
                        {reseller.commissionType === "percentage" ? "commission" : "fixed"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {reseller._count?.tenants || 0} customers
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {reseller.domain || reseller.subdomain ? "Custom domain" : "Default"}
                      </p>
                    </div>
                    <Badge
                      variant={reseller.status === "active" ? "default" : "secondary"}
                      data-testid={`badge-status-${reseller.id}`}
                    >
                      {reseller.status}
                    </Badge>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={`/dashboard/resellers/${reseller.id}`}>
                        <Settings className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
