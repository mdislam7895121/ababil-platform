"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth";
import { Users, DollarSign, FileText, TrendingUp, Copy, Check, ExternalLink, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

interface Reseller {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor?: string;
  domain?: string;
  subdomain?: string;
  showPoweredBy: boolean;
  commissionType: string;
  commissionValue: number;
  status: string;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
}

interface ResellerData {
  reseller: Reseller;
  customers: Customer[];
  earnings: {
    total: number;
    monthly: number;
    invoiceCount: number;
    monthlyInvoiceCount: number;
  };
  recentInvoices: Array<{
    id: string;
    amount: number;
    resellerCommission: number;
    status: string;
    paidAt: string;
    tenant: { name: string };
  }>;
}

export default function ResellerDashboardPage() {
  const { t } = useI18n();
  const { token, currentTenant } = useAuth();
  const tenantId = currentTenant?.id || "";
  
  const formatCurrency = (amount: number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  };
  const [data, setData] = useState<ResellerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      try {
        const res = await fetch("/api/resellers/my", {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-tenant-id": tenantId || "",
          },
        });
        if (!res.ok) {
          if (res.status === 404) {
            setError("You are not registered as a reseller. Contact the platform administrator.");
            setLoading(false);
            return;
          }
          throw new Error("Failed to fetch reseller data");
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, tenantId]);

  const copyReferralLink = () => {
    if (!data?.reseller) return;
    const link = data.reseller.domain
      ? `https://${data.reseller.domain}`
      : data.reseller.subdomain
      ? `https://${data.reseller.subdomain}.platformfactory.app`
      : `${window.location.origin}?ref=${data.reseller.slug}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.reseller) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">No reseller data available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { reseller, customers, earnings, recentInvoices } = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Reseller Dashboard</h1>
          <p className="text-muted-foreground">
            {reseller.name} &middot; {reseller.commissionValue}% {reseller.commissionType === "percentage" ? "commission" : "fixed"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyReferralLink} data-testid="button-copy-link">
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? "Copied!" : "Copy Referral Link"}
          </Button>
          <Button variant="outline" asChild>
            <a href={`/dashboard/reseller/branding`} data-testid="link-branding">
              <Palette className="h-4 w-4 mr-2" />
              Branding
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-earnings">
              {formatCurrency(earnings.total)}
            </div>
            <p className="text-xs text-muted-foreground">{earnings.invoiceCount} invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-monthly-earnings">
              {formatCurrency(earnings.monthly)}
            </div>
            <p className="text-xs text-muted-foreground">{earnings.monthlyInvoiceCount} invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-customer-count">
              {customers.length}
            </div>
            <p className="text-xs text-muted-foreground">Active workspaces</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge
              variant={reseller.status === "active" ? "default" : "secondary"}
              data-testid="badge-reseller-status"
            >
              {reseller.status}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              {reseller.domain ? `Domain: ${reseller.domain}` : reseller.subdomain ? `Subdomain: ${reseller.subdomain}` : `Slug: ${reseller.slug}`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
            <CardDescription>Workspaces under your reseller account</CardDescription>
          </CardHeader>
          <CardContent>
            {customers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No customers yet. Share your referral link to get started.</p>
            ) : (
              <div className="space-y-3">
                {customers.map((customer) => (
                  <div key={customer.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium" data-testid={`text-customer-name-${customer.id}`}>
                        {customer.name}
                      </p>
                      <p className="text-xs text-muted-foreground">@{customer.slug}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" data-testid={`badge-customer-plan-${customer.id}`}>
                        {customer.plan}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Commissions</CardTitle>
            <CardDescription>Latest earnings from customer payments</CardDescription>
          </CardHeader>
          <CardContent>
            {recentInvoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">No commissions earned yet.</p>
            ) : (
              <div className="space-y-3">
                {recentInvoices.slice(0, 5).map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">{invoice.tenant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(invoice.paidAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600 dark:text-green-400" data-testid={`text-commission-${invoice.id}`}>
                        +{formatCurrency(invoice.resellerCommission)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        of {formatCurrency(Number(invoice.amount))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>White-Label Branding</CardTitle>
          <CardDescription>Your customized branding settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium mb-1">Primary Color</p>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded border"
                  style={{ backgroundColor: reseller.primaryColor }}
                ></div>
                <code className="text-sm">{reseller.primaryColor}</code>
              </div>
            </div>
            {reseller.secondaryColor && (
              <div>
                <p className="text-sm font-medium mb-1">Secondary Color</p>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded border"
                    style={{ backgroundColor: reseller.secondaryColor }}
                  ></div>
                  <code className="text-sm">{reseller.secondaryColor}</code>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm font-medium mb-1">Powered By Badge</p>
              <Badge variant={reseller.showPoweredBy ? "default" : "secondary"}>
                {reseller.showPoweredBy ? "Visible" : "Hidden"}
              </Badge>
            </div>
          </div>
          {reseller.logoUrl && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Your Logo</p>
              <img
                src={reseller.logoUrl}
                alt="Reseller logo"
                className="h-12 object-contain"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
