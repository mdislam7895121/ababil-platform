import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export chat models for AI integration
export * from "./models/chat";

// ============================================================================
// TENANT - Core multi-tenant entity
// ============================================================================
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("tenants_slug_idx").on(table.slug),
  index("tenants_status_idx").on(table.status),
]);

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;

// ============================================================================
// USER - Platform users with authentication
// ============================================================================
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("users_email_idx").on(table.email),
  index("users_status_idx").on(table.status),
]);

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// ============================================================================
// MEMBERSHIP - User-Tenant relationship with RBAC roles
// ============================================================================
export const memberships = pgTable("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("memberships_tenant_idx").on(table.tenantId),
  index("memberships_user_idx").on(table.userId),
  index("memberships_tenant_user_idx").on(table.tenantId, table.userId),
]);

export const insertMembershipSchema = createInsertSchema(memberships).omit({
  id: true,
  createdAt: true,
});

export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = z.infer<typeof insertMembershipSchema>;

// Role hierarchy for RBAC
export const ROLES = ["owner", "admin", "staff", "viewer"] as const;
export type Role = typeof ROLES[number];

// ============================================================================
// API KEY - Tenant-scoped API keys for programmatic access
// ============================================================================
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes").array().default(sql`ARRAY[]::text[]`),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("api_keys_tenant_idx").on(table.tenantId),
  index("api_keys_key_hash_idx").on(table.keyHash),
]);

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

// ============================================================================
// AUDIT LOG - Tenant-scoped activity logging
// ============================================================================
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("audit_logs_tenant_idx").on(table.tenantId),
  index("audit_logs_created_at_idx").on(table.createdAt),
  index("audit_logs_action_idx").on(table.action),
]);

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// ============================================================================
// SECRET - Encrypted connector secrets per tenant
// ============================================================================
export const secrets = pgTable("secrets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("secrets_tenant_idx").on(table.tenantId),
  index("secrets_tenant_key_idx").on(table.tenantId, table.key),
]);

export const insertSecretSchema = createInsertSchema(secrets).omit({
  id: true,
  createdAt: true,
});

export type Secret = typeof secrets.$inferSelect;
export type InsertSecret = z.infer<typeof insertSecretSchema>;

// ============================================================================
// MODULE FLAG - Feature toggles per tenant
// ============================================================================
export const moduleFlags = pgTable("module_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  configJson: jsonb("config_json"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("module_flags_tenant_idx").on(table.tenantId),
  index("module_flags_tenant_module_idx").on(table.tenantId, table.moduleKey),
]);

export const insertModuleFlagSchema = createInsertSchema(moduleFlags).omit({
  id: true,
  createdAt: true,
});

export type ModuleFlag = typeof moduleFlags.$inferSelect;
export type InsertModuleFlag = z.infer<typeof insertModuleFlagSchema>;

// Available modules in the platform
export const MODULE_KEYS = ["booking", "ecommerce", "crm", "support", "analytics", "ai_assistant"] as const;
export type ModuleKey = typeof MODULE_KEYS[number];

// ============================================================================
// WEBHOOK ENDPOINT - Tenant webhook configurations
// ============================================================================
export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().default(sql`ARRAY[]::text[]`),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("webhook_endpoints_tenant_idx").on(table.tenantId),
]);

export const insertWebhookEndpointSchema = createInsertSchema(webhookEndpoints).omit({
  id: true,
  createdAt: true,
});

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = z.infer<typeof insertWebhookEndpointSchema>;

// ============================================================================
// JOB RUN - Background job execution tracking
// ============================================================================
export const jobRuns = pgTable("job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  jobKey: text("job_key").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  outputJson: jsonb("output_json"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("job_runs_tenant_idx").on(table.tenantId),
  index("job_runs_status_idx").on(table.status),
]);

export const insertJobRunSchema = createInsertSchema(jobRuns).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
});

export type JobRun = typeof jobRuns.$inferSelect;
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;

// ============================================================================
// CONNECTOR CONFIG - Connector configurations per tenant
// ============================================================================
export const connectorConfigs = pgTable("connector_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  connectorKey: text("connector_key").notNull(),
  configJson: jsonb("config_json"),
  connected: boolean("connected").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("connector_configs_tenant_idx").on(table.tenantId),
  index("connector_configs_tenant_connector_idx").on(table.tenantId, table.connectorKey),
]);

export const insertConnectorConfigSchema = createInsertSchema(connectorConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ConnectorConfig = typeof connectorConfigs.$inferSelect;
export type InsertConnectorConfig = z.infer<typeof insertConnectorConfigSchema>;

// Available connectors
export const CONNECTOR_KEYS = ["stripe", "email", "storage", "push"] as const;
export type ConnectorKey = typeof CONNECTOR_KEYS[number];

// ============================================================================
// AI USAGE - Track AI usage for quotas
// ============================================================================
export const aiUsage = pgTable("ai_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  requestCount: integer("request_count").notNull().default(0),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("ai_usage_tenant_idx").on(table.tenantId),
  index("ai_usage_period_idx").on(table.periodStart, table.periodEnd),
]);

export const insertAiUsageSchema = createInsertSchema(aiUsage).omit({
  id: true,
  createdAt: true,
});

export type AiUsage = typeof aiUsage.$inferSelect;
export type InsertAiUsage = z.infer<typeof insertAiUsageSchema>;

// ============================================================================
// AI CACHE - Cache AI responses for cost optimization
// ============================================================================
export const aiCache = pgTable("ai_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  promptHash: text("prompt_hash").notNull(),
  response: text("response").notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  index("ai_cache_tenant_hash_idx").on(table.tenantId, table.promptHash),
  index("ai_cache_expires_idx").on(table.expiresAt),
]);

export const insertAiCacheSchema = createInsertSchema(aiCache).omit({
  id: true,
  createdAt: true,
});

export type AiCache = typeof aiCache.$inferSelect;
export type InsertAiCache = z.infer<typeof insertAiCacheSchema>;

// ============================================================================
// RELATIONS
// ============================================================================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  memberships: many(memberships),
  apiKeys: many(apiKeys),
  auditLogs: many(auditLogs),
  secrets: many(secrets),
  moduleFlags: many(moduleFlags),
  webhookEndpoints: many(webhookEndpoints),
  jobRuns: many(jobRuns),
  connectorConfigs: many(connectorConfigs),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  auditLogs: many(auditLogs),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  tenant: one(tenants, { fields: [memberships.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  tenant: one(tenants, { fields: [apiKeys.tenantId], references: [tenants.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));

export const secretsRelations = relations(secrets, ({ one }) => ({
  tenant: one(tenants, { fields: [secrets.tenantId], references: [tenants.id] }),
}));

export const moduleFlagsRelations = relations(moduleFlags, ({ one }) => ({
  tenant: one(tenants, { fields: [moduleFlags.tenantId], references: [tenants.id] }),
}));

export const webhookEndpointsRelations = relations(webhookEndpoints, ({ one }) => ({
  tenant: one(tenants, { fields: [webhookEndpoints.tenantId], references: [tenants.id] }),
}));

export const jobRunsRelations = relations(jobRuns, ({ one }) => ({
  tenant: one(tenants, { fields: [jobRuns.tenantId], references: [tenants.id] }),
}));

export const connectorConfigsRelations = relations(connectorConfigs, ({ one }) => ({
  tenant: one(tenants, { fields: [connectorConfigs.tenantId], references: [tenants.id] }),
}));

// ============================================================================
// API VALIDATION SCHEMAS
// ============================================================================
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  tenantName: z.string().min(2),
  tenantSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional(),
});

export const createMembershipSchema = z.object({
  userId: z.string(),
  role: z.enum(["owner", "admin", "staff", "viewer"]),
});

export const updateMembershipSchema = z.object({
  role: z.enum(["owner", "admin", "staff", "viewer"]),
});

export const moduleConfigSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.any()).optional(),
});

export const connectorSaveSchema = z.object({
  config: z.record(z.any()).optional(),
  secrets: z.record(z.string()).optional(),
});

export const aiChatSchema = z.object({
  message: z.string().min(1),
  context: z.object({
    page: z.string().optional(),
    entityId: z.string().optional(),
  }).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type ModuleConfigInput = z.infer<typeof moduleConfigSchema>;
export type ConnectorSaveInput = z.infer<typeof connectorSaveSchema>;
export type AiChatInput = z.infer<typeof aiChatSchema>;
