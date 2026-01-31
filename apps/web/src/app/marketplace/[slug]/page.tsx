'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Store, 
  Package, 
  Puzzle,
  Star,
  ArrowLeft,
  Download,
  Check,
  Users,
  Clock
} from 'lucide-react';
import Link from 'next/link';

interface MarketplaceItem {
  id: string;
  slug: string;
  name: string;
  type: string;
  priceCents: number;
  currency: string;
  isFree: boolean;
  shortDesc: string;
  longDesc: string;
  screenshots: string[];
  tags: string[];
  version: string;
  requiredPlan: string;
  installSpec: Record<string, unknown>;
  installCount: number;
  createdAt: string;
}

export default function MarketplaceItemPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      fetchItem();
    }
  }, [slug]);

  const fetchItem = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/marketplace/items/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
      } else if (res.status === 404) {
        setError('Item not found');
      } else {
        setError('Failed to load item');
      }
    } catch (err) {
      console.error('Failed to fetch item:', err);
      setError('Failed to load item');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (priceCents: number, currency: string) => {
    if (priceCents === 0) return 'Free';
    const price = priceCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(price);
  };

  const getInstallSpecSummary = (installSpec: Record<string, unknown>) => {
    const summary: string[] = [];
    if (installSpec.modules && Array.isArray(installSpec.modules)) {
      summary.push(`${installSpec.modules.length} module(s)`);
    }
    if (installSpec.connectors && Array.isArray(installSpec.connectors)) {
      summary.push(`${installSpec.connectors.length} connector(s)`);
    }
    if (installSpec.presets && Array.isArray(installSpec.presets)) {
      summary.push(`${installSpec.presets.length} preset(s)`);
    }
    if (installSpec.sampleData) {
      summary.push('Sample data included');
    }
    return summary;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/4 mb-4" />
            <div className="h-12 bg-muted rounded w-1/2 mb-4" />
            <div className="h-6 bg-muted rounded w-3/4 mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="h-64 bg-muted rounded" />
              </div>
              <div>
                <div className="h-48 bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Item not found</h1>
          <p className="text-muted-foreground mb-4">{error || 'The item you are looking for does not exist'}</p>
          <Link href="/marketplace">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketplace
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const installSummary = getInstallSpecSummary(item.installSpec);

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-b from-primary/10 to-background py-8">
        <div className="container mx-auto px-4">
          <Link href="/marketplace" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Marketplace
          </Link>
          
          <div className="flex items-start gap-4">
            <div className="p-4 bg-primary/10 rounded-lg">
              {item.type === 'template' ? (
                <Package className="w-12 h-12 text-primary" />
              ) : (
                <Puzzle className="w-12 h-12 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">{item.type}</Badge>
                <Badge variant="secondary">v{item.version}</Badge>
                {item.requiredPlan !== 'free' && (
                  <Badge>
                    <Star className="w-3 h-3 mr-1" />
                    {item.requiredPlan}+ required
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-item-name">{item.name}</h1>
              <p className="text-xl text-muted-foreground" data-testid="text-item-desc">{item.shortDesc}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold mb-2" data-testid="text-item-price">
                {formatPrice(item.priceCents, item.currency)}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-4 justify-end">
                <span className="flex items-center gap-1">
                  <Download className="w-4 h-4" />
                  {item.installCount} installs
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="text-long-desc">
                  {item.longDesc.split('\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              </CardContent>
            </Card>

            {installSummary.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>What&apos;s Included</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {installSummary.map((item, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="w-5 h-5 text-green-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map(tag => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Install</CardTitle>
                <CardDescription>
                  Sign in to install this {item.type}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Link href="/login">
                  <Button className="w-full" size="lg" data-testid="button-install-signin">
                    Sign In to Install
                  </Button>
                </Link>
                <p className="text-sm text-muted-foreground text-center">
                  Don&apos;t have an account?{' '}
                  <Link href="/register" className="text-primary hover:underline">
                    Create one
                  </Link>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Requirements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <Badge variant={item.requiredPlan === 'free' ? 'secondary' : 'default'}>
                    {item.requiredPlan === 'free' ? 'Any plan' : `${item.requiredPlan}+`}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span>{item.version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">{formatPrice(item.priceCents, item.currency)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
