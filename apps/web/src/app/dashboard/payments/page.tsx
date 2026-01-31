"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Clock, CheckCircle, XCircle, Eye, FileText, Download, 
  Smartphone, Building2, Banknote, AlertCircle 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ManualPayment = {
  id: string;
  tenantId: string;
  method: string;
  transactionRef: string;
  proofImageUrl: string | null;
  amount: string;
  currency: string;
  plan: string;
  status: string;
  rejectionNote: string | null;
  createdAt: string;
  approvedAt: string | null;
  tenant?: { name: string; slug: string };
  approvedBy?: { name: string; email: string };
};

type Invoice = {
  id: string;
  tenantId: string;
  subscriptionPlan: string;
  amount: string;
  currency: string;
  paymentType: string;
  paymentId: string | null;
  status: string;
  issuedAt: string;
  paidAt: string | null;
  tenant?: { name: string; slug: string };
  manualPayment?: { method: string; transactionRef: string };
};

const METHOD_ICONS: Record<string, typeof Smartphone> = {
  bkash: Smartphone,
  nagad: Smartphone,
  rocket: Smartphone,
  bank: Building2,
  cash: Banknote
};

export default function PaymentsPage() {
  const { token, currentTenant, currentRole } = useAuth();
  const { toast } = useToast();
  const [selectedPayment, setSelectedPayment] = useState<ManualPayment | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  const isOwnerOrAdmin = currentRole === "owner" || currentRole === "admin";

  const { data: payments, refetch } = useQuery<{ payments: ManualPayment[] }>({
    queryKey: ["/api/payments/manual", currentTenant?.id, activeTab],
    queryFn: async () => {
      const status = activeTab === "all" ? "" : activeTab;
      const url = status ? `/api/payments/manual?status=${status}` : "/api/payments/manual";
      const res = await fetch(url, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) return { payments: [] };
      return res.json();
    },
    enabled: !!token && !!currentTenant && isOwnerOrAdmin
  });

  const { data: invoices } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["/api/invoices", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/invoices", {
        headers: { 
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) return { invoices: [] };
      return res.json();
    },
    enabled: !!token && !!currentTenant && isOwnerOrAdmin
  });

  const approvePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await fetch(`/api/payments/manual/${paymentId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) throw new Error("Failed to approve payment");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payment Approved", description: "Subscription has been activated." });
      setSelectedPayment(null);
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const rejectPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await fetch(`/api/payments/manual/${paymentId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        },
        body: JSON.stringify({ note: rejectionNote })
      });
      if (!res.ok) throw new Error("Failed to reject payment");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payment Rejected", description: "The payment has been marked as rejected." });
      setSelectedPayment(null);
      setShowRejectDialog(false);
      setRejectionNote("");
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  if (!isOwnerOrAdmin) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">Only owners and admins can access payment management.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const paymentsList = payments?.payments || [];
  const invoicesList = invoices?.invoices || [];

  const pendingCount = paymentsList.filter(p => p.status === "pending").length;
  const approvedCount = paymentsList.filter(p => p.status === "approved").length;
  const rejectedCount = paymentsList.filter(p => p.status === "rejected").length;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-payments-title">Payment Management</h1>
          <p className="text-muted-foreground">Review and manage manual payment submissions</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="card-pending-count">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-approved-count">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-sm text-muted-foreground">Approved</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-rejected-count">
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{rejectedCount}</p>
                <p className="text-sm text-muted-foreground">Rejected</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-invoices-count">
            <CardContent className="p-4 flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{invoicesList.length}</p>
                <p className="text-sm text-muted-foreground">Invoices</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending {pendingCount > 0 && <Badge variant="secondary" className="ml-2">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Payments</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentsList.filter(p => p.status === "pending").length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No pending payments</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentsList.filter(p => p.status === "pending").map(payment => {
                        const Icon = METHOD_ICONS[payment.method] || Smartphone;
                        return (
                          <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                            <TableCell>{new Date(payment.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {payment.method.toUpperCase()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{payment.plan.toUpperCase()}</Badge>
                            </TableCell>
                            <TableCell>{payment.currency} {payment.amount}</TableCell>
                            <TableCell className="font-mono text-sm">{payment.transactionRef}</TableCell>
                            <TableCell className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={() => approvePayment.mutate(payment.id)}
                                disabled={approvePayment.isPending}
                                data-testid={`button-approve-${payment.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" /> Approve
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => {
                                  setSelectedPayment(payment);
                                  setShowRejectDialog(true);
                                }}
                                data-testid={`button-reject-${payment.id}`}
                              >
                                <XCircle className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approved" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Approved Payments</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentsList.filter(p => p.status === "approved").length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No approved payments</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Approved</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentsList.filter(p => p.status === "approved").map(payment => {
                        const Icon = METHOD_ICONS[payment.method] || Smartphone;
                        return (
                          <TableRow key={payment.id}>
                            <TableCell>{new Date(payment.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {payment.method.toUpperCase()}
                            </TableCell>
                            <TableCell>
                              <Badge>{payment.plan.toUpperCase()}</Badge>
                            </TableCell>
                            <TableCell>{payment.currency} {payment.amount}</TableCell>
                            <TableCell className="font-mono text-sm">{payment.transactionRef}</TableCell>
                            <TableCell>
                              {payment.approvedAt ? new Date(payment.approvedAt).toLocaleDateString() : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rejected" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Rejected Payments</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentsList.filter(p => p.status === "rejected").length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No rejected payments</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentsList.filter(p => p.status === "rejected").map(payment => {
                        const Icon = METHOD_ICONS[payment.method] || Smartphone;
                        return (
                          <TableRow key={payment.id}>
                            <TableCell>{new Date(payment.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {payment.method.toUpperCase()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{payment.plan.toUpperCase()}</Badge>
                            </TableCell>
                            <TableCell>{payment.currency} {payment.amount}</TableCell>
                            <TableCell className="font-mono text-sm">{payment.transactionRef}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{payment.rejectionNote || "-"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoicesList.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No invoices yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoicesList.map(invoice => (
                        <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                          <TableCell className="font-mono text-sm">{invoice.id.slice(0, 8).toUpperCase()}</TableCell>
                          <TableCell>{new Date(invoice.issuedAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{invoice.subscriptionPlan.toUpperCase()}</Badge>
                          </TableCell>
                          <TableCell>{invoice.currency} {invoice.amount}</TableCell>
                          <TableCell>
                            <Badge variant={invoice.paymentType === "stripe" ? "default" : "secondary"}>
                              {invoice.paymentType === "stripe" ? "Card" : "Manual"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              invoice.status === "paid" ? "default" : 
                              invoice.status === "rejected" ? "destructive" : "secondary"
                            }>
                              {invoice.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, "_blank")}
                              data-testid={`button-view-invoice-${invoice.id}`}
                            >
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
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

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Input
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
                placeholder="e.g., Invalid transaction reference"
                data-testid="input-rejection-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={() => selectedPayment && rejectPayment.mutate(selectedPayment.id)}
              disabled={rejectPayment.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectPayment.isPending ? "Rejecting..." : "Reject Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
