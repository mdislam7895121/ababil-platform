import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AuthRequest, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import rateLimit from "express-rate-limit";

const router = Router();
const prisma = new PrismaClient();

const securityUpdateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req: any) => `security-update:${req.tenantId}:${req.userId}`,
  message: { error: "Too many security setting updates, please try again later" },
});

const settingsSchema = z.object({
  dataRetentionDays: z.number().int().min(30).max(365).optional(),
  piiRedactionEnabled: z.boolean().optional(),
  require2faForAdmins: z.boolean().optional(),
});

const PERMISSIONS_MATRIX = {
  capabilities: [
    { name: "View Dashboard", owner: true, admin: true, staff: true, viewer: true },
    { name: "Manage Users", owner: true, admin: true, staff: false, viewer: false },
    { name: "Manage API Keys", owner: true, admin: true, staff: false, viewer: false },
    { name: "Manage Modules", owner: true, admin: true, staff: false, viewer: false },
    { name: "Manage Connectors", owner: true, admin: true, staff: false, viewer: false },
    { name: "View Audit Logs", owner: true, admin: true, staff: true, viewer: false },
    { name: "Export Data", owner: true, admin: true, staff: false, viewer: false },
    { name: "Delete Tenant", owner: true, admin: false, staff: false, viewer: false },
    { name: "Manage Billing", owner: true, admin: true, staff: false, viewer: false },
    { name: "Manage Security Settings", owner: true, admin: true, staff: false, viewer: false },
    { name: "Deploy Application", owner: true, admin: true, staff: true, viewer: false },
    { name: "Access Builder", owner: true, admin: true, staff: true, viewer: false },
    { name: "Manage Partners", owner: true, admin: true, staff: false, viewer: false },
    { name: "Manage Marketplace", owner: true, admin: true, staff: false, viewer: false },
  ],
  roles: ["owner", "admin", "staff", "viewer"],
};

router.get("/settings", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    let settings = await prisma.tenantSecuritySettings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      settings = await prisma.tenantSecuritySettings.create({
        data: { tenantId },
      });
    }

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "SECURITY_SETTINGS_VIEWED",
      entityType: "TenantSecuritySettings",
      entityId: settings.id,
    });

    res.json({ settings });
  } catch (error) {
    console.error("Security settings get error:", error);
    res.status(500).json({ error: "Failed to get security settings" });
  }
});

router.post("/settings", securityUpdateLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const parsed = settingsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid settings", details: parsed.error.flatten() });
      return;
    }

    const settings = await prisma.tenantSecuritySettings.upsert({
      where: { tenantId },
      update: parsed.data,
      create: { tenantId, ...parsed.data },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "SECURITY_SETTINGS_UPDATED",
      entityType: "TenantSecuritySettings",
      entityId: settings.id,
      metadata: parsed.data,
    });

    res.json({ settings, message: "Security settings updated" });
  } catch (error) {
    console.error("Security settings update error:", error);
    res.status(500).json({ error: "Failed to update security settings" });
  }
});

router.get("/permissions-matrix", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "PERMISSIONS_MATRIX_VIEWED",
      entityType: "PermissionsMatrix",
      entityId: tenantId,
    });

    res.json({ matrix: PERMISSIONS_MATRIX });
  } catch (error) {
    console.error("Permissions matrix error:", error);
    res.status(500).json({ error: "Failed to get permissions matrix" });
  }
});

export default router;
