import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import rateLimit from "express-rate-limit";

const router = Router();
const prisma = new PrismaClient();

const accessReviewActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => `access-review:${req.tenantId}:${req.userId}`,
  message: { error: "Too many access review actions, please try again later" },
});

router.get("/summary", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [memberships, apiKeys, recentAuditLogs] = await Promise.all([
      prisma.membership.findMany({
        where: { tenantId },
        include: {
          user: { select: { id: true, email: true, name: true, status: true, createdAt: true } },
        },
      }),
      prisma.apiKey.findMany({
        where: { tenantId },
      }),
      prisma.auditLog.findMany({
        where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
        select: { actorUserId: true },
        distinct: ["actorUserId"],
      }),
    ]);

    const activeUserIds = new Set(recentAuditLogs.map(log => log.actorUserId).filter(Boolean));

    const dormantUsers = memberships.filter(m => {
      if (!m.user) return false;
      if (m.user.status !== "active") return false;
      return !activeUserIds.has(m.user.id);
    }).map(m => ({
      userId: m.userId,
      email: m.user?.email,
      name: m.user?.name,
      role: m.role,
      createdAt: m.createdAt,
      membershipId: m.id,
    }));

    const oldApiKeys = apiKeys.filter(key => new Date(key.createdAt) < ninetyDaysAgo);
    const recentlyRotatedKeys = apiKeys.filter(key => {
      const thirtyDaysAgoTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
      return new Date(key.createdAt).getTime() > thirtyDaysAgoTime;
    });

    const recommendations: string[] = [];

    if (dormantUsers.length > 0) {
      recommendations.push(`${dormantUsers.length} user(s) have not been active in the last 30 days. Consider disabling their access.`);
    }

    if (oldApiKeys.length > 0) {
      recommendations.push(`${oldApiKeys.length} API key(s) are older than 90 days. Consider rotating them.`);
    }

    const expiredKeys = apiKeys.filter(key => key.expiresAt && new Date(key.expiresAt) < new Date());
    if (expiredKeys.length > 0) {
      recommendations.push(`${expiredKeys.length} API key(s) have expired and should be revoked.`);
    }

    const adminCount = memberships.filter(m => m.role === "admin" || m.role === "owner").length;
    if (adminCount > 3) {
      recommendations.push(`${adminCount} users have admin/owner access. Review if all need elevated privileges.`);
    }

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "ACCESS_REVIEW_VIEWED",
      entityType: "AccessReview",
      entityId: tenantId,
    });

    res.json({
      summary: {
        usersCount: memberships.length,
        dormantUsersCount: dormantUsers.length,
        apiKeysTotal: apiKeys.length,
        apiKeysOlderThan90d: oldApiKeys.length,
        apiKeysRotatedRecently: recentlyRotatedKeys.length,
      },
      dormantUsers,
      apiKeys: apiKeys.map(k => ({
        id: k.id,
        name: k.name,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        isOld: new Date(k.createdAt) < ninetyDaysAgo,
        isExpired: k.expiresAt ? new Date(k.expiresAt) < new Date() : false,
      })),
      recommendations,
    });
  } catch (error) {
    console.error("Access review summary error:", error);
    res.status(500).json({ error: "Failed to get access review summary" });
  }
});

router.post("/disable-user/:userId", accessReviewActionLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const actorUserId = req.userId!;
    const targetUserId = req.params.userId as string;

    const membership = await prisma.membership.findFirst({
      where: { tenantId, userId: targetUserId },
      include: { user: true },
    });

    if (!membership) {
      res.status(404).json({ error: "User not found in this tenant" });
      return;
    }

    if (membership.role === "owner") {
      res.status(403).json({ error: "Cannot disable owner account" });
      return;
    }

    if (targetUserId === actorUserId) {
      res.status(400).json({ error: "Cannot disable your own account" });
      return;
    }

    await prisma.membership.update({
      where: { id: membership.id },
      data: { role: "disabled" },
    });

    await logAudit({
      tenantId,
      actorUserId,
      action: "USER_DISABLED",
      entityType: "Membership",
      entityId: membership.id,
      metadata: { targetUserId, previousRole: membership.role },
    });

    res.json({ message: "User access disabled", userId: targetUserId });
  } catch (error) {
    console.error("Disable user error:", error);
    res.status(500).json({ error: "Failed to disable user" });
  }
});

router.post("/revoke-api-key/:id", accessReviewActionLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const id = req.params.id as string;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, tenantId },
    });

    if (!apiKey) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "API_KEY_REVOKED",
      entityType: "ApiKey",
      entityId: id,
      metadata: { keyName: apiKey.name },
    });

    res.json({ message: "API key revoked", keyId: id });
  } catch (error) {
    console.error("Revoke API key error:", error);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

router.post("/rotate-api-key/:id", accessReviewActionLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const id = req.params.id as string;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, tenantId },
    });

    if (!apiKey) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    const crypto = await import("crypto");
    const newKeyHash = crypto.randomBytes(32).toString("hex");
    const newKeyPrefix = `dpf_${crypto.randomBytes(4).toString("hex")}`;

    await prisma.apiKey.update({
      where: { id },
      data: {
        keyHash: crypto.createHash("sha256").update(newKeyHash).digest("hex"),
        keyPrefix: newKeyPrefix,
        createdAt: new Date(),
      },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "API_KEY_ROTATED",
      entityType: "ApiKey",
      entityId: id,
      metadata: { keyName: apiKey.name },
    });

    res.json({
      message: "API key rotated",
      keyId: id,
      newKey: `${newKeyPrefix}_${newKeyHash}`,
      note: "Store this key securely - it cannot be retrieved again",
    });
  } catch (error) {
    console.error("Rotate API key error:", error);
    res.status(500).json({ error: "Failed to rotate API key" });
  }
});

export default router;
