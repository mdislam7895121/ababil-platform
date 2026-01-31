'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Store, 
  Search, 
  Package, 
  Puzzle,
  Star,
  Download,
  Check,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  Filter
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
  screenshots: string[];
  tags: string[];
  version: string;
  requiredPlan: string;
}

interface Install {
  id: string;
  tenantId: string;
  itemId: string;
  installedVersion: string;
  status: string;
  installedAt: string;
  lastError: string | null;
  item: {
    id: string;
    slug: string;
    name: string;
    type: string;
    version: string;
    shortDesc: string;
  };
}

export default function DashboardMarketplacePage() {
  const { token, currentTenant } = useAuth();
  const router = useRouter();
  
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [installs, setInstalls] = useState<Install[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [installing, setInstalling] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      const [itemsRes, installsRes] = await Promise.all([
        fetch('/api/marketplace/items'),
        fetch('/api/marketplace/installs', { headers })
      ]);

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data.items || []);
      }

      if (installsRes.ok) {
        const data = await installsRes.json();
        setInstalls(data.installs || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getInstallStatus = (itemId: string) => {
    const install = installs.find(i => i.itemId === itemId && i.status === 'installed');
    return install;
  };

  const handleInstall = async (slug: string) => {
    setInstalling(slug);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/marketplace/install/${slug}`, {
        method: 'POST',
        headers
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`Successfully installed ${data.item.name}`);
        fetchData();
      } else {
        setError(data.error || 'Installation failed');
      }
    } catch (err) {
      setError('Failed to install item');
    } finally {
      setInstalling(null);
    }
  };

  const handleRollback = async (installId: string) => {
    setRollingBack(installId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/marketplace/rollback/${installId}`, {
        method: 'POST',
        headers
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Successfully rolled back installation');
        fetchData();
      } else {
        setError(data.error || 'Rollback failed');
      }
    } catch (err) {
      setError('Failed to rollback');
    } finally {
      setRollingBack(null);
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

  const filteredItems = items.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(searchLower) ||
      item.shortDesc.toLowerCase().includes(searchLower) ||
      item.tags.some(t => t.toLowerCase().includes(searchLower))
    );
  });

  const installedItems = installs.filter(i => i.status === 'installed');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Store className="w-8 h-8 text-primary" />
            Marketplace
          </h1>
          <p className="text-muted-foreground mt-1">
            Install templates and add-ons to enhance your platform
          </p>
        </div>
        <Link href="/marketplace" target="_blank">
          <Button variant="outline" data-testid="button-browse-public">
            <ExternalLink className="w-4 h-4 mr-2" />
            Browse Public Marketplace
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <span className="text-destructive" data-testid="text-error">{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto">
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-green-500 bg-green-500/10">
          <CardContent className="py-4 flex items-center gap-2">
            <Check className="w-5 h-5 text-green-500" />
            <span className="text-green-700 dark:text-green-300" data-testid="text-success">{success}</span>
            <Button variant="ghost" size="sm" onClick={() => setSuccess(null)} className="ml-auto">
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {installedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Installed ({installedItems.length})
            </CardTitle>
            <CardDescription>
              Items currently installed on your platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {installedItems.map(install => (
                <Card key={install.id} className="bg-muted/50" data-testid={`card-installed-${install.item.slug}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {install.item.type === 'template' ? (
                          <Package className="w-5 h-5 text-primary" />
                        ) : (
                          <Puzzle className="w-5 h-5 text-primary" />
                        )}
                        <div>
                          <p className="font-medium">{install.item.name}</p>
                          <p className="text-sm text-muted-foreground">v{install.installedVersion}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                        <Check className="w-3 h-3 mr-1" />
                        Installed
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {install.item.shortDesc}
                    </p>
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRollback(install.id)}
                        disabled={rollingBack === install.id}
                        data-testid={`button-rollback-${install.item.slug}`}
                      >
                        {rollingBack === install.id ? (
                          <>Rolling back...</>
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Rollback
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Available Items</CardTitle>
          <CardDescription>
            Browse and install templates and add-ons
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={typeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter('all')}
                data-testid="button-filter-all"
              >
                All
              </Button>
              <Button
                variant={typeFilter === 'template' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter('template')}
                data-testid="button-filter-template"
              >
                Templates
              </Button>
              <Button
                variant={typeFilter === 'addon' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter('addon')}
                data-testid="button-filter-addon"
              >
                Add-ons
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-4">
                    <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/2 mb-4" />
                    <div className="h-16 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map(item => {
                const installStatus = getInstallStatus(item.id);
                const isInstalled = !!installStatus;

                return (
                  <Card key={item.id} className="hover-elevate" data-testid={`card-item-${item.slug}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {item.type === 'template' ? (
                            <Package className="w-5 h-5 text-primary" />
                          ) : (
                            <Puzzle className="w-5 h-5 text-primary" />
                          )}
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">v{item.version}</p>
                          </div>
                        </div>
                        <Badge variant={item.isFree ? 'secondary' : 'default'}>
                          {formatPrice(item.priceCents, item.currency)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {item.shortDesc}
                      </p>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {item.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {item.requiredPlan !== 'free' && (
                          <Badge variant="secondary" className="text-xs">
                            <Star className="w-3 h-3 mr-1" />
                            {item.requiredPlan}+
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {isInstalled ? (
                          <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                            <Check className="w-3 h-3 mr-1" />
                            Installed
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleInstall(item.slug)}
                            disabled={installing === item.slug}
                            data-testid={`button-install-${item.slug}`}
                          >
                            {installing === item.slug ? (
                              <>Installing...</>
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-1" />
                                Install
                              </>
                            )}
                          </Button>
                        )}
                        <Link href={`/marketplace/${item.slug}`} target="_blank">
                          <Button variant="outline" size="sm" data-testid={`button-details-${item.slug}`}>
                            Details
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
