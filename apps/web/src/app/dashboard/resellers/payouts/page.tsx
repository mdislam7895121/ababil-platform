"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth";
import { DollarSign, FileText, CheckCircle, Clock, CreditCard, Download, Plus, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Reseller {
  id: string;
  name: string;
  slug: string;
}

interface Payout {
  id: string;
  resellerId: string;
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

export default function ResellerPayoutsPage() {
  const { t } = useI18n();
  const { token, currentTenant } = useAuth();
  const tenantId = currentTenant?.id || "";
  const { toast } = useToast();

  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<string>("");
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);

  const [generateForm, setGenerateForm] = useState({
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0],
    currency: "USD",
  });

  const [markPaidForm, setMarkPaidForm] = useState({
    payoutMethod: "bank",
    reference: "",
  });

  const formatCurrency = (amount: number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  const fetchResellers = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/resellers", {
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
      });
      if (res.ok) {
        const data = await res.json();
        setResellers(data.resellers || []);
      }
    } catch (err) {
      console.error("Failed to fetch resellers:", err);
    }
  };

  const fetchPayouts = async () => {
    if (!token || !selectedReseller) {
      setPayouts([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/resellers/${selectedReseller}/payouts?limit=50`, {
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
      });
      if (res.ok) {
        const data = await res.json();
        setPayouts(data.payouts || []);
      }
    } catch (err) {
      console.error("Failed to fetch payouts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResellers();
  }, [token, tenantId]);

  useEffect(() => {
    setLoading(true);
    fetchPayouts();
  }, [selectedReseller, token, tenantId]);

  const handleGenerate = async () => {
    if (!selectedReseller) return;
    setActionLoading("generate");
    try {
      const res = await fetch(`/api/resellers/${selectedReseller}/payouts/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(generateForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate payout");
      toast({ title: "Payout generated", description: `Net payable: ${formatCurrency(data.payout.netPayable, data.payout.currency)}` });
      setShowGenerateDialog(false);
      fetchPayouts();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to generate payout", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (payout: Payout) => {
    setActionLoading(payout.id);
    try {
      const res = await fetch(`/api/resellers/${payout.resellerId}/payouts/${payout.id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve payout");
      toast({ title: "Payout approved" });
      fetchPayouts();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to approve", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkPaid = async () => {
    if (!selectedPayout) return;
    setActionLoading(selectedPayout.id);
    try {
      const res = await fetch(`/api/resellers/${selectedPayout.resellerId}/payouts/${selectedPayout.id}/mark-paid`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payoutMethod: markPaidForm.payoutMethod,
          payoutDetails: { reference: markPaidForm.reference },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark as paid");
      toast({ title: "Payout marked as paid" });
      setShowMarkPaidDialog(false);
      setSelectedPayout(null);
      fetchPayouts();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to mark paid", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      owed: "secondary",
      approved: "default",
      paid: "outline",
      void: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"} data-testid={`badge-status-${status}`}>{status.toUpperCase()}</Badge>;
  };

  const getResellerName = (id: string) => {
    return resellers.find((r) => r.id === id)?.name || id.slice(0, 8);
  };

  const owedTotal = payouts.filter((p) => p.status === "owed").reduce((sum, p) => sum + Number(p.netPayable), 0);
  const approvedTotal = payouts.filter((p) => p.status === "approved").reduce((sum, p) => sum + Number(p.netPayable), 0);
  const paidTotal = payouts.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.netPayable), 0);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Reseller Payouts</h1>
          <p className="text-muted-foreground">Manage reseller commission payouts and ledger</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={selectedReseller} onValueChange={setSelectedReseller}>
            <SelectTrigger className="w-[200px]" data-testid="select-reseller">
              <SelectValue placeholder="Select reseller" />
            </SelectTrigger>
            <SelectContent>
              {resellers.map((r) => (
                <SelectItem key={r.id} value={r.id} data-testid={`select-option-${r.id}`}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
            <DialogTrigger asChild>
              <Button disabled={!selectedReseller} data-testid="button-generate-payout">
                <Plus className="w-4 h-4 mr-2" />
                Generate Payout
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Payout</DialogTitle>
                <DialogDescription>Create a payout statement for the selected period</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period Start</Label>
                    <Input
                      type="date"
                      value={generateForm.periodStart}
                      onChange={(e) => setGenerateForm({ ...generateForm, periodStart: e.target.value })}
                      data-testid="input-period-start"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Period End</Label>
                    <Input
                      type="date"
                      value={generateForm.periodEnd}
                      onChange={(e) => setGenerateForm({ ...generateForm, periodEnd: e.target.value })}
                      data-testid="input-period-end"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={generateForm.currency} onValueChange={(v) => setGenerateForm({ ...generateForm, currency: v })}>
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="BDT">BDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
                <Button onClick={handleGenerate} disabled={actionLoading === "generate"} data-testid="button-confirm-generate">
                  {actionLoading === "generate" ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Generate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {selectedReseller && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Owed</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-owed-total">{formatCurrency(owedTotal)}</div>
                <p className="text-xs text-muted-foreground">{payouts.filter((p) => p.status === "owed").length} payouts pending</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-approved-total">{formatCurrency(approvedTotal)}</div>
                <p className="text-xs text-muted-foreground">{payouts.filter((p) => p.status === "approved").length} ready to pay</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">Paid</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-paid-total">{formatCurrency(paidTotal)}</div>
                <p className="text-xs text-muted-foreground">{payouts.filter((p) => p.status === "paid").length} completed</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payout History</CardTitle>
              <CardDescription>All payout records for {getResellerName(selectedReseller)}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : payouts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No payouts found. Generate one to get started.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Gross Revenue</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Adjustments</TableHead>
                      <TableHead className="text-right">Net Payable</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id} data-testid={`row-payout-${payout.id}`}>
                        <TableCell>
                          {formatDate(payout.periodStart)} - {formatDate(payout.periodEnd)}
                        </TableCell>
                        <TableCell>{payout.currency}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(payout.grossRevenue), payout.currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(payout.commissionEarned), payout.currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(payout.adjustments), payout.currency)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(payout.netPayable), payout.currency)}</TableCell>
                        <TableCell>{getStatusBadge(payout.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {payout.status === "owed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApprove(payout)}
                                disabled={actionLoading === payout.id}
                                data-testid={`button-approve-${payout.id}`}
                              >
                                Approve
                              </Button>
                            )}
                            {payout.status === "approved" && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedPayout(payout);
                                  setShowMarkPaidDialog(true);
                                }}
                                disabled={actionLoading === payout.id}
                                data-testid={`button-mark-paid-${payout.id}`}
                              >
                                <CreditCard className="w-3 h-3 mr-1" />
                                Mark Paid
                              </Button>
                            )}
                            {payout.status === "paid" && (
                              <Badge variant="outline" className="text-green-600">
                                {payout.payoutMethod || "Paid"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!selectedReseller && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a reseller to view and manage payouts
          </CardContent>
        </Card>
      )}

      <Dialog open={showMarkPaidDialog} onOpenChange={setShowMarkPaidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Payout as Paid</DialogTitle>
            <DialogDescription>
              Confirm payment of {selectedPayout ? formatCurrency(Number(selectedPayout.netPayable), selectedPayout.currency) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={markPaidForm.payoutMethod} onValueChange={(v) => setMarkPaidForm({ ...markPaidForm, payoutMethod: v })}>
                <SelectTrigger data-testid="select-payout-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="manual">Manual/Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference (optional)</Label>
              <Input
                placeholder="Transaction ID or reference"
                value={markPaidForm.reference}
                onChange={(e) => setMarkPaidForm({ ...markPaidForm, reference: e.target.value })}
                data-testid="input-reference"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaidDialog(false)}>Cancel</Button>
            <Button onClick={handleMarkPaid} disabled={!!actionLoading} data-testid="button-confirm-mark-paid">
              {actionLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
