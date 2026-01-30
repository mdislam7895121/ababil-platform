'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  Users, 
  Gift, 
  Bell,
  Package,
  BarChart3,
  Activity
} from 'lucide-react';

interface AnalyticsData {
  period: string;
  referrals: {
    totalClicks: number;
    totalSignups: number;
    totalConversions: number;
    conversionRate: number;
  } | null;
  nudges: {
    shown: number;
    dismissed: number;
    ctr: number;
  };
  offers: {
    redeemed: number;
  };
  upsells: {
    shown: number;
    accepted: number;
    acceptanceRate: number;
  };
  recentEvents: Array<{
    id: string;
    eventType: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

const eventTypeLabels: Record<string, string> = {
  referral_created: 'Referral Created',
  nudge_shown: 'Nudge Shown',
  nudge_dismissed: 'Nudge Dismissed',
  offer_redeemed: 'Offer Redeemed',
  upsells_shown: 'Upsells Shown',
  upsell_accepted: 'Upsell Accepted'
};

const eventTypeColors: Record<string, string> = {
  referral_created: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  nudge_shown: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  nudge_dismissed: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  offer_redeemed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  upsells_shown: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  upsell_accepted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
};

export default function GrowthAnalyticsPage() {
  const { token, currentTenant } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const tenantId = currentTenant?.id;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'x-tenant-id': tenantId || ''
  };

  useEffect(() => {
    if (!token || !tenantId) return;
    fetchAnalytics();
  }, [token, tenantId]);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/growth/analytics', { headers });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6" data-testid="analytics-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="analytics-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Growth Analytics</h1>
          <p className="text-muted-foreground">Track referrals, nudges, offers, and upsells</p>
        </div>
        <Badge variant="outline" className="text-sm" data-testid="badge-period">
          <Activity className="h-3 w-3 mr-1" />
          Last 30 days
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-events">Recent Events</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-referral-rate">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Referral Conversion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {analytics?.referrals?.conversionRate || 0}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {analytics?.referrals?.totalConversions || 0} of {analytics?.referrals?.totalSignups || 0} signups
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-nudge-ctr">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Nudge CTR
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {analytics?.nudges.ctr || 0}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {analytics?.nudges.shown || 0} shown, {analytics?.nudges.dismissed || 0} dismissed
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-offers-redeemed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  Offers Redeemed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {analytics?.offers.redeemed || 0}
                </p>
                <p className="text-sm text-muted-foreground">
                  Total redemptions
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-upsell-rate">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Upsell Acceptance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {analytics?.upsells.acceptanceRate || 0}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {analytics?.upsells.accepted || 0} of {analytics?.upsells.shown || 0} shown
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card data-testid="card-referrals-detail">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Referral Funnel
                </CardTitle>
                <CardDescription>Track referral performance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Link Clicks</span>
                    <span className="font-bold">{analytics?.referrals?.totalClicks || 0}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Signups</span>
                    <span className="font-bold">{analytics?.referrals?.totalSignups || 0}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full" 
                      style={{ 
                        width: `${analytics?.referrals?.totalClicks 
                          ? (analytics.referrals.totalSignups / analytics.referrals.totalClicks) * 100 
                          : 0}%` 
                      }}
                    ></div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Paid Conversions</span>
                    <span className="font-bold">{analytics?.referrals?.totalConversions || 0}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-purple-500 h-2 rounded-full" 
                      style={{ 
                        width: `${analytics?.referrals?.totalSignups 
                          ? (analytics.referrals.totalConversions / analytics.referrals.totalSignups) * 100 
                          : 0}%` 
                      }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-growth-summary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Growth Summary
                </CardTitle>
                <CardDescription>Key metrics at a glance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-blue-500" />
                      <span>Total Referral Signups</span>
                    </div>
                    <Badge>{analytics?.referrals?.totalSignups || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-yellow-500" />
                      <span>Nudges Displayed</span>
                    </div>
                    <Badge>{analytics?.nudges.shown || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Gift className="h-5 w-5 text-green-500" />
                      <span>Offers Used</span>
                    </div>
                    <Badge>{analytics?.offers.redeemed || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-purple-500" />
                      <span>Upsells Accepted</span>
                    </div>
                    <Badge>{analytics?.upsells.accepted || 0}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="events">
          <Card data-testid="card-recent-events">
            <CardHeader>
              <CardTitle>Recent Growth Events</CardTitle>
              <CardDescription>Latest activity from the growth system</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics?.recentEvents && analytics.recentEvents.length > 0 ? (
                <div className="space-y-2">
                  {analytics.recentEvents.map((event) => (
                    <div 
                      key={event.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={eventTypeColors[event.eventType] || 'bg-gray-100'}>
                          {eventTypeLabels[event.eventType] || event.eventType}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {Object.keys(event.metadata as Record<string, unknown>).length > 0 && (
                            <code className="text-xs">
                              {JSON.stringify(event.metadata).slice(0, 50)}
                              {JSON.stringify(event.metadata).length > 50 ? '...' : ''}
                            </code>
                          )}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No growth events yet</p>
                  <p className="text-sm">Events will appear here as users interact with growth features</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
