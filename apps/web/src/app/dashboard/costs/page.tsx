"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Server, Database, Mail, Bot, CreditCard, AlertCircle } from "lucide-react";

interface CostBreakdown {
  category: string;
  label: string;
  paidTo: string;
  estimate: { min: number; max: number; note: string };
  required: boolean;
  enabled?: boolean;
}

interface CostData {
  breakdown: CostBreakdown[];
  summary: {
    totalMin: number;
    totalMax: number;
    currency: string;
    period: string;
    note: string;
  };
  context: {
    plan: string;
    provider: string;
    enabledModules: string[];
    hasAI: boolean;
  };
}

export default function CostsPage() {
  const { token, currentTenant } = useAuth();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCosts = async () => {
      if (!token || !currentTenant) return;
      try {
        const res = await fetch("/api/costs", {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-tenant-id": currentTenant.id,
          },
        });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch costs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCosts();
  }, [token, currentTenant]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "hosting":
        return <Server className="h-5 w-5" />;
      case "database":
        return <Database className="h-5 w-5" />;
      case "email":
        return <Mail className="h-5 w-5" />;
      case "ai":
        return <Bot className="h-5 w-5" />;
      case "platform":
        return <CreditCard className="h-5 w-5" />;
      default:
        return <DollarSign className="h-5 w-5" />;
    }
  };

  const formatRange = (min: number, max: number) => {
    if (min === 0 && max === 0) return "Free";
    if (min === max) return `$${min}/mo`;
    return `$${min} - $${max}/mo`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Estimated Monthly Costs</h1>
          <p className="text-muted-foreground">Understand your running costs before and after deployment</p>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">Loading cost estimates...</CardContent>
          </Card>
        ) : data ? (
          <>
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Total Estimated Cost
                </CardTitle>
                <CardDescription>Based on your current configuration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-4xl font-bold" data-testid="text-total-cost">
                    {formatRange(data.summary.totalMin, data.summary.totalMax)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{data.summary.note}</p>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Badge variant="outline">Plan: {data.context.plan}</Badge>
                  <Badge variant="outline">Provider: {data.context.provider}</Badge>
                  {data.context.hasAI && <Badge variant="secondary">AI Enabled</Badge>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown</CardTitle>
                <CardDescription>Where your money goes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.breakdown.map((item) => (
                    <div
                      key={item.category}
                      className={`flex items-start gap-4 rounded-lg border p-4 ${
                        item.required || item.enabled
                          ? "border-border"
                          : "border-dashed border-muted-foreground/30 opacity-60"
                      }`}
                      data-testid={`cost-item-${item.category}`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{item.label}</h3>
                          {item.required ? (
                            <Badge variant="default" className="text-xs">Required</Badge>
                          ) : item.enabled ? (
                            <Badge variant="secondary" className="text-xs">Enabled</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Optional</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">Paid to: {item.paidTo}</p>
                        <p className="mt-1 text-lg font-semibold" data-testid={`cost-value-${item.category}`}>
                          {formatRange(item.estimate.min, item.estimate.max)}
                        </p>
                        <p className="text-sm text-muted-foreground">{item.estimate.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-500/50">
              <CardContent className="flex items-start gap-3 pt-6">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-600">Important Notes</p>
                  <ul className="mt-1 text-muted-foreground list-disc list-inside space-y-1">
                    <li>Most services offer free tiers that may cover basic usage</li>
                    <li>Actual costs depend on your usage patterns</li>
                    <li>You pay providers directly - we don&apos;t markup third-party costs</li>
                    <li>Platform fees go to Digital Platform Factory</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Failed to load cost estimates. Please try again.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
