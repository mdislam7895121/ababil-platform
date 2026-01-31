import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest, requireRole } from "../middleware/auth";
import { getSchedulerStatus, runJobManually } from "../jobs";

const router = Router();
const prisma = new PrismaClient();

router.get(
  "/runs",
  requireRole("owner", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const name = req.query.name as string | undefined;

      const where = name ? { name } : {};

      const runs = await prisma.jobRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      res.json({ runs });
    } catch (error) {
      console.error("Error fetching job runs:", error);
      res.status(500).json({ error: "Failed to fetch job runs" });
    }
  }
);

router.get(
  "/status",
  requireRole("owner", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const status = getSchedulerStatus();
      res.json(status);
    } catch (error) {
      console.error("Error fetching scheduler status:", error);
      res.status(500).json({ error: "Failed to fetch scheduler status" });
    }
  }
);

router.post(
  "/run/:name",
  requireRole("owner", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const jobName = req.params.name;
      
      if (!jobName || typeof jobName !== "string") {
        return res.status(400).json({ error: "Job name is required" });
      }
      
      const result = await runJobManually(jobName);
      
      res.json({
        job: jobName,
        result,
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown job:")) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Error running job:", error);
      res.status(500).json({ error: "Failed to run job" });
    }
  }
);

export default router;
