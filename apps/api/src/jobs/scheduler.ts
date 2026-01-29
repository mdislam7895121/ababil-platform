import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { cleanupPreviewSessions } from "./cleanupPreviewSessions";
import { cleanupI18nCache } from "./cleanupI18nCache";
import { cleanupExports } from "./cleanupExports";

const prisma = new PrismaClient();

let isSchedulerRunning = false;

async function recordJobRun(
  name: string,
  startedAt: Date,
  status: "success" | "failed",
  details: Record<string, unknown>
) {
  try {
    await prisma.jobRun.create({
      data: {
        name,
        status,
        startedAt,
        endedAt: new Date(),
        details: details as any,
      },
    });
  } catch (error) {
    console.error(`Failed to record job run for ${name}:`, error);
  }
}

async function runJob(
  name: string,
  jobFn: () => Promise<{ success: boolean; details: Record<string, unknown> }>
) {
  const startedAt = new Date();
  console.log(`[Jobs] Starting job: ${name}`);

  try {
    const result = await jobFn();
    const status = result.success ? "success" : "failed";
    
    await recordJobRun(name, startedAt, status, result.details);
    
    console.log(`[Jobs] Completed job: ${name} (${status})`, result.details);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    await recordJobRun(name, startedAt, "failed", { error: errorMessage });
    
    console.error(`[Jobs] Job failed: ${name}`, error);
    return { success: false, details: { error: errorMessage } };
  }
}

export function startScheduler() {
  if (isSchedulerRunning) {
    console.log("[Jobs] Scheduler already running, skipping duplicate start");
    return;
  }

  const jobsEnabled = process.env.JOBS_ENABLED !== "false";
  
  if (!jobsEnabled) {
    console.log("[Jobs] Jobs scheduler disabled via JOBS_ENABLED=false");
    return;
  }

  isSchedulerRunning = true;
  console.log("[Jobs] Jobs scheduler enabled");

  cron.schedule("0 */6 * * *", async () => {
    await runJob("cleanupPreviewSessions", cleanupPreviewSessions);
  });

  cron.schedule("0 3 * * *", async () => {
    await runJob("cleanupI18nCache", cleanupI18nCache);
  });

  cron.schedule("0 */4 * * *", async () => {
    await runJob("cleanupExports", cleanupExports);
  });

  console.log("[Jobs] Scheduled jobs:");
  console.log("  - cleanupPreviewSessions: every 6 hours (0 */6 * * *)");
  console.log("  - cleanupI18nCache: daily at 3am (0 3 * * *)");
  console.log("  - cleanupExports: every 4 hours (0 */4 * * *)");
}

export async function runJobManually(jobName: string) {
  switch (jobName) {
    case "cleanupPreviewSessions":
      return runJob("cleanupPreviewSessions", cleanupPreviewSessions);
    case "cleanupI18nCache":
      return runJob("cleanupI18nCache", cleanupI18nCache);
    case "cleanupExports":
      return runJob("cleanupExports", cleanupExports);
    default:
      throw new Error(`Unknown job: ${jobName}`);
  }
}

export function getSchedulerStatus() {
  return {
    running: isSchedulerRunning,
    enabled: process.env.JOBS_ENABLED !== "false",
    jobs: [
      { name: "cleanupPreviewSessions", schedule: "0 */6 * * *", description: "Cleanup expired preview sessions" },
      { name: "cleanupI18nCache", schedule: "0 3 * * *", description: "Cleanup old i18n cache entries" },
      { name: "cleanupExports", schedule: "0 */4 * * *", description: "Cleanup expired export files" },
    ],
  };
}
