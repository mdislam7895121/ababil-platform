import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AuthRequest, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";

const router = Router();
const prisma = new PrismaClient();

const evidenceExportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => `evidence-export:${req.tenantId}`,
  message: { error: "Daily export limit reached (10/day). Please try again tomorrow." },
});

const exportSchema = z.object({
  type: z.enum(["audit", "support", "incidents", "access_review"]),
  format: z.enum(["json", "csv"]),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  const sensitiveKeys = ["password", "secret", "token", "key", "authorization", "apikey", "api_key"];
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      result[key] = "[REDACTED]";
    } else if (typeof result[key] === "object") {
      result[key] = redactSensitiveData(result[key]);
    }
  }
  return result;
}

router.post("/exports", evidenceExportLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const parsed = exportSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const { type, format, fromDate, toDate } = parsed.data;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const job = await prisma.evidenceExportJob.create({
      data: {
        tenantId,
        requestedByUserId: userId,
        type,
        format,
        status: "pending",
        fromDate: fromDate ? new Date(fromDate) : null,
        toDate: toDate ? new Date(toDate) : null,
        expiresAt,
      },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "EVIDENCE_EXPORT_REQUESTED",
      entityType: "EvidenceExportJob",
      entityId: job.id,
      metadata: { type, format },
    });

    processExportJob(job.id, tenantId, type, format, fromDate, toDate).catch(console.error);

    res.status(201).json({ exportJobId: job.id, status: "pending" });
  } catch (error) {
    console.error("Evidence export create error:", error);
    res.status(500).json({ error: "Failed to create export job" });
  }
});

async function processExportJob(
  jobId: string,
  tenantId: string,
  type: string,
  format: string,
  fromDate?: string,
  toDate?: string
) {
  try {
    const dateFilter: any = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    let data: any[] = [];

    if (type === "audit") {
      data = await prisma.auditLog.findMany({
        where: {
          tenantId,
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 10000,
      });
      data = data.map(log => ({
        ...log,
        metadata: redactSensitiveData(log.metadata),
      }));
    } else if (type === "support") {
      data = await prisma.supportTicket.findMany({
        where: {
          tenantId,
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
    } else if (type === "incidents") {
      data = await prisma.incident.findMany({
        where: {
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
    } else if (type === "access_review") {
      const [users, apiKeys] = await Promise.all([
        prisma.membership.findMany({
          where: { tenantId },
          include: { user: { select: { email: true, name: true, status: true, createdAt: true } } },
        }),
        prisma.apiKey.findMany({
          where: { tenantId },
          select: { id: true, name: true, createdAt: true, expiresAt: true, lastUsedAt: true },
        }),
      ]);
      data = [{ users, apiKeys }];
    }

    let content: string;
    let fileExt: string;

    if (format === "json") {
      content = JSON.stringify(data, null, 2);
      fileExt = "json";
    } else {
      if (type === "audit" && data.length > 0) {
        const headers = ["createdAt", "actorUserId", "action", "entityType", "entityId", "metadataJsonRedacted"];
        const rows = data.map(log => [
          log.createdAt?.toISOString() || "",
          log.actorUserId || "",
          log.action || "",
          log.entityType || "",
          log.entityId || "",
          JSON.stringify(log.metadata || {}),
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
        content = [headers.join(","), ...rows].join("\n");
      } else {
        content = JSON.stringify(data, null, 2);
      }
      fileExt = "csv";
    }

    const exportDir = path.join(process.cwd(), "exports");
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const fileName = `${type}_${tenantId}_${jobId}.${fileExt}`;
    const filePath = path.join(exportDir, fileName);
    fs.writeFileSync(filePath, content);
    const fileSize = Buffer.byteLength(content, "utf8");

    await prisma.evidenceExportJob.update({
      where: { id: jobId },
      data: { status: "ready", filePath: fileName, fileSize },
    });

    await logAudit({
      tenantId,
      actorUserId: "system",
      action: "EVIDENCE_EXPORT_READY",
      entityType: "EvidenceExportJob",
      entityId: jobId,
      metadata: { type, format, fileSize },
    });
  } catch (error) {
    console.error("Export job processing error:", error);
    await prisma.evidenceExportJob.update({
      where: { id: jobId },
      data: { status: "failed", errorMessage: String(error) },
    });
    await logAudit({
      tenantId,
      actorUserId: "system",
      action: "EVIDENCE_EXPORT_FAILED",
      entityType: "EvidenceExportJob",
      entityId: jobId,
      metadata: { error: String(error) },
    });
  }
}

router.get("/exports", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;

    const jobs = await prisma.evidenceExportJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ exports: jobs });
  } catch (error) {
    console.error("Evidence exports list error:", error);
    res.status(500).json({ error: "Failed to list exports" });
  }
});

router.get("/exports/:id", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;

    const job = await prisma.evidenceExportJob.findFirst({
      where: { id, tenantId },
    });

    if (!job) {
      res.status(404).json({ error: "Export not found" });
      return;
    }

    res.json({ export: job });
  } catch (error) {
    console.error("Evidence export status error:", error);
    res.status(500).json({ error: "Failed to get export status" });
  }
});

router.get("/exports/:id/download", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const id = req.params.id as string;

    const job = await prisma.evidenceExportJob.findFirst({
      where: { id, tenantId },
    });

    if (!job) {
      res.status(404).json({ error: "Export not found" });
      return;
    }

    if (job.status !== "ready") {
      res.status(400).json({ error: `Export is not ready. Status: ${job.status}` });
      return;
    }

    if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
      res.status(410).json({ error: "Export has expired" });
      return;
    }

    if (!job.filePath) {
      res.status(400).json({ error: "Export file path is missing" });
      return;
    }

    const exportDir = path.join(process.cwd(), "exports");
    const filePath = path.join(exportDir, job.filePath);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Export file not found" });
      return;
    }

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "EVIDENCE_EXPORT_DOWNLOADED",
      entityType: "EvidenceExportJob",
      entityId: id,
      metadata: { type: job.type, format: job.format },
    });

    const contentType = job.format === "json" ? "application/json" : "text/csv";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${job.filePath}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error("Evidence export download error:", error);
    res.status(500).json({ error: "Failed to download export" });
  }
});

export async function cleanupEvidenceExports() {
  try {
    const expiredJobs = await prisma.evidenceExportJob.findMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { not: "expired" },
      },
    });

    const exportDir = path.join(process.cwd(), "exports");

    for (const job of expiredJobs) {
      if (job.filePath) {
        const filePath = path.join(exportDir, job.filePath);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      await prisma.evidenceExportJob.update({
        where: { id: job.id },
        data: { status: "expired" },
      });
    }

    console.log(`Cleaned up ${expiredJobs.length} expired evidence export jobs`);
  } catch (error) {
    console.error("Evidence export cleanup error:", error);
  }
}

export default router;
