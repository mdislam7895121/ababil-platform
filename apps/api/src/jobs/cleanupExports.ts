import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const EXPORTS_DIR = path.join(process.cwd(), "tmp", "exports");

export async function cleanupExports(): Promise<{
  success: boolean;
  details: { expiredCount: number; deletedFilesCount: number; errorCount: number };
}> {
  const now = new Date();
  let expiredCount = 0;
  let deletedFilesCount = 0;
  let errorCount = 0;

  try {
    const expiredJobs = await prisma.exportJob.findMany({
      where: {
        status: "ready",
        expiresAt: { lt: now },
      },
    });

    for (const job of expiredJobs) {
      try {
        if (job.filePath) {
          const filePath = path.join(EXPORTS_DIR, job.filePath);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedFilesCount++;
          }
        }

        await prisma.exportJob.update({
          where: { id: job.id },
          data: { status: "expired", filePath: null },
        });

        expiredCount++;
      } catch (err) {
        console.error(`[CleanupExports] Error processing job ${job.id}:`, err);
        errorCount++;
      }
    }

    const failedOldJobs = await prisma.exportJob.findMany({
      where: {
        status: { in: ["pending", "processing", "failed"] },
        createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });

    for (const job of failedOldJobs) {
      try {
        await prisma.exportJob.update({
          where: { id: job.id },
          data: { status: "expired" },
        });
        expiredCount++;
      } catch (err) {
        errorCount++;
      }
    }

    console.log(
      `[CleanupExports] Processed ${expiredCount} expired jobs, deleted ${deletedFilesCount} files, ${errorCount} errors`
    );

    return {
      success: true,
      details: { expiredCount, deletedFilesCount, errorCount },
    };
  } catch (error) {
    console.error("[CleanupExports] Job failed:", error);
    return {
      success: false,
      details: { expiredCount, deletedFilesCount, errorCount },
    };
  }
}
