"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth";
import { DollarSign, Clock, CheckCircle, FileText, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Payout {
  id: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  grossRevenue: number;
  commissionEarned: number;
  adjustments: number;
  netPayable: number;
  status: string;
  approvedAt?: string;
  paidAt?: string;
  payoutMethod?: string;
  createdAt: string;
}

interface LedgerEntry {
  id: string;
  invoiceId?: string;
  currency: string;
  type: string;
  amount: number;
  note?: string;
  occurredAt: string;
  invoice?: { id: string; amount: number };
}

export default function ResellerPayoutsPage() {
  const { t } = useI18n();
  const { token, currentTenant } = useAuth();
  const tenantId = currentTenant?.id || "";

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [ledger, setLedger] = useState<{ entries: LedgerEntry[]; balance: number }>({ entries: [], balance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (amount: number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      try {
        const [payoutsRes, ledgerRes] = await Promise.all([
          fetch("/api/resellers/my/payouts", {
            headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
          }),
          fetch("/api/resellers/my/ledger", {
            headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
          }),
        ]);

        if (payoutsRes.status === 403) {
          setError("You are not registered as a reseller.");
          setLoading(false);
          return;
        }

        if (payoutsRes.ok) {
          const data = await payoutsRes.json();
          setPayouts(data.payouts || []);
        }
        if (ledgerRes.ok) {
          const data = await ledgerRes.json();
          setLedger(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, tenantId]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      owed: "secondary",
      approved: "default",
      paid: "outline",
      void: "destructive",
    };
    const labels: Record<string, string> = {
      owed: "Pending",
      approved: "Approved",
      paid: "Paid",
      void: "Void",
    };
    return <Badge variant={variants[status] || "secondary"} data-testid={`badge-status-${status}`}>{labels[status] || status}</Badge>;
  };

  const getEntryIcon = (type: string, amount: number) => {
    if (type === "payout") return <ArrowDownRight className="h-4 w-4 text-red-500" />;
    if (amount >= 0) return <ArrowUpRight className="h-4 w-4 text-green-500" />;
    return <ArrowDownRight className="h-4 w-4 text-red-500" />;
  };

  const owedTotal = payouts.filter((p) => p.status === "owed" || p.status === "approved").reduce((sum, p) => sum + Number(p.netPayable), 0);
  const paidTotal = payouts.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.netPayable), 0);

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">{error}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">My Payouts</h1>
        <p className="text-muted-foreground">View your commission payouts and transaction history</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-balance">{formatCurrency(ledger.balance)}</div>
            <p className="text-xs text-muted-foreground">Available earnings</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending">{formatCurrency(owedTotal)}</div>
            <p className="text-xs text-muted-foreground">{payouts.filter((p) => p.status === "owed" || p.status === "approved").length} payouts pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-paid">{formatCurrency(paidTotal)}</div>
            <p className="text-xs text-muted-foreground">{payouts.filter((p) => p.status === "paid").length} completed payouts</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payouts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payouts" data-testid="tab-payouts">Payouts</TabsTrigger>
          <TabsTrigger value="ledger" data-testid="tab-ledger">Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <CardTitle>Payout History</CardTitle>
              <CardDescription>Your commission payout statements</CardDescription>
            </CardHeader>
            <CardContent>
              {payouts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No payouts yet. Commission statements will appear here.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Gross Revenue</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Net Payable</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id} data-testid={`row-payout-${payout.id}`}>
                        <TableCell>{formatDate(payout.periodStart)} - {formatDate(payout.periodEnd)}</TableCell>
                        <TableCell>{payout.currency}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(payout.grossRevenue), payout.currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(payout.commissionEarned), payout.currency)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(payout.netPayable), payout.currency)}</TableCell>
                        <TableCell>{getStatusBadge(payout.status)}</TableCell>
                        <TableCell>{payout.paidAt ? formatDate(payout.paidAt) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Ledger</CardTitle>
              <CardDescription>Detailed record of all commission accruals, adjustments, and payouts</CardDescription>
            </CardHeader>
            <CardContent>
              {ledger.entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No transactions yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.entries.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-ledger-${entry.id}`}>
                        <TableCell>{formatDate(entry.occurredAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getEntryIcon(entry.type, Number(entry.amount))}
                            <span className="capitalize">{entry.type.replace("_", " ")}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{entry.note || "-"}</TableCell>
                        <TableCell>{entry.currency}</TableCell>
                        <TableCell className={`text-right font-medium ${Number(entry.amount) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {Number(entry.amount) >= 0 ? "+" : ""}{formatCurrency(Number(entry.amount), entry.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
