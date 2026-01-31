"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  status: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface Membership {
  id: string;
  tenantId: string;
  userId: string;
  role: string;
  tenant: Tenant;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  memberships: Membership[];
  currentTenant: Tenant | null;
  currentRole: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; tenantName: string; tenantSlug: string }) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const currentMembership = memberships.find((m) => m.tenantId === currentTenantId);
  const currentTenant = currentMembership?.tenant || null;
  const currentRole = currentMembership?.role || null;

  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    const savedMemberships = localStorage.getItem("memberships");
    const savedTenantId = localStorage.getItem("currentTenantId");

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      if (savedMemberships) {
        const mems = JSON.parse(savedMemberships);
        setMemberships(mems);
        setCurrentTenantId(savedTenantId || mems[0]?.tenantId || null);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Login failed");
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    setMemberships(data.memberships);
    setCurrentTenantId(data.memberships[0]?.tenantId || null);

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("memberships", JSON.stringify(data.memberships));
    localStorage.setItem("currentTenantId", data.memberships[0]?.tenantId || "");
  }, []);

  const register = useCallback(async (data: { email: string; password: string; name: string; tenantName: string; tenantSlug: string }) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const result = await res.json();
      throw new Error(result.error || "Registration failed");
    }

    const result = await res.json();
    setToken(result.token);
    setUser(result.user);
    setMemberships(result.memberships);
    setCurrentTenantId(result.memberships[0]?.tenantId || null);

    localStorage.setItem("token", result.token);
    localStorage.setItem("user", JSON.stringify(result.user));
    localStorage.setItem("memberships", JSON.stringify(result.memberships));
    localStorage.setItem("currentTenantId", result.memberships[0]?.tenantId || "");
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setMemberships([]);
    setCurrentTenantId(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("memberships");
    localStorage.removeItem("currentTenantId");
  }, []);

  const switchTenant = useCallback((tenantId: string) => {
    setCurrentTenantId(tenantId);
    localStorage.setItem("currentTenantId", tenantId);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        memberships,
        currentTenant,
        currentRole,
        isLoading,
        login,
        register,
        logout,
        switchTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
