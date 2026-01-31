"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Clock, Eye, Users, ShoppingCart, UserCircle, Activity, DollarSign } from "lucide-react";

interface PreviewData {
  valid: boolean;
  role: string;
  tenantId: string;
  tenantName: string;
  expiresAt: string;
  hoursRemaining: number;
  isDemo: boolean;
  restrictions: {
    canSendEmails: boolean;
    canSendSms: boolean;
    canProcessPayments: boolean;
    canModifyData: boolean;
  };
}

interface DemoData {
  users: { id: string; name: string; email: string; role: string; isDemo: boolean }[];
  stats: { totalUsers: number; activeModules: number; recentOrders: number; revenue: string; isDemo: boolean };
  recentActivity: { type: string; message: string; time: string; isDemo: boolean }[];
}

type ErrorCode = 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' | 'UNKNOWN';

export default function PublicPreviewPage() {
  const params = useParams();
  const token = params.token as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code: ErrorCode } | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [demoData, setDemoData] = useState<DemoData | null>(null);

  useEffect(() => {
    if (!token) return;
    
    const validateAndFetch = async () => {
      try {
        const validateRes = await fetch(`/api/preview/validate?token=${token}`);
        if (!validateRes.ok) {
          const errData = await validateRes.json();
          setError({ 
            message: errData.error || 'Preview session invalid', 
            code: errData.code || 'UNKNOWN' 
          });
          setLoading(false);
          return;
        }
        
        const preview = await validateRes.json();
        setPreviewData(preview);
        
        const demoRes = await fetch(`/api/preview/demo-data?token=${token}`);
        if (demoRes.ok) {
          const demo = await demoRes.json();
          setDemoData(demo.data);
        }
      } catch (err) {
        setError({ message: 'Failed to load preview', code: 'UNKNOWN' });
      } finally {
        setLoading(false);
      }
    };
    
    validateAndFetch();
  }, [token]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <UserCircle className="h-5 w-5" />;
      case "staff":
        return <Users className="h-5 w-5" />;
      case "customer":
        return <ShoppingCart className="h-5 w-5" />;
      default:
        return <Eye className="h-5 w-5" />;
    }
  };

  const getErrorMessage = (code: ErrorCode) => {
    switch (code) {
      case 'EXPIRED':
        return {
          title: 'Preview Expired',
          description: 'This preview link has expired. Ask an admin for a new preview link.',
          icon: <Clock className="h-12 w-12 text-amber-500" />
        };
      case 'REVOKED':
        return {
          title: 'Preview Revoked',
          description: 'This preview link has been revoked by an administrator.',
          icon: <AlertCircle className="h-12 w-12 text-red-500" />
        };
      case 'NOT_FOUND':
        return {
          title: 'Preview Not Found',
          description: 'This preview link is invalid or does not exist.',
          icon: <AlertCircle className="h-12 w-12 text-muted-foreground" />
        };
      default:
        return {
          title: 'Preview Unavailable',
          description: 'Unable to load this preview. Please try again later.',
          icon: <AlertCircle className="h-12 w-12 text-muted-foreground" />
        };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorInfo = getErrorMessage(error.code);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              {errorInfo.icon}
            </div>
            <CardTitle data-testid="text-error-title">{errorInfo.title}</CardTitle>
            <CardDescription data-testid="text-error-description">
              {errorInfo.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => window.location.href = '/'} data-testid="button-go-home">
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!previewData) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            <span className="font-semibold" data-testid="text-demo-banner">
              DEMO / PREVIEW MODE
            </span>
            <Badge variant="secondary" className="bg-amber-600 text-white border-0">
              {previewData.tenantName}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            <span data-testid="text-expires-countdown">
              Expires in {previewData.hoursRemaining} hour{previewData.hoursRemaining !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-tenant-name">{previewData.tenantName}</h1>
            <p className="text-muted-foreground">Preview Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            {getRoleIcon(previewData.role)}
            <Badge variant="outline" data-testid="badge-role">
              Viewing as {previewData.role.charAt(0).toUpperCase() + previewData.role.slice(1)}
            </Badge>
          </div>
        </div>

        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-700">Preview Mode Restrictions</p>
                <ul className="mt-1 text-muted-foreground list-disc list-inside space-y-1">
                  <li>All data shown is demo/sample data</li>
                  <li>Email and SMS notifications are disabled</li>
                  <li>Payment processing is disabled</li>
                  <li>Write operations are blocked</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {demoData && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold" data-testid="stat-users">{demoData.stats.totalUsers}</p>
                  <p className="text-sm text-muted-foreground">Users</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold" data-testid="stat-modules">{demoData.stats.activeModules}</p>
                  <p className="text-sm text-muted-foreground">Modules</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold" data-testid="stat-orders">{demoData.stats.recentOrders}</p>
                  <p className="text-sm text-muted-foreground">Orders</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold" data-testid="stat-revenue">{demoData.stats.revenue}</p>
                  <p className="text-sm text-muted-foreground">Revenue</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Demo Users
                  <Badge variant="secondary">Sample Data</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {demoData.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      {getRoleIcon(user.role)}
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline">{user.role}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                  <Badge variant="secondary">Sample Data</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {demoData.recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                    <p className="text-sm">{activity.message}</p>
                    <span className="text-sm text-muted-foreground whitespace-nowrap ml-2">{activity.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        <div className="text-center text-sm text-muted-foreground py-8">
          <p>This is a read-only preview. Forms and actions are disabled.</p>
          <p className="mt-1">
            Expires: {new Date(previewData.expiresAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
