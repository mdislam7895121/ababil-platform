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
  Package, 
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  ArrowRight,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  listings?: PartnerListing[];
  _count?: {
    earnings: number;
    payouts: number;
  };
}

interface PartnerListing {
  id: string;
  partnerId: string;
  marketplaceItemId: string;
  commissionType: string;
  commissionValue: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PartnerEarning {
  id: string;
  partnerId: string;
  listingId: string | null;
  invoiceId: string | null;
  sourceType: string;
  grossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  netAmount: number;
  currency: string;
  status: string;
  settledAt: string | null;
  createdAt: string;
}

interface EarningsTotals {
  grossAmount: number;
  commissionAmount: number;
  partnerNet: number;
}

interface PartnerPayout {
  id: string;
  partnerId: string;
  amount: number;
  currency: string;
  status: string;
  paymentDetails: any;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function DashboardPartnersPage() {
  const { token, currentTenant, user } = useAuth();
  const router = useRouter();
  
  const [account, setAccount] = useState<PartnerAccount | null>(null);
  const [listings, setListings] = useState<PartnerListing[]>([]);
  const [earnings, setEarnings] = useState<PartnerEarning[]>([]);
  const [payouts, setPayouts] = useState<PartnerPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showListingDialog, setShowListingDialog] = useState(false);

  const [applyForm, setApplyForm] = useState({
    displayName: '',
    contactEmail: user?.email || '',
    country: 'US',
    payoutPreferences: { method: 'stripe' }
  });

  const [listingForm, setListingForm] = useState({
    marketplaceItemId: '',
    commissionType: 'percent',
    commissionValue: 20
  });

  const [earningsTotals, setEarningsTotals] = useState<EarningsTotals>({
    grossAmount: 0,
    commissionAmount: 0,
    partnerNet: 0
  });

  const tenantId = currentTenant?.id;

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
    if (token && tenantId) {
      fetchData();
    }
  }, [token, tenantId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const accountRes = await fetch('/api/partners/me', { headers });
      
      if (accountRes.ok) {
        const data = await accountRes.json();
        if (data.partner) {
          setAccount(data.partner);
          
          const [listingsRes, earningsRes, payoutsRes] = await Promise.all([
            fetch('/api/partners/my/listings', { headers }),
            fetch('/api/partners/my/earnings', { headers }),
            fetch('/api/partners/my/payouts', { headers })
          ]);

          if (listingsRes.ok) {
            const listingsData = await listingsRes.json();
            setListings(listingsData.listings || []);
          }
          if (earningsRes.ok) {
            const earningsData = await earningsRes.json();
            setEarnings(earningsData.earnings || []);
            if (earningsData.totals) {
              setEarningsTotals(earningsData.totals);
            }
          }
          if (payoutsRes.ok) {
            const payoutsData = await payoutsRes.json();
            setPayouts(payoutsData.payouts || []);
          }
        }
      } else if (accountRes.status === 404) {
        setAccount(null);
      }
    } catch (err) {
      console.error('Failed to fetch partner data:', err);
      setError('Failed to load partner data');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    try {
      setApplying(true);
      setError(null);
      
      const res = await fetch('/api/partners/apply', {
        method: 'POST',
        headers,
        body: JSON.stringify(applyForm)
      });

      const data = await res.json();
      
      if (res.ok) {
        setSuccess('Partner application submitted! Awaiting approval.');
        setShowApplyDialog(false);
        fetchData();
      } else {
        setError(data.error || 'Failed to submit application');
      }
    } catch (err) {
      setError('Failed to submit application');
    } finally {
      setApplying(false);
    }
  };

  const handleCreateListing = async () => {
    try {
      setError(null);
      if (!account) return;
      
      const res = await fetch(`/api/partners/${account.id}/listings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          marketplaceItemId: listingForm.marketplaceItemId,
          commissionType: listingForm.commissionType,
          commissionValue: listingForm.commissionValue
        })
      });

      const data = await res.json();
      
      if (res.ok) {
        setSuccess('Listing created successfully!');
        setShowListingDialog(false);
        setListingForm({ marketplaceItemId: '', commissionType: 'percent', commissionValue: 20 });
        fetchData();
      } else {
        setError(data.error || 'Failed to create listing');
      }
    } catch (err) {
      setError('Failed to create listing');
    }
  };

  const handleRequestPayout = async () => {
    try {
      setError(null);
      if (!account) return;
      
      const res = await fetch(`/api/partners/${account.id}/payouts/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });

      const data = await res.json();
      
      if (res.ok) {
        setSuccess('Payout request submitted!');
        setShowPayoutDialog(false);
        setPayoutForm({ amount: 0, currency: 'USD', paymentMethod: 'bank', paymentDetails: '{}' });
        fetchData();
      } else {
        setError(data.error || 'Failed to request payout');
      }
    } catch (err) {
      setError('Failed to request payout');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-partners">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Handshake className="w-6 h-6" />
            Partner Program
          </h1>
          <p className="text-muted-foreground">Join our ecosystem and earn from marketplace sales</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Become a Partner</CardTitle>
            <CardDescription>
              Partners can list marketplace items and earn commissions on every sale. 
              Apply now to join our partner program.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <DollarSign className="w-8 h-8 mb-2 text-green-500" />
                <h3 className="font-semibold">Earn Commissions</h3>
                <p className="text-sm text-muted-foreground">Up to 30% on every sale</p>
              </div>
              <div className="p-4 border rounded-lg">
                <Package className="w-8 h-8 mb-2 text-blue-500" />
                <h3 className="font-semibold">List Products</h3>
                <p className="text-sm text-muted-foreground">Publish to our marketplace</p>
              </div>
              <div className="p-4 border rounded-lg">
                <TrendingUp className="w-8 h-8 mb-2 text-purple-500" />
                <h3 className="font-semibold">Track Earnings</h3>
                <p className="text-sm text-muted-foreground">Real-time analytics</p>
              </div>
            </div>

            <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-apply-partner">
                  <Plus className="w-4 h-4 mr-2" />
                  Apply to Partner Program
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Partner Application</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium">Display Name</label>
                    <Input
                      value={applyForm.displayName}
                      onChange={(e) => setApplyForm({ ...applyForm, displayName: e.target.value })}
                      placeholder="Your company or partner name"
                      data-testid="input-display-name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Contact Email</label>
                    <Input
                      type="email"
                      value={applyForm.contactEmail}
                      onChange={(e) => setApplyForm({ ...applyForm, contactEmail: e.target.value })}
                      placeholder="partner@example.com"
                      data-testid="input-contact-email"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Country</label>
                    <Input
                      value={applyForm.country}
                      onChange={(e) => setApplyForm({ ...applyForm, country: e.target.value })}
                      placeholder="US"
                      data-testid="input-country"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Payout Method</label>
                    <select 
                      className="w-full border rounded-md px-3 py-2 bg-background"
                      value={applyForm.payoutPreferences.method}
                      onChange={(e) => setApplyForm({ ...applyForm, payoutPreferences: { method: e.target.value } })}
                      data-testid="select-payout-method"
                    >
                      <option value="stripe">Stripe</option>
                      <option value="paypal">PayPal</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="bkash">bKash</option>
                    </select>
                  </div>
                  <Button 
                    onClick={handleApply} 
                    disabled={applying || !applyForm.displayName || !applyForm.contactEmail}
                    className="w-full"
                    data-testid="button-submit-application"
                  >
                    {applying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Submit Application
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Handshake className="w-6 h-6" />
            Partner Dashboard
          </h1>
          <p className="text-muted-foreground">{account.companyName}</p>
        </div>
        <Badge 
          variant={account.status === 'approved' ? 'default' : account.status === 'pending' ? 'secondary' : 'destructive'}
          data-testid="badge-partner-status"
        >
          {account.status}
        </Badge>
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

      {account.status === 'pending' && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-yellow-500" />
            <div>
              <p className="font-medium">Application Pending</p>
              <p className="text-sm text-muted-foreground">Your partner application is under review. We'll notify you once approved.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {account.status === 'suspended' && (
        <Card className="border-red-500 bg-red-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="font-medium">Account Suspended</p>
              <p className="text-sm text-muted-foreground">Contact support for assistance.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gross Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-earnings">${earningsTotals.grossAmount.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Your Net Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600" data-testid="text-pending-payout">${earningsTotals.partnerNet.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Listings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-active-listings">{listings.filter(l => l.status === 'active').length}</p>
          </CardContent>
        </Card>
      </div>

      {account.status === 'approved' && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>My Listings</CardTitle>
                <CardDescription>Marketplace items you're earning commissions on</CardDescription>
              </div>
              <Dialog open={showListingDialog} onOpenChange={setShowListingDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-listing">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Listing
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Partner Listing</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="text-sm font-medium">Marketplace Item ID</label>
                      <Input
                        value={listingForm.marketplaceItemId}
                        onChange={(e) => setListingForm({ ...listingForm, marketplaceItemId: e.target.value })}
                        placeholder="Enter marketplace item ID"
                        data-testid="input-marketplace-item-id"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Commission Model</label>
                      <Select 
                        value={listingForm.commissionType} 
                        onValueChange={(v) => setListingForm({ ...listingForm, commissionType: v })}
                      >
                        <SelectTrigger data-testid="select-commission-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">Percentage</SelectItem>
                          <SelectItem value="fixed">Fixed Amount</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        {listingForm.commissionType === 'percent' ? 'Commission Percentage (%)' : 'Fixed Commission ($)'}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max={listingForm.commissionType === 'percent' ? 100 : undefined}
                        value={listingForm.commissionValue}
                        onChange={(e) => setListingForm({ ...listingForm, commissionValue: Number(e.target.value) })}
                        data-testid="input-commission-value"
                      />
                    </div>
                    <Button 
                      onClick={handleCreateListing} 
                      disabled={!listingForm.marketplaceItemId}
                      className="w-full"
                      data-testid="button-create-listing"
                    >
                      Create Listing
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {listings.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No listings yet. Add your first listing to start earning!</p>
              ) : (
                <div className="space-y-2">
                  {listings.map((listing) => (
                    <div 
                      key={listing.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`listing-${listing.id}`}
                    >
                      <div>
                        <p className="font-medium">{listing.marketplaceItemId}</p>
                        <p className="text-sm text-muted-foreground">
                          {listing.commissionType === 'percent' 
                            ? `${Number(listing.commissionValue)}% commission`
                            : `$${Number(listing.commissionValue).toFixed(2)} per sale`}
                        </p>
                      </div>
                      <Badge variant={listing.status === 'active' ? 'default' : 'secondary'}>
                        {listing.status === 'active' ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Payouts</CardTitle>
                <CardDescription>Request and track your earnings payouts</CardDescription>
              </div>
              <Button 
                size="sm" 
                onClick={handleRequestPayout}
                disabled={earningsTotals.partnerNet <= 0}
                data-testid="button-request-payout"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Generate Payout (${earningsTotals.partnerNet.toFixed(2)})
              </Button>
            </CardHeader>
            <CardContent>
              {payouts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No payout requests yet</p>
              ) : (
                <div className="space-y-2">
                  {payouts.map((payout) => (
                    <div 
                      key={payout.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`payout-${payout.id}`}
                    >
                      <div>
                        <p className="font-medium">${Number(payout.amount).toFixed(2)} {payout.currency}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(payout.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={
                        payout.status === 'paid' ? 'default' : 
                        payout.status === 'approved' ? 'secondary' : 
                        payout.status === 'failed' ? 'destructive' : 'outline'
                      }>
                        {payout.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Earnings</CardTitle>
              <CardDescription>Your commission earnings from sales</CardDescription>
            </CardHeader>
            <CardContent>
              {earnings.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No earnings yet. Sales will appear here once your listings start selling.</p>
              ) : (
                <div className="space-y-2">
                  {earnings.slice(0, 10).map((earning) => (
                    <div 
                      key={earning.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`earning-${earning.id}`}
                    >
                      <div>
                        <p className="font-medium">{earning.sourceType}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(earning.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-green-500">+${Number(earning.netAmount).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          Gross: ${Number(earning.grossAmount).toFixed(2)} | Commission: {Number(earning.commissionRate)}%
                        </p>
                        <Badge variant="outline" className="text-xs">{earning.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
