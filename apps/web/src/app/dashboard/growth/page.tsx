'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  Gift, 
  Bell,
  Package,
  ArrowRight,
  Clock,
  X,
  Sparkles,
  Check
} from 'lucide-react';
import Link from 'next/link';

interface Nudge {
  nudgeType: string;
  message: string;
  ctaLabel: string;
  targetRoute: string;
  priority: number;
}

interface Offer {
  id: string;
  name: string;
  description: string;
  discountPercent: number;
  expiresAt: string;
  timeRemaining: number;
  eligiblePlans: string[];
}

interface Upsell {
  id: string;
  title: string;
  description: string;
  price: string;
  trigger: string;
  ctaLabel: string;
  value: string[];
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export default function GrowthPage() {
  const { token, currentTenant } = useAuth();
  const router = useRouter();
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedNudge, setDismissedNudge] = useState(false);
  
  const tenantId = currentTenant?.id;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'x-tenant-id': tenantId || '',
    'Content-Type': 'application/json'
  };

  useEffect(() => {
    if (!token || !tenantId) return;
    fetchGrowthData();
  }, [token, tenantId]);

  const fetchGrowthData = async () => {
    try {
      const [nudgeRes, offersRes, upsellsRes] = await Promise.all([
        fetch('/api/growth/nudges', { headers }),
        fetch('/api/growth/offers/active', { headers }),
        fetch('/api/growth/upsells', { headers })
      ]);

      if (nudgeRes.ok) {
        const data = await nudgeRes.json();
        if (data.hasNudge) setNudge(data.nudge);
      }

      if (offersRes.ok) {
        const data = await offersRes.json();
        setOffers(data.offers || []);
      }

      if (upsellsRes.ok) {
        const data = await upsellsRes.json();
        setUpsells(data.upsells || []);
      }
    } catch (err) {
      console.error('Failed to fetch growth data:', err);
    } finally {
      setLoading(false);
    }
  };

  const dismissNudge = async () => {
    if (!nudge) return;
    try {
      await fetch('/api/growth/nudges/dismiss', {
        method: 'POST',
        headers,
        body: JSON.stringify({ nudgeType: nudge.nudgeType })
      });
      setDismissedNudge(true);
    } catch (err) {
      console.error('Failed to dismiss nudge:', err);
    }
  };

  const acceptUpsell = async (upsellId: string) => {
    try {
      const res = await fetch(`/api/growth/upsells/${upsellId}/accept`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        setUpsells(prev => prev.filter(u => u.id !== upsellId));
        alert('Thank you! We will contact you shortly.');
      }
    } catch (err) {
      console.error('Failed to accept upsell:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6" data-testid="growth-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="growth-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Growth Center</h1>
          <p className="text-muted-foreground">Special offers, upgrades, and referral opportunities</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild data-testid="link-referrals">
            <Link href="/dashboard/growth/referrals">
              <TrendingUp className="h-4 w-4 mr-2" />
              Referrals
            </Link>
          </Button>
          <Button variant="outline" asChild data-testid="link-analytics">
            <Link href="/dashboard/growth/analytics">
              <TrendingUp className="h-4 w-4 mr-2" />
              Analytics
            </Link>
          </Button>
        </div>
      </div>

      {nudge && !dismissedNudge && (
        <Card className="border-primary/50 bg-primary/5" data-testid="nudge-banner">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Bell className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{nudge.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => router.push(nudge.targetRoute)} data-testid="button-nudge-cta">
                  {nudge.ctaLabel}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={dismissNudge}
                  data-testid="button-dismiss-nudge"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {offers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Active Offers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {offers.map((offer) => (
              <Card key={offer.id} className="border-green-500/50" data-testid={`offer-card-${offer.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-green-500" />
                      {offer.name}
                    </CardTitle>
                    <Badge variant="destructive" className="flex items-center gap-1" data-testid={`badge-offer-timer-${offer.id}`}>
                      <Clock className="h-3 w-3" />
                      {formatTimeRemaining(offer.timeRemaining)}
                    </Badge>
                  </div>
                  <CardDescription>{offer.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {offer.discountPercent}% OFF
                    </div>
                    <Button asChild data-testid={`button-claim-offer-${offer.id}`}>
                      <Link href="/dashboard/billing">
                        Claim Offer
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {upsells.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="h-5 w-5" />
            Recommended Upgrades
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upsells.map((upsell) => (
              <Card key={upsell.id} data-testid={`upsell-card-${upsell.id}`}>
                <CardHeader>
                  <CardTitle>{upsell.title}</CardTitle>
                  <CardDescription>{upsell.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-2xl font-bold">{upsell.price}</div>
                  <ul className="space-y-2">
                    {upsell.value.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className="w-full" 
                    onClick={() => acceptUpsell(upsell.id)}
                    data-testid={`button-accept-upsell-${upsell.id}`}
                  >
                    {upsell.ctaLabel}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!nudge && offers.length === 0 && upsells.length === 0 && (
        <Card data-testid="no-offers-card">
          <CardContent className="pt-6 text-center">
            <Gift className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium">No Active Offers</p>
            <p className="text-muted-foreground">
              Check back later for special promotions and upgrade opportunities.
            </p>
            <div className="mt-4">
              <Button variant="outline" asChild data-testid="link-start-referrals">
                <Link href="/dashboard/growth/referrals">
                  Start Earning with Referrals
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
