import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { db } from "./db";
import {
  tenants, users, memberships, apiKeys, auditLogs, secrets,
  moduleFlags, webhookEndpoints, jobRuns, connectorConfigs, aiUsage, aiCache,
  type Tenant, type InsertTenant, type User, type InsertUser,
  type Membership, type InsertMembership, type ApiKey, type InsertApiKey,
  type AuditLog, type InsertAuditLog, type Secret, type InsertSecret,
  type ModuleFlag, type InsertModuleFlag, type ConnectorConfig, type InsertConnectorConfig,
  type AiUsage, type InsertAiUsage, type AiCache, type InsertAiCache,
  MODULE_KEYS, CONNECTOR_KEYS,
} from "@shared/schema";

export interface IStorage {
  // Tenants
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<Tenant>): Promise<Tenant | undefined>;
  
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Memberships
  getMembership(id: string): Promise<Membership | undefined>;
  getMembershipByUserAndTenant(userId: string, tenantId: string): Promise<Membership | undefined>;
  getMembershipsByTenant(tenantId: string): Promise<(Membership & { user: User })[]>;
  getMembershipsByUser(userId: string): Promise<(Membership & { tenant: Tenant })[]>;
  createMembership(membership: InsertMembership): Promise<Membership>;
  updateMembership(id: string, data: Partial<Membership>): Promise<Membership | undefined>;
  deleteMembership(id: string): Promise<void>;
  
  // API Keys
  getApiKey(id: string): Promise<ApiKey | undefined>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getApiKeysByTenant(tenantId: string): Promise<ApiKey[]>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKeyLastUsed(id: string): Promise<void>;
  deleteApiKey(id: string): Promise<void>;
  
  // Audit Logs
  getAuditLogs(tenantId: string, limit: number, offset: number, action?: string): Promise<{ logs: (AuditLog & { actor: User | null })[]; total: number }>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Secrets
  getSecret(tenantId: string, key: string): Promise<Secret | undefined>;
  upsertSecret(tenantId: string, key: string, encryptedValue: string): Promise<Secret>;
  deleteSecret(tenantId: string, key: string): Promise<void>;
  
  // Module Flags
  getModuleFlags(tenantId: string): Promise<ModuleFlag[]>;
  getModuleFlag(tenantId: string, moduleKey: string): Promise<ModuleFlag | undefined>;
  upsertModuleFlag(tenantId: string, moduleKey: string, enabled: boolean, config?: Record<string, unknown>): Promise<ModuleFlag>;
  
  // Connector Configs
  getConnectorConfigs(tenantId: string): Promise<ConnectorConfig[]>;
  getConnectorConfig(tenantId: string, connectorKey: string): Promise<ConnectorConfig | undefined>;
  upsertConnectorConfig(tenantId: string, connectorKey: string, config: Record<string, unknown> | null, connected: boolean): Promise<ConnectorConfig>;
  
  // AI Usage
  getAiUsage(tenantId: string, periodStart: Date): Promise<AiUsage | undefined>;
  upsertAiUsage(tenantId: string, periodStart: Date, periodEnd: Date, requestCount: number, tokensIn: number, tokensOut: number): Promise<AiUsage>;
  
  // AI Cache
  getAiCache(tenantId: string, promptHash: string): Promise<AiCache | undefined>;
  createAiCache(cache: InsertAiCache): Promise<AiCache>;
  
  // Dashboard stats
  getDashboardStats(tenantId: string): Promise<{
    totalUsers: number;
    totalApiKeys: number;
    enabledModules: number;
    connectedConnectors: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Tenants
  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  async updateTenant(id: string, data: Partial<Tenant>): Promise<Tenant | undefined> {
    const [updated] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return updated;
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  // Memberships
  async getMembership(id: string): Promise<Membership | undefined> {
    const [membership] = await db.select().from(memberships).where(eq(memberships.id, id));
    return membership;
  }

  async getMembershipByUserAndTenant(userId: string, tenantId: string): Promise<Membership | undefined> {
    const [membership] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)));
    return membership;
  }

  async getMembershipsByTenant(tenantId: string): Promise<(Membership & { user: User })[]> {
    const result = await db.select()
      .from(memberships)
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.tenantId, tenantId))
      .orderBy(desc(memberships.createdAt));
    
    return result.map(r => ({
      ...r.memberships,
      user: r.users!,
    }));
  }

  async getMembershipsByUser(userId: string): Promise<(Membership & { tenant: Tenant })[]> {
    const result = await db.select()
      .from(memberships)
      .leftJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(eq(memberships.userId, userId))
      .orderBy(desc(memberships.createdAt));
    
    return result.map(r => ({
      ...r.memberships,
      tenant: r.tenants!,
    }));
  }

  async createMembership(membership: InsertMembership): Promise<Membership> {
    const [created] = await db.insert(memberships).values(membership).returning();
    return created;
  }

  async updateMembership(id: string, data: Partial<Membership>): Promise<Membership | undefined> {
    const [updated] = await db.update(memberships).set(data).where(eq(memberships.id, id)).returning();
    return updated;
  }

  async deleteMembership(id: string): Promise<void> {
    await db.delete(memberships).where(eq(memberships.id, id));
  }

  // API Keys
  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return apiKey;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return apiKey;
  }

  async getApiKeysByTenant(tenantId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.tenantId, tenantId)).orderBy(desc(apiKeys.createdAt));
  }

  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const [created] = await db.insert(apiKeys).values(apiKey).returning();
    return created;
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async deleteApiKey(id: string): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  // Audit Logs
  async getAuditLogs(tenantId: string, limit: number, offset: number, action?: string): Promise<{ logs: (AuditLog & { actor: User | null })[]; total: number }> {
    const conditions = [eq(auditLogs.tenantId, tenantId)];
    if (action) {
      conditions.push(ilike(auditLogs.action, `${action}%`));
    }

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(and(...conditions));
    
    const result = await db.select()
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      logs: result.map(r => ({
        ...r.audit_logs,
        actor: r.users,
      })),
      total: Number(countResult.count),
    };
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  // Secrets
  async getSecret(tenantId: string, key: string): Promise<Secret | undefined> {
    const [secret] = await db.select().from(secrets)
      .where(and(eq(secrets.tenantId, tenantId), eq(secrets.key, key)));
    return secret;
  }

  async upsertSecret(tenantId: string, key: string, encryptedValue: string): Promise<Secret> {
    const existing = await this.getSecret(tenantId, key);
    if (existing) {
      const [updated] = await db.update(secrets)
        .set({ encryptedValue })
        .where(eq(secrets.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(secrets)
      .values({ tenantId, key, encryptedValue })
      .returning();
    return created;
  }

  async deleteSecret(tenantId: string, key: string): Promise<void> {
    await db.delete(secrets).where(and(eq(secrets.tenantId, tenantId), eq(secrets.key, key)));
  }

  // Module Flags
  async getModuleFlags(tenantId: string): Promise<ModuleFlag[]> {
    return db.select().from(moduleFlags).where(eq(moduleFlags.tenantId, tenantId));
  }

  async getModuleFlag(tenantId: string, moduleKey: string): Promise<ModuleFlag | undefined> {
    const [flag] = await db.select().from(moduleFlags)
      .where(and(eq(moduleFlags.tenantId, tenantId), eq(moduleFlags.moduleKey, moduleKey)));
    return flag;
  }

  async upsertModuleFlag(tenantId: string, moduleKey: string, enabled: boolean, config?: Record<string, unknown>): Promise<ModuleFlag> {
    const existing = await this.getModuleFlag(tenantId, moduleKey);
    if (existing) {
      const [updated] = await db.update(moduleFlags)
        .set({ enabled, configJson: config })
        .where(eq(moduleFlags.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(moduleFlags)
      .values({ tenantId, moduleKey, enabled, configJson: config })
      .returning();
    return created;
  }

  // Connector Configs
  async getConnectorConfigs(tenantId: string): Promise<ConnectorConfig[]> {
    return db.select().from(connectorConfigs).where(eq(connectorConfigs.tenantId, tenantId));
  }

  async getConnectorConfig(tenantId: string, connectorKey: string): Promise<ConnectorConfig | undefined> {
    const [config] = await db.select().from(connectorConfigs)
      .where(and(eq(connectorConfigs.tenantId, tenantId), eq(connectorConfigs.connectorKey, connectorKey)));
    return config;
  }

  async upsertConnectorConfig(tenantId: string, connectorKey: string, config: Record<string, unknown> | null, connected: boolean): Promise<ConnectorConfig> {
    const existing = await this.getConnectorConfig(tenantId, connectorKey);
    if (existing) {
      const [updated] = await db.update(connectorConfigs)
        .set({ configJson: config, connected, updatedAt: new Date() })
        .where(eq(connectorConfigs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(connectorConfigs)
      .values({ tenantId, connectorKey, configJson: config, connected })
      .returning();
    return created;
  }

  // AI Usage
  async getAiUsage(tenantId: string, periodStart: Date): Promise<AiUsage | undefined> {
    const [usage] = await db.select().from(aiUsage)
      .where(and(eq(aiUsage.tenantId, tenantId), eq(aiUsage.periodStart, periodStart)));
    return usage;
  }

  async upsertAiUsage(tenantId: string, periodStart: Date, periodEnd: Date, requestCount: number, tokensIn: number, tokensOut: number): Promise<AiUsage> {
    const existing = await this.getAiUsage(tenantId, periodStart);
    if (existing) {
      const [updated] = await db.update(aiUsage)
        .set({
          requestCount: existing.requestCount + requestCount,
          tokensIn: existing.tokensIn + tokensIn,
          tokensOut: existing.tokensOut + tokensOut,
        })
        .where(eq(aiUsage.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(aiUsage)
      .values({ tenantId, periodStart, periodEnd, requestCount, tokensIn, tokensOut })
      .returning();
    return created;
  }

  // AI Cache
  async getAiCache(tenantId: string, promptHash: string): Promise<AiCache | undefined> {
    const [cache] = await db.select().from(aiCache)
      .where(and(
        eq(aiCache.tenantId, tenantId),
        eq(aiCache.promptHash, promptHash),
        sql`${aiCache.expiresAt} > NOW()`
      ));
    return cache;
  }

  async createAiCache(cache: InsertAiCache): Promise<AiCache> {
    const [created] = await db.insert(aiCache).values(cache).returning();
    return created;
  }

  // Dashboard stats
  async getDashboardStats(tenantId: string): Promise<{
    totalUsers: number;
    totalApiKeys: number;
    enabledModules: number;
    connectedConnectors: number;
  }> {
    const [usersCount] = await db.select({ count: sql<number>`count(*)` })
      .from(memberships).where(eq(memberships.tenantId, tenantId));
    const [apiKeysCount] = await db.select({ count: sql<number>`count(*)` })
      .from(apiKeys).where(eq(apiKeys.tenantId, tenantId));
    const [modulesCount] = await db.select({ count: sql<number>`count(*)` })
      .from(moduleFlags).where(and(eq(moduleFlags.tenantId, tenantId), eq(moduleFlags.enabled, true)));
    const [connectorsCount] = await db.select({ count: sql<number>`count(*)` })
      .from(connectorConfigs).where(and(eq(connectorConfigs.tenantId, tenantId), eq(connectorConfigs.connected, true)));

    return {
      totalUsers: Number(usersCount.count),
      totalApiKeys: Number(apiKeysCount.count),
      enabledModules: Number(modulesCount.count),
      connectedConnectors: Number(connectorsCount.count),
    };
  }
}

export const storage = new DatabaseStorage();
