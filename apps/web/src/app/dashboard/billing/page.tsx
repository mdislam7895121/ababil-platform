"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Smartphone, Building2, Banknote, Clock, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  { key: "pro", name: "Pro", priceUSD: 39, priceBDT: 4500, features: ["1 Live App", "Full Platform Access", "Email Support"] },
  { key: "business", name: "Business", priceUSD: 99, priceBDT: 11500, features: ["Up to 5 Live Apps", "Priority Support", "Custom Branding", "API Access"] }
];

const PAYMENT_METHODS = [
  { key: "bkash", name: "bKash", icon: Smartphone, color: "text-pink-500" },
  { key: "nagad", name: "Nagad", icon: Smartphone, color: "text-orange-500" },
  { key: "rocket", name: "Rocket", icon: Smartphone, color: "text-purple-500" },
  { key: "bank", name: "Bank Transfer", icon: Building2, color: "text-blue-500" },
  { key: "cash", name: "Cash", icon: Banknote, color: "text-green-500" }
];

type ManualPayment = {
  id: string;
  method: string;
  transactionRef: string;
  amount: string;
  currency: string;
  plan: string;
  status: string;
  createdAt: string;
};

export default function BillingPage() {
  const { token, currentTenant } = useAuth();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [paymentMethod, setPaymentMethod] = useState("bkash");
  const [transactionRef, setTransactionRef] = useState("");
  const [currency, setCurrency] = useState("BDT");

  const { data: myPayments, refetch: refetchPayments } = useQuery<{ payments: ManualPayment[] }>({
    queryKey: ["/api/payments/manual/self", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/payments/manual/self", {
        headers: { 
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        }
      });
      if (!res.ok) return { payments: [] };
      return res.json();
    },
    enabled: !!token && !!currentTenant
  });

  const submitPayment = useMutation({
    mutationFn: async () => {
      const plan = PLANS.find(p => p.key === selectedPlan);
      const amount = currency === "BDT" ? plan?.priceBDT : plan?.priceUSD;
      
      const res = await fetch("/api/payments/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || ""
        },
        body: JSON.stringify({
          method: paymentMethod,
          transactionRef,
          plan: selectedPlan,
          amount,
          currency
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit payment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payment Submitted", description: "Your payment is pending admin approval." });
      setTransactionRef("");
      refetchPayments();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const pendingPayments = myPayments?.payments?.filter(p => p.status === "pending") || [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-billing-title">Billing & Subscription</h1>
          <p className="text-muted-foreground">Upgrade your plan to unlock live deployments</p>
        </div>

        {pendingPayments.length > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium">Payment Pending Approval</p>
                <p className="text-sm text-muted-foreground">
                  You have {pendingPayments.length} payment(s) awaiting admin approval.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="card" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="card" data-testid="tab-card-payment">
              <CreditCard className="h-4 w-4 mr-2" /> Card Payment
            </TabsTrigger>
            <TabsTrigger value="manual" data-testid="tab-manual-payment">
              <Smartphone className="h-4 w-4 mr-2" /> Manual Payment
            </TabsTrigger>
          </TabsList>

          <TabsContent value="card" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pay with Card</CardTitle>
                <CardDescription>
                  Secure payment via Stripe. Your card will be charged immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {PLANS.map(plan => (
                    <Card 
                      key={plan.key}
                      className={`cursor-pointer transition-all ${selectedPlan === plan.key ? "ring-2 ring-primary" : "hover-elevate"}`}
                      onClick={() => setSelectedPlan(plan.key)}
                      data-testid={`card-plan-${plan.key}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold">{plan.name}</h3>
                          <Badge variant={selectedPlan === plan.key ? "default" : "secondary"}>
                            ${plan.priceUSD}/mo
                          </Badge>
                        </div>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {plan.features.map(f => (
                            <li key={f} className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-500" /> {f}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Button 
                  className="w-full" 
                  size="lg"
                  data-testid="button-pay-with-card"
                  onClick={() => {
                    window.location.href = `/api/billing/checkout?plan=${selectedPlan}&tenantId=${currentTenant?.id}`;
                  }}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay ${PLANS.find(p => p.key === selectedPlan)?.priceUSD}/month with Card
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Manual Payment</CardTitle>
                <CardDescription>
                  Pay via bKash, Nagad, Rocket, Bank Transfer, or Cash. Requires admin approval.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Select Plan</Label>
                  <div className="grid gap-3 md:grid-cols-2">
                    {PLANS.map(plan => (
                      <Card 
                        key={plan.key}
                        className={`cursor-pointer transition-all ${selectedPlan === plan.key ? "ring-2 ring-primary" : "hover-elevate"}`}
                        onClick={() => setSelectedPlan(plan.key)}
                      >
                        <CardContent className="p-3">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{plan.name}</span>
                            <Badge variant={selectedPlan === plan.key ? "default" : "outline"}>
                              {currency === "BDT" ? `৳${plan.priceBDT}` : `$${plan.priceUSD}`}/mo
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BDT">BDT (Bangladeshi Taka)</SelectItem>
                      <SelectItem value="USD">USD (US Dollar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {PAYMENT_METHODS.map(method => {
                      const Icon = method.icon;
                      return (
                        <Button
                          key={method.key}
                          variant={paymentMethod === method.key ? "default" : "outline"}
                          className="flex flex-col h-auto py-3 gap-1"
                          onClick={() => setPaymentMethod(method.key)}
                          data-testid={`button-method-${method.key}`}
                        >
                          <Icon className={`h-5 w-5 ${paymentMethod === method.key ? "" : method.color}`} />
                          <span className="text-xs">{method.name}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transactionRef">Transaction Reference / ID</Label>
                  <Input
                    id="transactionRef"
                    placeholder="Enter your transaction ID or reference number"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    data-testid="input-transaction-ref"
                  />
                  <p className="text-xs text-muted-foreground">
                    For mobile payments: Enter the Transaction ID from your SMS confirmation
                  </p>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <h4 className="font-medium">Payment Instructions</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {paymentMethod === "bkash" && (
                      <>
                        <p>1. Go to bKash App → Send Money</p>
                        <p>2. Enter: <strong>01XXXXXXXXX</strong></p>
                        <p>3. Amount: <strong>{currency === "BDT" ? `৳${PLANS.find(p => p.key === selectedPlan)?.priceBDT}` : `$${PLANS.find(p => p.key === selectedPlan)?.priceUSD}`}</strong></p>
                        <p>4. Copy Transaction ID and paste above</p>
                      </>
                    )}
                    {paymentMethod === "nagad" && (
                      <>
                        <p>1. Go to Nagad App → Send Money</p>
                        <p>2. Enter: <strong>01XXXXXXXXX</strong></p>
                        <p>3. Amount: <strong>{currency === "BDT" ? `৳${PLANS.find(p => p.key === selectedPlan)?.priceBDT}` : `$${PLANS.find(p => p.key === selectedPlan)?.priceUSD}`}</strong></p>
                        <p>4. Copy Transaction ID and paste above</p>
                      </>
                    )}
                    {paymentMethod === "rocket" && (
                      <>
                        <p>1. Go to Rocket App → Send Money</p>
                        <p>2. Enter: <strong>01XXXXXXXXX</strong></p>
                        <p>3. Amount: <strong>{currency === "BDT" ? `৳${PLANS.find(p => p.key === selectedPlan)?.priceBDT}` : `$${PLANS.find(p => p.key === selectedPlan)?.priceUSD}`}</strong></p>
                        <p>4. Copy Transaction ID and paste above</p>
                      </>
                    )}
                    {paymentMethod === "bank" && (
                      <>
                        <p>Bank: <strong>ACME Bank Ltd</strong></p>
                        <p>Account: <strong>1234567890</strong></p>
                        <p>Branch: <strong>Dhaka Main</strong></p>
                        <p>Reference: Use your workspace name</p>
                      </>
                    )}
                    {paymentMethod === "cash" && (
                      <p>Contact us to arrange cash payment pickup.</p>
                    )}
                  </div>
                </div>

                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={() => submitPayment.mutate()}
                  disabled={!transactionRef || transactionRef.length < 4 || submitPayment.isPending}
                  data-testid="button-submit-manual-payment"
                >
                  {submitPayment.isPending ? "Submitting..." : "Submit Payment for Approval"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {myPayments?.payments && myPayments.payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {myPayments.payments.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {payment.status === "pending" && <Clock className="h-5 w-5 text-yellow-500" />}
                      {payment.status === "approved" && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {payment.status === "rejected" && <XCircle className="h-5 w-5 text-red-500" />}
                      <div>
                        <p className="font-medium">{payment.plan.toUpperCase()} Plan via {payment.method}</p>
                        <p className="text-sm text-muted-foreground">Ref: {payment.transactionRef}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={payment.status === "approved" ? "default" : payment.status === "rejected" ? "destructive" : "secondary"}>
                        {payment.status}
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        {payment.currency} {payment.amount}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
