'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Users, 
  Gift, 
  TrendingUp, 
  Copy, 
  Check,
  Share2,
  DollarSign,
  UserPlus
} from 'lucide-react';

interface ReferralStats {
  clicks: number;
  signups: number;
  conversions: number;
  rewardsEarned: number;
}

interface ReferralData {
  referralCode: string;
  referralLink: string;
  stats: ReferralStats;
  recentSignups: Array<{
    id: string;
    convertedToPaid: boolean;
    discountApplied: number;
    createdAt: string;
  }>;
  rewards: {
    referrerReward: string;
    referredDiscount: string;
  };
}

export default function ReferralsPage() {
  const { token, currentTenant } = useAuth();
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  
  const tenantId = currentTenant?.id;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'x-tenant-id': tenantId || ''
  };

  useEffect(() => {
    if (!token || !tenantId) return;
    fetchReferralStatus();
  }, [token, tenantId]);

  const fetchReferralStatus = async () => {
    try {
      const res = await fetch('/api/growth/referral/status', { headers });
      if (res.ok) {
        const data = await res.json();
        setReferralData(data);
      }
    } catch (err) {
      console.error('Failed to fetch referral status:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!referralData?.referralLink) return;
    try {
      await navigator.clipboard.writeText(referralData.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6" data-testid="referrals-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="referrals-page">
      <div>
        <h1 className="text-2xl font-bold">Referral Program</h1>
        <p className="text-muted-foreground">Earn rewards by inviting others to the platform</p>
      </div>

      <Card data-testid="referral-link-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Your Referral Link
          </CardTitle>
          <CardDescription>Share this link to earn rewards when friends sign up</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              value={referralData?.referralLink || ''} 
              readOnly 
              className="font-mono text-sm"
              data-testid="input-referral-link"
            />
            <Button 
              onClick={copyLink} 
              variant="outline"
              data-testid="button-copy-link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">Code: {referralData?.referralCode}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="stat-clicks">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{referralData?.stats.clicks || 0}</p>
                <p className="text-sm text-muted-foreground">Link Clicks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-signups">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                <UserPlus className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{referralData?.stats.signups || 0}</p>
                <p className="text-sm text-muted-foreground">Signups</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-conversions">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{referralData?.stats.conversions || 0}</p>
                <p className="text-sm text-muted-foreground">Paid Conversions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-rewards">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                <Gift className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">${referralData?.stats.rewardsEarned || 0}</p>
                <p className="text-sm text-muted-foreground">Rewards Earned</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card data-testid="rewards-info-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-full text-primary font-bold">1</div>
              <div>
                <p className="font-medium">Share your link</p>
                <p className="text-sm text-muted-foreground">Send your unique referral link to friends</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-full text-primary font-bold">2</div>
              <div>
                <p className="font-medium">They sign up</p>
                <p className="text-sm text-muted-foreground">Your friend creates an account using your link</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-full text-primary font-bold">3</div>
              <div>
                <p className="font-medium">Both get rewarded</p>
                <p className="text-sm text-muted-foreground">When they upgrade, you both earn rewards</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="rewards-structure-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Reward Structure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border rounded-lg">
              <p className="font-medium text-green-600 dark:text-green-400">For You (Referrer)</p>
              <p className="text-lg font-bold">{referralData?.rewards.referrerReward}</p>
              <p className="text-sm text-muted-foreground">per successful referral</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="font-medium text-blue-600 dark:text-blue-400">For Your Friend</p>
              <p className="text-lg font-bold">{referralData?.rewards.referredDiscount}</p>
              <p className="text-sm text-muted-foreground">when they sign up</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {referralData?.recentSignups && referralData.recentSignups.length > 0 && (
        <Card data-testid="recent-signups-card">
          <CardHeader>
            <CardTitle>Recent Signups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {referralData.recentSignups.map((signup) => (
                <div key={signup.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {new Date(signup.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge variant={signup.convertedToPaid ? 'default' : 'secondary'}>
                    {signup.convertedToPaid ? 'Paid' : 'Free'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
