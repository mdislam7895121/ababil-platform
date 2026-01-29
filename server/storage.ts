import { prisma } from "./prisma";

// Storage interface for multi-tenant platform using Prisma

export const storage = {
  // ============================================================================
  // USER OPERATIONS
  // ============================================================================
  
  async getUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  async getUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  async createUser(data: { email: string; passwordHash: string; name: string; status?: string }) {
    return prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        status: data.status || "active",
      },
    });
  },

  async updateUser(id: string, data: Partial<{ name: string; avatarUrl: string; status: string }>) {
    return prisma.user.update({ where: { id }, data });
  },

  // ============================================================================
  // TENANT OPERATIONS
  // ============================================================================

  async getTenantById(id: string) {
    return prisma.tenant.findUnique({ where: { id } });
  },

  async getTenantBySlug(slug: string) {
    return prisma.tenant.findUnique({ where: { slug } });
  },

  async createTenant(data: { name: string; slug: string; plan?: string; status?: string }) {
    return prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        plan: data.plan || "free",
      },
    });
  },

  async updateTenant(id: string, data: Partial<{ name: string; plan: string }>) {
    return prisma.tenant.update({ where: { id }, data });
  },

  // ============================================================================
  // MEMBERSHIP OPERATIONS
  // ============================================================================

  async getMembershipsByUserId(userId: string) {
    return prisma.membership.findMany({
      where: { userId },
      include: { tenant: true },
    });
  },

  async getMembershipsByTenantId(tenantId: string) {
    return prisma.membership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true, status: true } } },
    });
  },

  async getMembership(tenantId: string, userId: string) {
    return prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
  },

  async createMembership(data: { userId: string; tenantId: string; role: string }) {
    return prisma.membership.create({ data });
  },

  async updateMembership(id: string, data: { role: string }) {
    return prisma.membership.update({ where: { id }, data });
  },

  async deleteMembership(id: string) {
    return prisma.membership.delete({ where: { id } });
  },

  // ============================================================================
  // API KEY OPERATIONS
  // ============================================================================

  async getApiKeysByTenantId(tenantId: string) {
    return prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getApiKeyByHash(keyHash: string) {
    return prisma.apiKey.findFirst({
      where: {
        keyHash,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  },

  async createApiKey(data: {
    tenantId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes?: string[];
    expiresAt?: Date | null;
  }) {
    return prisma.apiKey.create({ data });
  },

  async updateApiKeyLastUsed(id: string) {
    return prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  },

  async deleteApiKey(id: string) {
    return prisma.apiKey.delete({ where: { id } });
  },

  // ============================================================================
  // MODULE FLAGS OPERATIONS
  // ============================================================================

  async getModuleFlagsByTenantId(tenantId: string) {
    return prisma.moduleFlag.findMany({ where: { tenantId } });
  },

  async getModuleFlag(tenantId: string, key: string) {
    return prisma.moduleFlag.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
  },

  async upsertModuleFlag(tenantId: string, key: string, data: { enabled?: boolean; config?: any }) {
    return prisma.moduleFlag.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: data,
      create: { tenantId, key, enabled: data.enabled ?? false, config: data.config },
    });
  },

  // ============================================================================
  // CONNECTOR CONFIG OPERATIONS
  // ============================================================================

  async getConnectorConfigsByTenantId(tenantId: string) {
    return prisma.connectorConfig.findMany({ where: { tenantId } });
  },

  async getConnectorConfig(tenantId: string, connectorKey: string) {
    return prisma.connectorConfig.findUnique({
      where: { tenantId_connectorKey: { tenantId, connectorKey } },
    });
  },

  async upsertConnectorConfig(
    tenantId: string,
    connectorKey: string,
    data: { enabled?: boolean; configEncrypted?: string | null }
  ) {
    return prisma.connectorConfig.upsert({
      where: { tenantId_connectorKey: { tenantId, connectorKey } },
      update: data,
      create: { tenantId, connectorKey, enabled: data.enabled ?? false, configEncrypted: data.configEncrypted },
    });
  },

  // ============================================================================
  // AUDIT LOG OPERATIONS
  // ============================================================================

  async getAuditLogsByTenantId(tenantId: string, limit = 50, offset = 0) {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId },
        include: { actor: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.auditLog.count({ where: { tenantId } }),
    ]);
    return { logs, total };
  },

  async createAuditLog(data: {
    tenantId: string;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: any;
  }) {
    return prisma.auditLog.create({ data });
  },

  // ============================================================================
  // AI USAGE OPERATIONS
  // ============================================================================

  async getAiUsageStats(tenantId: string, userId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const where = userId ? { tenantId, userId } : { tenantId };

    const [dailyUsage, monthlyUsage] = await Promise.all([
      prisma.aiUsage.aggregate({
        where: { ...where, createdAt: { gte: today } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
      }),
      prisma.aiUsage.aggregate({
        where: { ...where, createdAt: { gte: monthStart } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
      }),
    ]);

    return { dailyUsage, monthlyUsage };
  },

  async getDailyAiUsageCount(tenantId: string, userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return prisma.aiUsage.count({
      where: { tenantId, userId, createdAt: { gte: today } },
    });
  },

  async getMonthlyAiUsageCount(tenantId: string, userId: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return prisma.aiUsage.count({
      where: { tenantId, userId, createdAt: { gte: monthStart } },
    });
  },

  async createAiUsage(data: {
    tenantId: string;
    userId: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
  }) {
    return prisma.aiUsage.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        model: data.model,
        inputTokens: data.inputTokens || 0,
        outputTokens: data.outputTokens || 0,
        estimatedCost: data.estimatedCost || 0,
      },
    });
  },

  // ============================================================================
  // AI CACHE OPERATIONS
  // ============================================================================

  async getAiCacheByHash(tenantId: string, promptHash: string) {
    return prisma.aiCache.findUnique({
      where: { tenantId_promptHash: { tenantId, promptHash } },
    });
  },

  async upsertAiCache(data: {
    tenantId: string;
    promptHash: string;
    response: string;
    model: string;
    expiresAt: Date;
  }) {
    return prisma.aiCache.upsert({
      where: { tenantId_promptHash: { tenantId: data.tenantId, promptHash: data.promptHash } },
      update: { response: data.response, expiresAt: data.expiresAt },
      create: data,
    });
  },

  // ============================================================================
  // DASHBOARD STATS
  // ============================================================================

  async getDashboardStats(tenantId: string) {
    const [userCount, apiKeyCount, enabledModules, enabledConnectors, recentActivity] = await Promise.all([
      prisma.membership.count({ where: { tenantId } }),
      prisma.apiKey.count({ where: { tenantId } }),
      prisma.moduleFlag.count({ where: { tenantId, enabled: true } }),
      prisma.connectorConfig.count({ where: { tenantId, enabled: true } }),
      prisma.auditLog.findMany({
        where: { tenantId },
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    return {
      users: userCount,
      apiKeys: apiKeyCount,
      modules: enabledModules,
      connectors: enabledConnectors,
      recentActivity,
    };
  },
};

export type IStorage = typeof storage;
