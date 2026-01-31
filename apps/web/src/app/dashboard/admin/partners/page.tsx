'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Handshake, 
  DollarSign, 
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Search,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PartnerAccount {
  id: string;
  tenantId: string;
  status: 'pending' | 'approved' | 'suspended';
  displayName: string;
  contactEmail: string;
  country: string | null;
  payoutPreferences: any;
  createdAt: string;
  updatedAt: string;
  totalEarnings?: number;
  pendingPayout?: number;
  _count?: {
    listings: number;
    earnings: number;
    payouts: number;
  };
}

interface PartnerPayout {
  id: string;
  partnerId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  requestedAt?: string;
  paymentDetails: any;
  partner?: {
    displayName: string;
    contactEmail: string;
  };
}

export default function AdminPartnersPage() {
  const { token, currentTenant, currentRole } = useAuth();
  const router = useRouter();
  
  const [partners, setPartners] = useState<PartnerAccount[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<PartnerPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const tenantId = currentTenant?.id;
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';

  const headers = {
    'Authorization': `Bearer ${token}`,
    'x-tenant-id': tenantId || '',
    'Content-Type': 'application/json'
  };

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (!isAdmin) {
      router.push('/dashboard');
      return;
    }
    if (token && tenantId) {
      fetchData();
    }
  }, [token, tenantId, isAdmin]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const partnersRes = await fetch('/api/partners', { headers });

      if (partnersRes.ok) {
        const data = await partnersRes.json();
        setPartners(data.partners || []);
      }
      setPendingPayouts([]);
    } catch (err) {
      console.error('Failed to fetch admin partner data:', err);
      setError('Failed to load partner data');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (partnerId: string) => {
    try {
      setActionLoading(partnerId);
      setError(null);
      
      const res = await fetch(`/api/partners/${partnerId}/approve`, {
        method: 'POST',
        headers
      });

      if (res.ok) {
        setSuccess('Partner approved successfully');
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to approve partner');
      }
    } catch (err) {
      setError('Failed to approve partner');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (partnerId: string) => {
    try {
      setActionLoading(partnerId);
      setError(null);
      
      const res = await fetch(`/api/partners/${partnerId}/suspend`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'Suspended by admin' })
      });

      if (res.ok) {
        setSuccess('Partner suspended');
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to suspend partner');
      }
    } catch (err) {
      setError('Failed to suspend partner');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprovePayout = async (payoutId: string) => {
    try {
      setActionLoading(payoutId);
      setError(null);
      
      const res = await fetch(`/api/partners/admin/payouts/${payoutId}/approve`, {
        method: 'POST',
        headers
      });

      if (res.ok) {
        setSuccess('Payout approved');
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to approve payout');
      }
    } catch (err) {
      setError('Failed to approve payout');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayout = async (payoutId: string) => {
    try {
      setActionLoading(payoutId);
      setError(null);
      
      const res = await fetch(`/api/partners/admin/payouts/${payoutId}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'Rejected by admin' })
      });

      if (res.ok) {
        setSuccess('Payout rejected');
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to reject payout');
      }
    } catch (err) {
      setError('Failed to reject payout');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSettlePayout = async (payoutId: string) => {
    try {
      setActionLoading(payoutId);
      setError(null);
      
      const res = await fetch(`/api/partners/admin/payouts/${payoutId}/settle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ transactionRef: `TXN-${Date.now()}` })
      });

      if (res.ok) {
        setSuccess('Payout settled');
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to settle payout');
      }
    } catch (err) {
      setError('Failed to settle payout');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredPartners = partners.filter(p => 
    (p.displayName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.contactEmail || '').toLowerCase().includes(search.toLowerCase())
  );

  const pendingPartners = filteredPartners.filter(p => p.status === 'pending');
  const approvedPartners = filteredPartners.filter(p => p.status === 'approved');
  const suspendedPartners = filteredPartners.filter(p => p.status === 'suspended');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-admin-partners">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Handshake className="w-6 h-6" />
          Partner Administration
        </h1>
        <p className="text-muted-foreground">Manage partner accounts and payouts</p>
      </div>

      {error && (
        <Card className="border-red-500 bg-red-500/10">
          <CardContent className="p-4">
            <p className="text-red-500" data-testid="text-error">{error}</p>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-green-500 bg-green-500/10">
          <CardContent className="p-4">
            <p className="text-green-500" data-testid="text-success">{success}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Partners</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-partners">{partners.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-500" data-testid="text-pending-partners">{pendingPartners.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Partners</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500" data-testid="text-active-partners">{approvedPartners.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-500" data-testid="text-pending-payouts">{pendingPayouts.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search partners..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          data-testid="input-search-partners"
        />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingPartners.length})
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            Approved ({approvedPartners.length})
          </TabsTrigger>
          <TabsTrigger value="suspended" data-testid="tab-suspended">
            Suspended ({suspendedPartners.length})
          </TabsTrigger>
          <TabsTrigger value="payouts" data-testid="tab-payouts">
            Payouts ({pendingPayouts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Applications</CardTitle>
              <CardDescription>Partner applications awaiting review</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPartners.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No pending applications</p>
              ) : (
                <div className="space-y-3">
                  {pendingPartners.map((partner) => (
                    <div 
                      key={partner.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`partner-pending-${partner.id}`}
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{partner.displayName}</p>
                        <p className="text-sm text-muted-foreground">{partner.contactEmail}</p>
                        {partner.country && (
                          <p className="text-xs text-muted-foreground">Country: {partner.country}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Applied: {new Date(partner.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(partner.id)}
                          disabled={actionLoading === partner.id}
                          data-testid={`button-approve-${partner.id}`}
                        >
                          {actionLoading === partner.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSuspend(partner.id)}
                          disabled={actionLoading === partner.id}
                          data-testid={`button-reject-${partner.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Partners</CardTitle>
              <CardDescription>Approved and active partner accounts</CardDescription>
            </CardHeader>
            <CardContent>
              {approvedPartners.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No active partners</p>
              ) : (
                <div className="space-y-3">
                  {approvedPartners.map((partner) => (
                    <div 
                      key={partner.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`partner-approved-${partner.id}`}
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{partner.displayName}</p>
                        <p className="text-sm text-muted-foreground">{partner.contactEmail}</p>
                        <div className="flex gap-4 text-xs">
                          <span>Total: ${Number(partner.totalEarnings).toFixed(2)}</span>
                          <span>Pending: ${Number(partner.pendingPayout).toFixed(2)}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleSuspend(partner.id)}
                        disabled={actionLoading === partner.id}
                        data-testid={`button-suspend-${partner.id}`}
                      >
                        {actionLoading === partner.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Ban className="w-4 h-4 mr-1" />
                        )}
                        Suspend
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspended" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Suspended Partners</CardTitle>
              <CardDescription>Partners with suspended accounts</CardDescription>
            </CardHeader>
            <CardContent>
              {suspendedPartners.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No suspended partners</p>
              ) : (
                <div className="space-y-3">
                  {suspendedPartners.map((partner) => (
                    <div 
                      key={partner.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`partner-suspended-${partner.id}`}
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{partner.displayName}</p>
                        <p className="text-sm text-muted-foreground">{partner.contactEmail}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(partner.id)}
                        disabled={actionLoading === partner.id}
                        data-testid={`button-reactivate-${partner.id}`}
                      >
                        {actionLoading === partner.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                        )}
                        Reactivate
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Payouts</CardTitle>
              <CardDescription>Partner payout requests awaiting processing</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPayouts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No pending payout requests</p>
              ) : (
                <div className="space-y-3">
                  {pendingPayouts.map((payout) => (
                    <div 
                      key={payout.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`payout-pending-${payout.id}`}
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{payout.partner?.displayName || 'Unknown Partner'}</p>
                        <p className="text-sm text-muted-foreground">{payout.partner?.contactEmail}</p>
                        <div className="flex gap-4 text-sm">
                          <span className="font-semibold text-green-500">
                            ${Number(payout.amount).toFixed(2)} {payout.currency}
                          </span>
                          <span className="text-muted-foreground">
                            Requested: {new Date(payout.requestedAt || payout.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <Badge variant="outline">{payout.status}</Badge>
                      </div>
                      <div className="flex gap-2">
                        {payout.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApprovePayout(payout.id)}
                              disabled={actionLoading === payout.id}
                              data-testid={`button-approve-payout-${payout.id}`}
                            >
                              {actionLoading === payout.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectPayout(payout.id)}
                              disabled={actionLoading === payout.id}
                              data-testid={`button-reject-payout-${payout.id}`}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                        {payout.status === 'approved' && (
                          <Button
                            size="sm"
                            onClick={() => handleSettlePayout(payout.id)}
                            disabled={actionLoading === payout.id}
                            data-testid={`button-settle-payout-${payout.id}`}
                          >
                            {actionLoading === payout.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <DollarSign className="w-4 h-4 mr-1" />
                            )}
                            Mark Settled
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
