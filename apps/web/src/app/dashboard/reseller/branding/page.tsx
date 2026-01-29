"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Save, Upload, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Reseller {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor?: string;
  showPoweredBy: boolean;
}

export default function ResellerBrandingPage() {
  const { token, currentTenant } = useAuth();
  const tenantId = currentTenant?.id || "";
  const { toast } = useToast();

  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    logoUrl: "",
    primaryColor: "#3B82F6",
    secondaryColor: "",
    showPoweredBy: true,
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      try {
        const res = await fetch("/api/resellers/my", {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-tenant-id": tenantId,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setReseller(data.reseller);
          setFormData({
            logoUrl: data.reseller.logoUrl || "",
            primaryColor: data.reseller.primaryColor || "#3B82F6",
            secondaryColor: data.reseller.secondaryColor || "",
            showPoweredBy: data.reseller.showPoweredBy ?? true,
          });
        }
      } catch (err) {
        console.error("Failed to fetch reseller:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, tenantId]);

  const handleSave = async () => {
    if (!reseller) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/resellers/${reseller.id}/branding`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          logoUrl: formData.logoUrl || null,
          primaryColor: formData.primaryColor,
          secondaryColor: formData.secondaryColor || null,
          showPoweredBy: formData.showPoweredBy,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update branding");
      }

      toast({ title: "Success", description: "Branding settings updated" });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  if (!reseller) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Not a reseller account.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <a href="/dashboard/reseller" data-testid="link-back">
            <ArrowLeft className="h-4 w-4" />
          </a>
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Branding Settings</h1>
          <p className="text-muted-foreground">Customize your white-label appearance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Brand Colors</CardTitle>
            <CardDescription>Your custom color scheme for the platform</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primaryColor"
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="w-14 h-10 p-1"
                  data-testid="input-primary-color"
                />
                <Input
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for buttons, links, and accent elements
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Secondary Color (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="secondaryColor"
                  type="color"
                  value={formData.secondaryColor || "#6366F1"}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  className="w-14 h-10 p-1"
                  data-testid="input-secondary-color"
                />
                <Input
                  value={formData.secondaryColor}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  placeholder="#6366F1"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for secondary actions and backgrounds
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo & Branding</CardTitle>
            <CardDescription>Your company logo and branding options</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                value={formData.logoUrl}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
                data-testid="input-logo-url"
              />
              <p className="text-xs text-muted-foreground">
                URL to your company logo (PNG or SVG recommended)
              </p>
            </div>

            {formData.logoUrl && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Preview:</p>
                <img
                  src={formData.logoUrl}
                  alt="Logo preview"
                  className="h-12 object-contain"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label htmlFor="showPoweredBy" className="font-medium">
                  "Powered By" Badge
                </Label>
                <p className="text-xs text-muted-foreground">
                  Show "Powered by Platform Factory" in the footer
                </p>
              </div>
              <Switch
                id="showPoweredBy"
                checked={formData.showPoweredBy}
                onCheckedChange={(checked) => setFormData({ ...formData, showPoweredBy: checked })}
                data-testid="switch-powered-by"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>See how your branding will look</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="p-6 rounded-lg border"
            style={{ borderColor: formData.primaryColor }}
          >
            <div className="flex items-center gap-4 mb-4">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo" className="h-8 object-contain" />
              ) : (
                <div
                  className="h-8 w-8 rounded flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: formData.primaryColor }}
                >
                  {reseller.name.charAt(0)}
                </div>
              )}
              <span className="font-bold">{reseller.name}</span>
            </div>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded text-white text-sm"
                style={{ backgroundColor: formData.primaryColor }}
              >
                Primary Button
              </button>
              {formData.secondaryColor && (
                <button
                  className="px-4 py-2 rounded text-white text-sm"
                  style={{ backgroundColor: formData.secondaryColor }}
                >
                  Secondary Button
                </button>
              )}
            </div>
            {formData.showPoweredBy && (
              <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
                Powered by Platform Factory
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} data-testid="button-save">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
