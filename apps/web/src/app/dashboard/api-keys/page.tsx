"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Copy, Key, Plus, RefreshCw, Trash2, Shield, Clock, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ApiKeyScope {
  scope: string;
  description: string;
}

const AVAILABLE_SCOPES = [
  { scope: "read", description: "Read access to most endpoints" },
  { scope: "builder:write", description: "Write access to builder/draft operations" },
  { scope: "billing:write", description: "Access to billing and payment operations" },
  { scope: "marketplace:install", description: "Install apps from marketplace" },
  { scope: "support:write", description: "Create and manage support tickets" },
  { scope: "admin:write", description: "Administrative operations including security settings" },
];

export default function ApiKeysPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["read"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data: apiKeys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; scopes: string[] }) => {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create API key");
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({ title: "API Key Created", description: "Save this key - it won't be shown again!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create API key", variant: "destructive" });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/api-keys/${id}/rotate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to rotate API key");
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setIsCreateOpen(true);
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({ title: "API Key Rotated", description: "Save the new key - it won't be shown again!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to rotate API key", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/api-keys/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to revoke API key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({ title: "API Key Revoked", description: "The API key has been revoked" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to revoke API key", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) {
      toast({ title: "Error", description: "Please enter a key name", variant: "destructive" });
      return;
    }
    createMutation.mutate({ name: newKeyName, scopes: selectedScopes });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "API key copied to clipboard" });
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const resetCreateDialog = () => {
    setNewKeyName("");
    setSelectedScopes(["read"]);
    setCreatedKey(null);
    setIsCreateOpen(false);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleString();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-title">
            <Key className="h-8 w-8" />
            API Keys
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage API keys for programmatic access to your workspace
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => !open && resetCreateDialog()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-key">
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{createdKey ? "API Key Created" : "Create API Key"}</DialogTitle>
              <DialogDescription>
                {createdKey
                  ? "Copy this key now - it won't be shown again!"
                  : "Create a new API key with specific scopes"}
              </DialogDescription>
            </DialogHeader>

            {createdKey ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg font-mono text-sm break-all flex items-center justify-between gap-2">
                  <span data-testid="text-new-key">{createdKey}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(createdKey)}
                    data-testid="button-copy-key"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-destructive font-medium">
                  This is the only time you will see this key. Save it securely!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="keyName">Key Name</Label>
                  <Input
                    id="keyName"
                    placeholder="e.g., Production Server"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    data-testid="input-key-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Scopes</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {AVAILABLE_SCOPES.map((s) => (
                      <div
                        key={s.scope}
                        className="flex items-center space-x-2 p-2 rounded border hover:bg-muted/50"
                      >
                        <Checkbox
                          id={s.scope}
                          checked={selectedScopes.includes(s.scope)}
                          onCheckedChange={() => toggleScope(s.scope)}
                          data-testid={`checkbox-scope-${s.scope}`}
                        />
                        <div className="flex-1">
                          <Label htmlFor={s.scope} className="font-medium cursor-pointer">
                            {s.scope}
                          </Label>
                          <p className="text-xs text-muted-foreground">{s.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              {createdKey ? (
                <Button onClick={resetCreateDialog} data-testid="button-done">
                  Done
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={resetCreateDialog} data-testid="button-cancel-create">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    data-testid="button-confirm-create"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Key"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            Use these keys to authenticate API requests. Keys can use either{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">Authorization: ApiKey YOUR_KEY</code> or{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">x-api-key: YOUR_KEY</code> headers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading API keys...</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No API keys yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className={`border rounded-lg p-4 ${
                    key.status === "revoked" ? "opacity-60 bg-muted/30" : ""
                  }`}
                  data-testid={`card-api-key-${key.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold" data-testid={`text-key-name-${key.id}`}>
                          {key.name}
                        </h3>
                        <Badge variant={key.status === "active" ? "default" : "destructive"}>
                          {key.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <code className="bg-muted px-2 py-0.5 rounded">{key.keyPrefix}...</code>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            {scope}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last used: {formatDate(key.lastUsedAt)}
                        </span>
                        {key.lastUsedIp && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {key.lastUsedIp}
                          </span>
                        )}
                      </div>
                    </div>

                    {key.status === "active" && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rotateMutation.mutate(key.id)}
                          disabled={rotateMutation.isPending}
                          data-testid={`button-rotate-${key.id}`}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Rotate
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              data-testid={`button-revoke-${key.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will immediately invalidate the API key. Any applications using
                                this key will stop working.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel data-testid={`button-cancel-revoke-${key.id}`}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => revokeMutation.mutate(key.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                data-testid={`button-confirm-revoke-${key.id}`}
                              >
                                Revoke Key
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available Scopes</CardTitle>
          <CardDescription>
            API keys can be restricted to specific operations using scopes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AVAILABLE_SCOPES.map((s) => (
              <div key={s.scope} className="flex items-start gap-3 p-3 border rounded-lg">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <div className="font-medium">{s.scope}</div>
                  <div className="text-sm text-muted-foreground">{s.description}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
