import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface JobResult {
  success: boolean;
  details: {
    cleanedCount: number;
    error?: string;
  };
}

export async function cleanupI18nCache(): Promise<JobResult> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const deleted = await prisma.aiCache.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { createdAt: { lt: thirtyDaysAgo } },
        ],
      },
    });

    return {
      success: true,
      details: {
        cleanedCount: deleted.count,
      },
    };
  } catch (error) {
    return {
      success: false,
      details: {
        cleanedCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
