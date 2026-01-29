import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "./queryClient";

interface User {
  id: string;
  email: string;
  name: string | null;
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

interface AuthState {
  user: User | null;
  token: string | null;
  memberships: Membership[];
  currentTenant: Tenant | null;
  currentRole: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name?: string; tenantName: string; tenantSlug: string }) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    memberships: [],
    currentTenant: null,
    currentRole: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    const stored = localStorage.getItem("auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setState({
          ...parsed,
          isLoading: false,
          isAuthenticated: !!parsed.token,
        });
      } catch {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const persistAuth = (newState: Partial<AuthState>) => {
    const updated = { ...state, ...newState };
    localStorage.setItem("auth", JSON.stringify({
      user: updated.user,
      token: updated.token,
      memberships: updated.memberships,
      currentTenant: updated.currentTenant,
      currentRole: updated.currentRole,
    }));
    setState({ ...updated, isLoading: false, isAuthenticated: !!updated.token });
  };

  const login = async (email: string, password: string) => {
    const response = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await response.json();
    
    const currentMembership = data.memberships[0];
    persistAuth({
      user: data.user,
      token: data.token,
      memberships: data.memberships,
      currentTenant: currentMembership?.tenant || null,
      currentRole: currentMembership?.role || null,
    });
  };

  const register = async (data: { email: string; password: string; name?: string; tenantName: string; tenantSlug: string }) => {
    const response = await apiRequest("POST", "/api/auth/register", data);
    const result = await response.json();
    
    const currentMembership = result.memberships[0];
    persistAuth({
      user: result.user,
      token: result.token,
      memberships: result.memberships,
      currentTenant: currentMembership?.tenant || null,
      currentRole: currentMembership?.role || null,
    });
  };

  const logout = () => {
    localStorage.removeItem("auth");
    setState({
      user: null,
      token: null,
      memberships: [],
      currentTenant: null,
      currentRole: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  const switchTenant = (tenantId: string) => {
    const membership = state.memberships.find(m => m.tenantId === tenantId);
    if (membership) {
      persistAuth({
        currentTenant: membership.tenant,
        currentRole: membership.role,
      });
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, switchTenant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function getAuthHeaders(): Record<string, string> {
  const stored = localStorage.getItem("auth");
  if (!stored) return {};
  
  try {
    const parsed = JSON.parse(stored);
    const headers: Record<string, string> = {};
    
    if (parsed.token) {
      headers["Authorization"] = `Bearer ${parsed.token}`;
    }
    if (parsed.currentTenant?.id) {
      headers["x-tenant-id"] = parsed.currentTenant.id;
    }
    
    return headers;
  } catch {
    return {};
  }
}
