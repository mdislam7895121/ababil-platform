import { PrismaClient } from "@prisma/client";
import { existsSync, unlinkSync, readdirSync, statSync, rmSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();
const MOBILE_BUILD_DIR = "/tmp/mobile-builds";

export async function cleanupMobileBuilds(): Promise<{
  success: boolean;
  details: Record<string, unknown>;
}> {
  try {
    const now = new Date();
    let dbExpired = 0;
    let filesDeleted = 0;
    let orphanFilesDeleted = 0;

    const expiredJobs = await prisma.mobileBuildJob.findMany({
      where: {
        expiresAt: { lt: now },
        status: "completed",
      },
      select: { id: true, filePath: true },
    });

    for (const job of expiredJobs) {
      if (job.filePath && existsSync(job.filePath)) {
        try {
          unlinkSync(job.filePath);
          filesDeleted++;
        } catch (err) {
          console.error(`Failed to delete file ${job.filePath}:`, err);
        }
      }

      await prisma.mobileBuildJob.update({
        where: { id: job.id },
        data: {
          status: "expired",
          filePath: null,
          downloadUrl: null,
        },
      });
      dbExpired++;
    }

    if (existsSync(MOBILE_BUILD_DIR)) {
      const files = readdirSync(MOBILE_BUILD_DIR);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith(".zip")) continue;

        const filePath = join(MOBILE_BUILD_DIR, file);
        try {
          const stat = statSync(filePath);
          
          const match = file.match(/expo-app-([a-f0-9-]+)\.zip/);
          if (match) {
            const jobId = match[1];
            const job = await prisma.mobileBuildJob.findUnique({
              where: { id: jobId },
              select: { id: true, status: true },
            });

            if (!job || job.status === "expired" || job.status === "failed") {
              unlinkSync(filePath);
              orphanFilesDeleted++;
              continue;
            }
          }

          if (stat.mtimeMs < oneHourAgo) {
            const staleJob = await prisma.mobileBuildJob.findFirst({
              where: { filePath },
              select: { id: true, expiresAt: true },
            });

            if (!staleJob) {
              unlinkSync(filePath);
              orphanFilesDeleted++;
            }
          }
        } catch (err) {
          console.error(`Failed to process file ${filePath}:`, err);
        }
      }
    }

    console.log(
      `[cleanupMobileBuilds] Expired: ${dbExpired} jobs, ${filesDeleted} files deleted, ${orphanFilesDeleted} orphan files removed`
    );

    return {
      success: true,
      details: {
        expiredJobs: dbExpired,
        filesDeleted,
        orphanFilesDeleted,
      },
    };
  } catch (error) {
    console.error("[cleanupMobileBuilds] Error:", error);
    return {
      success: false,
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
