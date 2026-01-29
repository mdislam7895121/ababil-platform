"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";
import {
  LayoutDashboard,
  Users,
  Key,
  Puzzle,
  Plug,
  FileText,
  Bot,
  Settings,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Wand2,
  Rocket,
  CheckCircle,
  Eye,
  DollarSign,
  AlertTriangle,
  Activity,
  MessageCircleQuestion,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/onboarding", label: "Create with Questions", icon: MessageCircleQuestion, highlight: true },
  { href: "/dashboard/builder", label: "Builder", icon: Wand2 },
  { href: "/dashboard/checklist", label: "Go Live Checklist", icon: CheckCircle },
  { href: "/dashboard/preview", label: "Preview", icon: Eye },
  { href: "/dashboard/costs", label: "Cost Estimate", icon: DollarSign },
  { href: "/dashboard/deploy", label: "Deploy", icon: Rocket },
  { href: "/dashboard/revenue", label: "Revenue", icon: TrendingUp, roles: ["owner", "admin"] },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/api-keys", label: "API Keys", icon: Key },
  { href: "/dashboard/modules", label: "Modules", icon: Puzzle },
  { href: "/dashboard/connectors", label: "Connectors", icon: Plug },
  { href: "/dashboard/audit", label: "Audit Logs", icon: FileText },
  { href: "/dashboard/ai", label: "AI Assistant", icon: Bot },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface HealthSummary {
  status: "green" | "yellow" | "red";
  statusLabel: string;
  safeMode: boolean;
  issues: Array<{ level: string; message: string }>;
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, currentTenant, token, logout, currentRole } = useAuth();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNavItems = navItems.filter(item => {
    if ('roles' in item && item.roles) {
      return item.roles.includes(currentRole || '');
    }
    return true;
  });

  const { data: health } = useQuery<HealthSummary>({
    queryKey: ["health-summary", currentTenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/health/status/summary", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-tenant-id": currentTenant?.id || "",
        },
      });
      if (!res.ok) return { status: "green", statusLabel: "Unknown", safeMode: false, issues: [] };
      return res.json();
    },
    enabled: !!token && !!currentTenant,
    refetchInterval: 60000,
  });

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const healthColors = {
    green: "bg-green-500",
    yellow: "bg-amber-500",
    red: "bg-red-500",
  };

  return (
    <div className="flex h-screen">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-sidebar-accent px-4">
            <span className="text-lg font-bold">{currentTenant?.name || "Platform"}</span>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {filteredNavItems.map((item) => {
              const isActive = pathname === item.href;
              const isHighlight = 'highlight' in item && item.highlight;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : isHighlight
                      ? "bg-primary/10 text-primary border border-primary/30 font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-accent p-4">
            <div className="mb-4 text-sm">
              <p className="font-medium">{user?.name}</p>
              <p className="text-sidebar-foreground/70">{user?.email}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                data-testid="button-theme-toggle"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="mr-4 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">{currentTenant?.name}</h1>
          </div>
          {health && (
            <Link href="/dashboard/deploy" data-testid="health-badge">
              <Badge 
                variant="outline" 
                className={cn(
                  "flex items-center gap-2 cursor-pointer",
                  health.status === "red" && "border-red-500 text-red-600",
                  health.status === "yellow" && "border-amber-500 text-amber-600",
                  health.status === "green" && "border-green-500 text-green-600"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", healthColors[health.status])} />
                {health.status === "green" ? "LIVE" : health.status === "yellow" ? "ACTION REQUIRED" : "BLOCKED"}
              </Badge>
            </Link>
          )}
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
