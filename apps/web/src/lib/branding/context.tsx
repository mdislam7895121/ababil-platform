"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface Branding {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor?: string;
  showPoweredBy: boolean;
}

interface BrandingContextType {
  branding: Branding | null;
  isWhiteLabel: boolean;
  loading: boolean;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: null,
  isWhiteLabel: false,
  loading: true,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const detectBranding = async () => {
      try {
        const hostname = typeof window !== "undefined" ? window.location.hostname : "";
        const params = new URLSearchParams();

        if (hostname && !hostname.includes("localhost") && !hostname.includes("replit")) {
          if (hostname.endsWith(".platformfactory.app")) {
            const subdomain = hostname.replace(".platformfactory.app", "");
            if (subdomain && subdomain !== "www") {
              params.set("subdomain", subdomain);
            }
          } else {
            params.set("domain", hostname);
          }
        }

        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          const refSlug = urlParams.get("ref");
          if (refSlug) {
            params.set("slug", refSlug);
          }
        }

        if (params.toString()) {
          const res = await fetch(`/api/resellers/branding/lookup?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (data.branding) {
              setBranding(data.branding);
              applyBrandingStyles(data.branding);
            }
          }
        }
      } catch (err) {
        console.error("Failed to detect branding:", err);
      } finally {
        setLoading(false);
      }
    };

    detectBranding();
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, isWhiteLabel: !!branding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

function applyBrandingStyles(branding: Branding) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  if (branding.primaryColor) {
    const hsl = hexToHSL(branding.primaryColor);
    if (hsl) {
      root.style.setProperty("--primary", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
    }
  }

  if (branding.secondaryColor) {
    const hsl = hexToHSL(branding.secondaryColor);
    if (hsl) {
      root.style.setProperty("--accent", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
    }
  }
}

function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}
