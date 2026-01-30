'use client';

import { useState, useEffect } from 'react';
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
  ArrowRight,
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

export default function MarketplacePage() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    fetchItems();
  }, [typeFilter]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('type', typeFilter);
      
      const res = await fetch(`/api/marketplace/items?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(searchLower) ||
      item.shortDesc.toLowerCase().includes(searchLower) ||
      item.tags.some(t => t.toLowerCase().includes(searchLower))
    );
  });

  const formatPrice = (priceCents: number, currency: string) => {
    if (priceCents === 0) return 'Free';
    const price = priceCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(price);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-b from-primary/10 to-background py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <Store className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-4xl font-bold mb-4" data-testid="text-marketplace-title">Marketplace</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Browse templates and add-ons to supercharge your digital platform
            </p>
          </div>

          <div className="max-w-2xl mx-auto flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                placeholder="Search templates and add-ons..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="flex gap-2 mb-8 justify-center">
          <Button
            variant={typeFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setTypeFilter('all')}
            data-testid="button-filter-all"
          >
            <Filter className="w-4 h-4 mr-2" />
            All
          </Button>
          <Button
            variant={typeFilter === 'template' ? 'default' : 'outline'}
            onClick={() => setTypeFilter('template')}
            data-testid="button-filter-template"
          >
            <Package className="w-4 h-4 mr-2" />
            Templates
          </Button>
          <Button
            variant={typeFilter === 'addon' ? 'default' : 'outline'}
            onClick={() => setTypeFilter('addon')}
            data-testid="button-filter-addon"
          >
            <Puzzle className="w-4 h-4 mr-2" />
            Add-ons
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-semibold mb-2">No items found</h2>
            <p className="text-muted-foreground">
              {search ? 'Try a different search term' : 'Check back soon for new templates and add-ons'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map(item => (
              <Card key={item.id} className="hover-elevate transition-all" data-testid={`card-item-${item.slug}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {item.type === 'template' ? (
                          <Package className="w-5 h-5 text-primary" />
                        ) : (
                          <Puzzle className="w-5 h-5 text-primary" />
                        )}
                        {item.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        v{item.version}
                      </CardDescription>
                    </div>
                    <Badge variant={item.isFree ? 'secondary' : 'default'}>
                      {formatPrice(item.priceCents, item.currency)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4 line-clamp-2">
                    {item.shortDesc}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {item.tags.slice(0, 3).map(tag => (
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
                  <Link href={`/marketplace/${item.slug}`}>
                    <Button className="w-full" variant="outline" data-testid={`button-view-${item.slug}`}>
                      View Details
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="bg-muted/50 py-16 mt-8">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-muted-foreground mb-6">
            Sign in to install templates and add-ons to your platform
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/login">
              <Button data-testid="button-signin">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" data-testid="button-register">Create Account</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
