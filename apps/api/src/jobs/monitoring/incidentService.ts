import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEDUP_WINDOW_MINUTES = 60;
const ALERT_THROTTLE_MINUTES = 60;

type IncidentType = "api_down" | "web_down" | "golden_flow_failed";
type Severity = "low" | "medium" | "high";

interface IncidentData {
  type: IncidentType;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
}

export async function raiseIncident(data: IncidentData): Promise<string> {
  const now = new Date();
  const alertThrottleWindow = new Date(now.getTime() - ALERT_THROTTLE_MINUTES * 60 * 1000);

  const existingIncident = await prisma.incident.findFirst({
    where: {
      type: data.type,
      message: data.message,
      resolvedAt: null,
    },
    orderBy: { lastSeenAt: "desc" },
  });

  if (existingIncident) {
    await prisma.incident.update({
      where: { id: existingIncident.id },
      data: {
        lastSeenAt: now,
        details: data.details as any,
      },
    });
    console.log(`[Incident] Updated existing incident: ${existingIncident.id}`);
    return existingIncident.id;
  }

  const incident = await prisma.incident.create({
    data: {
      type: data.type,
      severity: data.severity,
      message: data.message,
      details: data.details as any,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });

  console.log(`[Incident] Created new incident: ${incident.id} - ${data.message}`);
  await sendAlert(incident.id, data);

  return incident.id;
}

export async function resolveIncidentsByType(type: IncidentType): Promise<number> {
  const now = new Date();

  const unresolvedIncidents = await prisma.incident.findMany({
    where: {
      type,
      resolvedAt: null,
    },
  });

  if (unresolvedIncidents.length === 0) {
    return 0;
  }

  await prisma.incident.updateMany({
    where: {
      type,
      resolvedAt: null,
    },
    data: {
      resolvedAt: now,
    },
  });

  console.log(`[Incident] Resolved ${unresolvedIncidents.length} incidents of type: ${type}`);
  return unresolvedIncidents.length;
}

export async function resolveIncidentByMessage(type: IncidentType, message: string): Promise<boolean> {
  const now = new Date();

  const incident = await prisma.incident.findFirst({
    where: {
      type,
      message,
      resolvedAt: null,
    },
  });

  if (!incident) {
    return false;
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: { resolvedAt: now },
  });

  console.log(`[Incident] Resolved incident: ${incident.id}`);
  return true;
}

async function sendAlert(incidentId: string, data: IncidentData): Promise<void> {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return;

  const throttleWindow = new Date(Date.now() - ALERT_THROTTLE_MINUTES * 60 * 1000);
  if (incident.alertSentAt && incident.alertSentAt > throttleWindow) {
    console.log(`[Alert] Throttled - alert already sent for incident ${incidentId}`);
    return;
  }

  console.log(`[Alert] Sending alert for incident ${incidentId}:`);
  console.log(`  Type: ${data.type}`);
  console.log(`  Severity: ${data.severity}`);
  console.log(`  Message: ${data.message}`);
  console.log(`  Details: ${JSON.stringify(data.details)}`);

  await prisma.incident.update({
    where: { id: incidentId },
    data: { alertSentAt: new Date() },
  });

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: null as any,
        userId: null as any,
        action: "INCIDENT_RAISED",
        entity: "incident",
        entityId: incidentId,
        details: {
          type: data.type,
          severity: data.severity,
          message: data.message,
        } as any,
      },
    });
  } catch (e) {
    console.log(`[Alert] Could not create audit log (tenant required): ${e}`);
  }
}

export async function getActiveIncidents() {
  return prisma.incident.findMany({
    where: { resolvedAt: null },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function getIncidentHistory(limit = 50) {
  return prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getLastCheckTimes() {
  const jobNames = ["checkApiHealth", "checkWebHealth", "checkGoldenFlows"];
  const lastChecks: Record<string, { time: string | null; status: string | null }> = {};

  for (const name of jobNames) {
    const lastRun = await prisma.jobRun.findFirst({
      where: { name },
      orderBy: { createdAt: "desc" },
    });

    lastChecks[name] = lastRun
      ? { time: lastRun.createdAt.toISOString(), status: lastRun.status }
      : { time: null, status: null };
  }

  return lastChecks;
}

export function calculateOverallStatus(
  activeIncidents: { severity: string }[]
): "green" | "yellow" | "red" {
  if (activeIncidents.length === 0) return "green";

  const hasHigh = activeIncidents.some((i) => i.severity === "high");
  const hasMedium = activeIncidents.some((i) => i.severity === "medium");

  if (hasHigh) return "red";
  if (hasMedium) return "yellow";
  return "yellow";
}
