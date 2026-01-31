import { raiseIncident, resolveIncidentsByType } from "./incidentService";

const WEB_URL = process.env.WEB_URL || "http://localhost:3000";

interface HealthCheckResult {
  success: boolean;
  details: Record<string, unknown>;
}

export async function checkWebHealth(): Promise<HealthCheckResult> {
  const endpoints = [
    { path: "/", name: "Homepage" },
    { path: "/login", name: "Login Page" },
  ];

  const results: Array<{ name: string; status: number | null; ok: boolean; error?: string }> = [];
  let allHealthy = true;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${WEB_URL}${endpoint.path}`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const ok = response.status >= 200 && response.status < 400;
      results.push({
        name: endpoint.name,
        status: response.status,
        ok,
      });

      if (!ok) {
        allHealthy = false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      results.push({
        name: endpoint.name,
        status: null,
        ok: false,
        error: errorMessage,
      });
      allHealthy = false;
    }
  }

  if (allHealthy) {
    await resolveIncidentsByType("web_down");
    return {
      success: true,
      details: {
        message: "All web endpoints healthy",
        results,
      },
    };
  }

  const failedEndpoints = results.filter((r) => !r.ok);
  await raiseIncident({
    type: "web_down",
    severity: "high",
    message: `Web health check failed: ${failedEndpoints.map((e) => e.name).join(", ")}`,
    details: {
      failedEndpoints,
      checkedAt: new Date().toISOString(),
    },
  });

  return {
    success: false,
    details: {
      message: "Web health check failed",
      results,
    },
  };
}
