"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, UserCircle, Users, ShoppingCart, Copy, ExternalLink, AlertCircle, Clock, XCircle, CheckCircle, Rocket, ArrowRight } from "lucide-react";
import Link from "next/link";

interface PreviewSession {
  id: string;
  token: string;
  previewUrl: string;
  role: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'revoked';
  hoursRemaining: number;
  createdAt: string;
}

interface NewSession {
  previewUrl: string;
  token: string;
  role: string;
  expiresAt: string;
}

export default function PreviewPage() {
  const { token, currentTenant, currentRole } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [newSession, setNewSession] = useState<NewSession | null>(null);
  const [sessions, setSessions] = useState<PreviewSession[]>([]);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const canManage = currentRole === 'owner' || currentRole === 'admin';

  const fetchSessions = useCallback(async () => {
    if (!token || !currentTenant) return;
    try {
      const res = await fetch("/api/preview/sessions", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant.id,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setSessions(json.sessions || []);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  }, [token, currentTenant]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createPreview = async () => {
    if (!token || !currentTenant) return;
    setCreating(true);
    try {
      const res = await fetch("/api/preview/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant.id,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: selectedRole }),
      });
      if (res.ok) {
        const json = await res.json();
        setNewSession({
          previewUrl: json.previewUrl,
          token: json.token,
          role: json.role,
          expiresAt: json.expiresAt
        });
        fetchSessions();
      }
    } catch (err) {
      console.error("Failed to create preview:", err);
    } finally {
      setCreating(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    if (!token || !currentTenant) return;
    setRevoking(sessionId);
    try {
      const res = await fetch(`/api/preview/revoke/${sessionId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant.id,
        },
      });
      if (res.ok) {
        fetchSessions();
      }
    } catch (err) {
      console.error("Failed to revoke session:", err);
    } finally {
      setRevoking(null);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(window.location.origin + url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-600" data-testid="badge-status-active"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case 'expired':
        return <Badge variant="secondary" data-testid="badge-status-expired"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
      case 'revoked':
        return <Badge variant="destructive" data-testid="badge-status-revoked"><XCircle className="h-3 w-3 mr-1" />Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Live Preview Mode</h1>
          <p className="text-muted-foreground">Create and manage shareable preview links for your platform</p>
        </div>

        <Card className="bg-primary text-primary-foreground border-primary">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-foreground/10 flex items-center justify-center">
                  <Rocket className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Ready to go live?</h3>
                  <p className="text-primary-foreground/80 text-sm">
                    Shared previews with your team? Time to launch your platform.
                  </p>
                </div>
              </div>
              <Link href="/dashboard/deploy">
                <Button variant="secondary" size="lg" data-testid="button-go-live-cta">
                  Go Live
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Create Preview Link
              </CardTitle>
              <CardDescription>
                Generate a shareable preview link to demo your platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">View as Role</label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <UserCircle className="h-4 w-4" />
                          Admin - Full access
                        </div>
                      </SelectItem>
                      <SelectItem value="staff">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Staff - Limited access
                        </div>
                      </SelectItem>
                      <SelectItem value="customer">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="h-4 w-4" />
                          Customer - Read-only
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={createPreview} disabled={creating} data-testid="button-create-preview">
                  {creating ? "Creating..." : "Create Live Preview"}
                </Button>
              </div>

              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-600">Preview Mode Restrictions</p>
                    <ul className="mt-1 text-muted-foreground list-disc list-inside">
                      <li>Cannot send real emails or SMS</li>
                      <li>Cannot process real payments</li>
                      <li>All data is clearly marked as &quot;Demo&quot;</li>
                      <li>Links expire after 24 hours</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Only owners and admins can create preview links.</p>
              <p className="text-sm text-muted-foreground mt-2">Contact an administrator if you need a preview link.</p>
            </CardContent>
          </Card>
        )}

        {newSession && (
          <Card className="border-green-500/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Preview Created
                </span>
                <Badge variant="outline">Expires in 24 hours</Badge>
              </CardTitle>
              <CardDescription>
                Share this link with anyone to let them preview your platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm break-all" data-testid="text-preview-url">
                  {typeof window !== 'undefined' ? window.location.origin : ''}{newSession.previewUrl}
                </code>
                <Button variant="outline" size="icon" onClick={() => copyLink(newSession.previewUrl)} data-testid="button-copy-link">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={newSession.previewUrl} target="_blank" rel="noopener noreferrer" data-testid="link-open-preview">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              {copied && <p className="text-sm text-green-600">Link copied to clipboard!</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Preview Sessions
            </CardTitle>
            <CardDescription>
              Manage your active and past preview sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No preview sessions yet</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4" data-testid={`session-${session.id}`}>
                    <div className="flex items-center gap-3">
                      {getRoleIcon(session.role)}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium capitalize">{session.role}</span>
                          {getStatusBadge(session.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {session.status === 'active' 
                            ? `Expires in ${session.hoursRemaining} hour${session.hoursRemaining !== 1 ? 's' : ''}`
                            : `Created ${new Date(session.createdAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      {session.status === 'active' && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => copyLink(session.previewUrl)} data-testid={`button-copy-${session.id}`}>
                            <Copy className="h-4 w-4 mr-1" />
                            Copy
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a href={session.previewUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-open-${session.id}`}>
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Open
                            </a>
                          </Button>
                          {canManage && (
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              onClick={() => revokeSession(session.id)}
                              disabled={revoking === session.id}
                              data-testid={`button-revoke-${session.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              {revoking === session.id ? 'Revoking...' : 'Revoke'}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
