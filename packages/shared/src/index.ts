import { z } from 'zod';

// Role hierarchy for RBAC
export const ROLES = ['owner', 'admin', 'staff', 'viewer'] as const;
export type Role = typeof ROLES[number];

export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  staff: 2,
  viewer: 1
};

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// Module keys
export const MODULE_KEYS = ['booking', 'ecommerce', 'crm', 'support', 'analytics', 'ai_assistant'] as const;
export type ModuleKey = typeof MODULE_KEYS[number];

// Connector keys
export const CONNECTOR_KEYS = ['stripe', 'email', 'storage', 'push'] as const;
export type ConnectorKey = typeof CONNECTOR_KEYS[number];

// Plan types
export const PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;
export type Plan = typeof PLANS[number];

// API Schemas
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  tenantName: z.string().min(1),
  tenantSlug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(ROLES).default('member')
});

export const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).default([]),
  expiresInDays: z.number().optional()
});

export const toggleModuleSchema = z.object({
  enabled: z.boolean()
});

export const updateModuleConfigSchema = z.object({
  config: z.record(z.unknown())
});

export const updateConnectorSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional()
});

export const aiChatSchema = z.object({
  message: z.string().min(1).max(4000)
});

// Plan quotas
export const PLAN_QUOTAS: Record<Plan, { aiMessagesPerDay: number; aiMessagesPerMonth: number }> = {
  free: { aiMessagesPerDay: 10, aiMessagesPerMonth: 100 },
  starter: { aiMessagesPerDay: 50, aiMessagesPerMonth: 1000 },
  pro: { aiMessagesPerDay: 200, aiMessagesPerMonth: 5000 },
  enterprise: { aiMessagesPerDay: 1000, aiMessagesPerMonth: 50000 }
};

// Type exports for API responses
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  status: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface MembershipWithTenant {
  id: string;
  tenantId: string;
  userId: string;
  role: string;
  tenant: TenantInfo;
}

export interface AuthResponse {
  user: SafeUser;
  token: string;
  memberships: MembershipWithTenant[];
}
