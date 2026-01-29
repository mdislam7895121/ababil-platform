import { Router, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest, requireRole } from "../middleware/auth";
import {
  getActiveIncidents,
  getLastCheckTimes,
  calculateOverallStatus,
  checkApiHealth,
  checkWebHealth,
  checkGoldenFlows,
} from "../jobs/monitoring";

const router = Router();
const prisma = new PrismaClient();

router.get(
  "/status",
  requireRole("owner", "admin"),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const activeIncidents = await getActiveIncidents();
      const lastChecks = await getLastCheckTimes();
      const overallStatus = calculateOverallStatus(activeIncidents);

      res.json({
        overallStatus,
        lastChecks,
        activeIncidentsCount: activeIncidents.length,
        activeIncidents: activeIncidents.slice(0, 5),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/incidents",
  requireRole("owner", "admin"),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const type = req.query.type as string | undefined;
      const resolved = req.query.resolved as string | undefined;

      let where: any = {};
      if (type) {
        where.type = type;
      }
      if (resolved === "true") {
        where.resolvedAt = { not: null };
      } else if (resolved === "false") {
        where.resolvedAt = null;
      }

      const incidents = await prisma.incident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      res.json({ incidents });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/incidents/:id",
  requireRole("owner", "admin"),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const incident = await prisma.incident.findUnique({
        where: { id: req.params.id },
      });

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      res.json(incident);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/run-check",
  requireRole("owner", "admin"),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { check } = req.body;

      let result;
      switch (check) {
        case "api":
          result = await checkApiHealth();
          break;
        case "web":
          result = await checkWebHealth();
          break;
        case "golden":
          result = await checkGoldenFlows();
          break;
        default:
          return res.status(400).json({ error: "Invalid check type. Use: api, web, or golden" });
      }

      res.json({
        check,
        ...result,
        ranAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/job-runs",
  requireRole("owner", "admin"),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const name = req.query.name as string | undefined;

      const where: any = {};
      if (name) {
        where.name = name;
      }

      const jobRuns = await prisma.jobRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      res.json({ jobRuns });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
