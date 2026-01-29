import { raiseIncident, resolveIncidentsByType } from "./incidentService";

const API_URL = process.env.API_URL || "http://localhost:5000";

interface HealthCheckResult {
  success: boolean;
  details: Record<string, unknown>;
}

export async function checkApiHealth(): Promise<HealthCheckResult> {
  const endpoints = [
    { path: "/api/health", name: "Health Endpoint" },
    { path: "/api/ready", name: "Ready Endpoint" },
  ];

  const results: Array<{ name: string; status: number | null; ok: boolean; error?: string }> = [];
  let allHealthy = true;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}${endpoint.path}`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const ok = response.status >= 200 && response.status < 300;
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
    await resolveIncidentsByType("api_down");
    return {
      success: true,
      details: {
        message: "All API endpoints healthy",
        results,
      },
    };
  }

  const failedEndpoints = results.filter((r) => !r.ok);
  await raiseIncident({
    type: "api_down",
    severity: "high",
    message: `API health check failed: ${failedEndpoints.map((e) => e.name).join(", ")}`,
    details: {
      failedEndpoints,
      checkedAt: new Date().toISOString(),
    },
  });

  return {
    success: false,
    details: {
      message: "API health check failed",
      results,
    },
  };
}
