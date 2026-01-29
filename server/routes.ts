import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import {
  authMiddleware, requireTenant, requireRole, rateLimit,
  hashPassword, verifyPassword, generateToken, generateApiKey, encryptSecret,
} from "./auth";
import { chat, isAiAvailable } from "./ai";
import {
  registerSchema, loginSchema, createApiKeySchema, createMembershipSchema,
  updateMembershipSchema, moduleConfigSchema, connectorSaveSchema, aiChatSchema,
  updateTenantSchema, MODULE_KEYS, CONNECTOR_KEYS,
} from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check
  app.get("/api/health", (_, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ============================================================================
  // AUTH ROUTES
  // ============================================================================
  
  app.post("/api/auth/register", rateLimit(5, 60000), async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      // Check if tenant slug exists
      const existingTenant = await storage.getTenantBySlug(data.tenantSlug);
      if (existingTenant) {
        return res.status(400).json({ error: "Organization slug already taken" });
      }
      
      // Create user
      const passwordHashValue = await hashPassword(data.password);
      const user = await storage.createUser({
        email: data.email,
        passwordHash: passwordHashValue,
        name: data.name,
        status: "active",
      });
      
      // Create tenant
      const tenant = await storage.createTenant({
        name: data.tenantName,
        slug: data.tenantSlug,
        plan: "free",
      });
      
      // Create membership (owner role)
      const membership = await storage.createMembership({
        userId: user.id,
        tenantId: tenant.id,
        role: "owner",
      });
      
      // Create audit log
      await storage.createAuditLog({
        tenantId: tenant.id,
        actorUserId: user.id,
        action: "create_tenant",
        entityType: "tenant",
        entityId: tenant.id,
      });
      
      // Generate token
      const token = generateToken(user.id);
      
      res.json({
        user: { id: user.id, email: user.email, name: user.name },
        token,
        memberships: [{
          id: membership.id,
          tenantId: tenant.id,
          userId: user.id,
          role: membership.role,
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
        }],
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", rateLimit(5, 60000), async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const valid = await verifyPassword(data.password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Get all memberships with tenants
      const memberships = await storage.getMembershipsByUserId(user.id);
      
      // Generate token
      const token = generateToken(user.id);
      
      res.json({
        user: { id: user.id, email: user.email, name: user.name },
        token,
        memberships: memberships.map((m: any) => ({
          id: m.id,
          tenantId: m.tenantId,
          userId: m.userId,
          role: m.role,
          tenant: { id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug, plan: m.tenant.plan },
        })),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ============================================================================
  // DASHBOARD ROUTES
  // ============================================================================
  
  app.get("/api/dashboard/stats", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      const stats = await storage.getDashboardStats(req.tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ============================================================================
  // TENANT ROUTES
  // ============================================================================
  
  app.get("/api/tenants/me", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      res.json(req.tenant);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tenant" });
    }
  });

  app.patch("/api/tenants/me", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const data = updateTenantSchema.parse(req.body);
      const updated = await storage.updateTenant(req.tenantId, data);
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "update_tenant",
        entityType: "tenant",
        entityId: req.tenantId,
        metadata: data,
      });
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update tenant" });
    }
  });

  // ============================================================================
  // USER/MEMBERSHIP ROUTES
  // ============================================================================
  
  app.get("/api/users", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      const memberships = await storage.getMembershipsByTenantId(req.tenantId);
      
      // Sanitize user data to remove sensitive fields
      const sanitizedMemberships = memberships.map((m: any) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt,
        user: {
          id: m.user.id,
          email: m.user.email,
          name: m.user.name,
          status: m.user.status,
        },
      }));
      
      res.json(sanitizedMemberships);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users/invite", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const { email, role } = req.body;
      
      // Check if user exists
      let user = await storage.getUserByEmail(email);
      if (!user) {
        // Create pending user
        const tempPassword = await hashPassword(crypto.randomUUID());
        user = await storage.createUser({
          email,
          name: email.split("@")[0],
          passwordHash: tempPassword,
          status: "pending",
        });
      }
      
      // Check if already a member
      const existing = await storage.getMembership(req.tenantId, user.id);
      if (existing) {
        return res.status(400).json({ error: "User is already a member" });
      }
      
      // Create membership
      const membership = await storage.createMembership({
        userId: user.id,
        tenantId: req.tenantId,
        role,
      });
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "create_membership",
        entityType: "membership",
        entityId: membership.id,
        metadata: { email, role },
      });
      
      res.json({ message: "Invitation sent", membershipId: membership.id });
    } catch (error) {
      res.status(500).json({ error: "Failed to invite user" });
    }
  });

  app.patch("/api/memberships/:id", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const data = updateMembershipSchema.parse(req.body);
      
      // Get membership to verify it belongs to this tenant
      const memberships = await storage.getMembershipsByTenantId(req.tenantId);
      const membership = memberships.find((m: any) => m.id === id);
      
      if (!membership) {
        return res.status(404).json({ error: "Membership not found" });
      }
      
      // Cannot change owner role
      if (membership.role === "owner") {
        return res.status(400).json({ error: "Cannot change owner role" });
      }
      
      const updated = await storage.updateMembership(id, data);
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "update_membership",
        entityType: "membership",
        entityId: id,
        metadata: data,
      });
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update membership" });
    }
  });

  app.delete("/api/memberships/:id", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Get membership to verify it belongs to this tenant
      const memberships = await storage.getMembershipsByTenantId(req.tenantId);
      const membership = memberships.find((m: any) => m.id === id);
      
      if (!membership) {
        return res.status(404).json({ error: "Membership not found" });
      }
      
      if (membership.role === "owner") {
        return res.status(400).json({ error: "Cannot remove owner" });
      }
      
      await storage.deleteMembership(id);
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "delete_membership",
        entityType: "membership",
        entityId: id,
      });
      
      res.json({ message: "Membership deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete membership" });
    }
  });

  // ============================================================================
  // API KEY ROUTES
  // ============================================================================
  
  app.get("/api/api-keys", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      const keys = await storage.getApiKeysByTenantId(req.tenantId);
      res.json(keys.map((k: any) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/api-keys", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const data = createApiKeySchema.parse(req.body);
      const { key, hash, prefix } = generateApiKey();
      
      const apiKey = await storage.createApiKey({
        tenantId: req.tenantId,
        name: data.name,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: data.scopes || [],
      });
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "create_api_key",
        entityType: "api_key",
        entityId: apiKey.id,
        metadata: { name: data.name },
      });
      
      // Return the full key only once
      res.json({
        id: apiKey.id,
        name: apiKey.name,
        key, // Full key - only shown once
        keyPrefix: prefix,
        createdAt: apiKey.createdAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.delete("/api/api-keys/:id", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Verify API key belongs to this tenant
      const keys = await storage.getApiKeysByTenantId(req.tenantId);
      const apiKey = keys.find((k: any) => k.id === id);
      
      if (!apiKey) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      await storage.deleteApiKey(id);
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "delete_api_key",
        entityType: "api_key",
        entityId: id,
      });
      
      res.json({ message: "API key deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // ============================================================================
  // MODULE ROUTES
  // ============================================================================
  
  app.get("/api/modules", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      const flags = await storage.getModuleFlagsByTenantId(req.tenantId);
      
      // Return all modules with their enabled status
      const modules = MODULE_KEYS.map(key => {
        const flag = flags.find((f: any) => f.key === key);
        return {
          key,
          enabled: flag?.enabled ?? false,
          config: flag?.config ?? null,
        };
      });
      
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch modules" });
    }
  });

  app.post("/api/modules/:key/enable", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const { key } = req.params;
      
      if (!MODULE_KEYS.includes(key as any)) {
        return res.status(400).json({ error: "Invalid module key" });
      }
      
      const flag = await storage.upsertModuleFlag(req.tenantId, key, { enabled: true });
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "enable_module",
        entityType: "module",
        entityId: key,
      });
      
      res.json(flag);
    } catch (error) {
      res.status(500).json({ error: "Failed to enable module" });
    }
  });

  app.post("/api/modules/:key/disable", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const { key } = req.params;
      
      if (!MODULE_KEYS.includes(key as any)) {
        return res.status(400).json({ error: "Invalid module key" });
      }
      
      const flag = await storage.upsertModuleFlag(req.tenantId, key, { enabled: false });
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "disable_module",
        entityType: "module",
        entityId: key,
      });
      
      res.json(flag);
    } catch (error) {
      res.status(500).json({ error: "Failed to disable module" });
    }
  });

  app.post("/api/modules/:key/toggle", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const { key } = req.params;
      const { enabled } = req.body;
      
      if (!MODULE_KEYS.includes(key as any)) {
        return res.status(400).json({ error: "Invalid module key" });
      }
      
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
      
      const flag = await storage.upsertModuleFlag(req.tenantId, key, { enabled });
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: enabled ? "enable_module" : "disable_module",
        entityType: "module",
        entityId: key,
      });
      
      res.json({ success: true, module: { key, enabled } });
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle module" });
    }
  });

  // ============================================================================
  // CONNECTOR ROUTES
  // ============================================================================
  
  app.get("/api/connectors", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      const configs = await storage.getConnectorConfigsByTenantId(req.tenantId);
      
      // Return all connectors with their connected status
      const connectors = CONNECTOR_KEYS.map(key => {
        const config = configs.find((c: any) => c.connectorKey === key);
        return {
          key,
          connected: config?.enabled ?? false,
          config: null, // Don't expose encrypted config
        };
      });
      
      res.json(connectors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch connectors" });
    }
  });

  app.post("/api/connectors/:key", authMiddleware, requireTenant, requireRole("admin"), async (req: any, res) => {
    try {
      const { key } = req.params;
      const { config, secrets } = connectorSaveSchema.parse(req.body);
      
      if (!CONNECTOR_KEYS.includes(key as any)) {
        return res.status(400).json({ error: "Invalid connector key" });
      }
      
      // Store config encrypted if secrets provided
      let encryptedConfig: string | null = null;
      if (secrets) {
        encryptedConfig = encryptSecret(JSON.stringify(secrets));
      }
      
      // Store config
      const result = await storage.upsertConnectorConfig(req.tenantId, key, {
        enabled: true,
        configEncrypted: encryptedConfig,
      });
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "configure_connector",
        entityType: "connector",
        entityId: key,
      });
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to save connector" });
    }
  });

  app.post("/api/connectors/:key/test", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      const { key } = req.params;
      
      // Simulate testing connection - in production this would actually test the connection
      const config = await storage.getConnectorConfig(req.tenantId, key);
      if (!config?.enabled) {
        return res.json({ success: false, error: "Connector not configured" });
      }
      
      // Simulate success
      res.json({ success: true, message: "Connection successful" });
    } catch (error) {
      res.status(500).json({ error: "Failed to test connector" });
    }
  });

  // ============================================================================
  // AUDIT LOG ROUTES
  // ============================================================================
  
  app.get("/api/audit-logs", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      
      const { logs, total } = await storage.getAuditLogsByTenantId(req.tenantId, limit, offset);
      
      // Sanitize logs to remove sensitive data
      const sanitizedLogs = logs.map((log: any) => ({
        ...log,
        actor: log.actor ? {
          id: log.actor.id,
          email: log.actor.email,
          name: log.actor.name,
        } : null,
      }));
      
      res.json({ logs: sanitizedLogs, total, page, limit });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ============================================================================
  // AI ROUTES
  // ============================================================================
  
  app.post("/api/ai/chat", authMiddleware, requireTenant, rateLimit(20, 60000), async (req: any, res) => {
    try {
      const data = aiChatSchema.parse(req.body);
      
      // Check if AI module is enabled
      const aiModule = await storage.getModuleFlag(req.tenantId, "ai_assistant");
      if (!aiModule?.enabled) {
        return res.status(400).json({ error: "AI Assistant module is not enabled" });
      }
      
      const plan = req.tenant?.plan || "free";
      const response = await chat(req.tenantId, plan, data.message);
      
      await storage.createAuditLog({
        tenantId: req.tenantId,
        actorUserId: req.user?.id,
        action: "ai_chat",
        entityType: "ai",
        metadata: { cached: response.cached },
      });
      
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "AI chat failed" });
    }
  });

  app.get("/api/ai/status", authMiddleware, requireTenant, async (req: any, res) => {
    try {
      const available = isAiAvailable();
      const aiModule = await storage.getModuleFlag(req.tenantId, "ai_assistant");
      
      res.json({
        available,
        enabled: aiModule?.enabled ?? false,
        mockMode: !available,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get AI status" });
    }
  });

  return httpServer;
}
