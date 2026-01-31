import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router = Router();
const prisma = new PrismaClient();

router.get("/sla", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { from, to } = req.query;

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from as string);
    if (to) dateFilter.lte = new Date(to as string);

    const tickets = await prisma.supportTicket.findMany({
      where: {
        tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    const incidents = await prisma.incident.findMany({
      where: {
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
    });

    const ticketMetrics = {
      created: tickets.length,
      solved: tickets.filter(t => t.status === "closed" || t.status === "solved").length,
      avgFirstResponseMins: 0,
      avgResolutionMins: 0,
      slaBreaches: 0,
    };

    if (tickets.length > 0) {
      const responseTimes: number[] = [];
      const resolutionTimes: number[] = [];

      for (const ticket of tickets) {
        if (ticket.messages && ticket.messages.length > 0) {
          const firstResponse = ticket.messages[0];
          const responseTime = (new Date(firstResponse.createdAt).getTime() - new Date(ticket.createdAt).getTime()) / 60000;
          responseTimes.push(responseTime);
          if (responseTime > 60) ticketMetrics.slaBreaches++;
        }

        if (ticket.solvedAt) {
          const resolutionTime = (new Date(ticket.solvedAt).getTime() - new Date(ticket.createdAt).getTime()) / 60000;
          resolutionTimes.push(resolutionTime);
        }
      }

      ticketMetrics.avgFirstResponseMins = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;

      ticketMetrics.avgResolutionMins = resolutionTimes.length > 0
        ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
        : 0;
    }

    const incidentMetrics = {
      count: incidents.length,
      avgTimeToResolveMins: 0,
      criticalCount: incidents.filter(i => i.severity === "critical").length,
    };

    if (incidents.length > 0) {
      const resolutionTimes: number[] = [];
      for (const incident of incidents) {
        if (incident.resolvedAt) {
          const resolutionTime = (new Date(incident.resolvedAt).getTime() - new Date(incident.createdAt).getTime()) / 60000;
          resolutionTimes.push(resolutionTime);
        }
      }
      incidentMetrics.avgTimeToResolveMins = resolutionTimes.length > 0
        ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
        : 0;
    }

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "SLA_REPORT_VIEWED",
      entityType: "SLAReport",
      entityId: tenantId,
      metadata: { from, to },
    });

    res.json({
      ticketMetrics,
      incidentMetrics,
      period: { from: from || null, to: to || null },
    });
  } catch (error) {
    console.error("SLA report error:", error);
    res.status(500).json({ error: "Failed to generate SLA report" });
  }
});

router.get("/sla/export", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { from, to, format = "json" } = req.query;

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from as string);
    if (to) dateFilter.lte = new Date(to as string);

    const [tickets, incidents] = await Promise.all([
      prisma.supportTicket.findMany({
        where: {
          tenantId,
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
        select: {
          id: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          solvedAt: true,
        },
      }),
      prisma.incident.findMany({
        where: {
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
        select: {
          id: true,
          message: true,
          severity: true,
          type: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
    ]);

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "SLA_REPORT_EXPORTED",
      entityType: "SLAReport",
      entityId: tenantId,
      metadata: { from, to, format },
    });

    const data = { tickets, incidents, exportedAt: new Date().toISOString() };

    if (format === "csv") {
      const ticketRows = tickets.map(t => 
        `"ticket","${t.id}","${t.subject}","${t.status}","${t.priority}","${t.createdAt?.toISOString()}","${t.solvedAt?.toISOString() || ""}"`
      );
      const incidentRows = incidents.map(i => 
        `"incident","${i.id}","${i.message}","${i.type}","${i.severity}","${i.createdAt?.toISOString()}","${i.resolvedAt?.toISOString() || ""}"`
      );
      const csv = ["type,id,description,status_type,priority_severity,createdAt,resolvedAt", ...ticketRows, ...incidentRows].join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="sla_report_${tenantId}.csv"`);
      res.send(csv);
      return;
    }

    res.json(data);
  } catch (error) {
    console.error("SLA report export error:", error);
    res.status(500).json({ error: "Failed to export SLA report" });
  }
});

export default router;
