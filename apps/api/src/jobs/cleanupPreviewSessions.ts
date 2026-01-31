import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface JobResult {
  success: boolean;
  details: {
    expiredCount: number;
    revokedCount: number;
    error?: string;
  };
}

export async function cleanupPreviewSessions(): Promise<JobResult> {
  const now = new Date();
  
  try {
    const expiredSessions = await prisma.previewSession.deleteMany({
      where: {
        OR: [
          {
            expiresAt: { lt: now },
            revoked: false,
          },
          {
            revoked: true,
          },
        ],
      },
    });

    const expiredCount = expiredSessions.count;

    return {
      success: true,
      details: {
        expiredCount,
        revokedCount: 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      details: {
        expiredCount: 0,
        revokedCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
