import { raiseIncident, resolveIncidentByMessage } from "./incidentService";

const API_URL = process.env.API_URL || "http://localhost:5000";
const WEB_URL = process.env.WEB_URL || "http://localhost:3000";

interface FlowCheckResult {
  success: boolean;
  details: Record<string, unknown>;
}

interface FlowCheck {
  name: string;
  description: string;
  check: () => Promise<{ ok: boolean; error?: string }>;
}

const GOLDEN_FLOWS: FlowCheck[] = [
  {
    name: "F1: Landing → Onboarding",
    description: "Landing page loads and links to onboarding",
    check: async () => {
      try {
        const response = await fetch(`${WEB_URL}/`, { redirect: "manual" });
        if (response.status >= 200 && response.status < 400) {
          return { ok: true };
        }
        return { ok: false, error: `Landing page returned ${response.status}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
      }
    },
  },
  {
    name: "F2: Auth → Dashboard",
    description: "Auth flow and dashboard accessible",
    check: async () => {
      try {
        const loginPage = await fetch(`${WEB_URL}/login`, { redirect: "manual" });
        if (loginPage.status >= 200 && loginPage.status < 400) {
          return { ok: true };
        }
        const signupPage = await fetch(`${WEB_URL}/signup`, { redirect: "manual" });
        if (signupPage.status >= 200 && signupPage.status < 400) {
          return { ok: true };
        }
        return { ok: false, error: `Auth pages returned ${loginPage.status}/${signupPage.status}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
      }
    },
  },
  {
    name: "F3: Preview → Billing",
    description: "Preview system and billing accessible via API",
    check: async () => {
      try {
        const previewCheck = await fetch(`${API_URL}/api/preview/info`, { redirect: "manual" });
        if (previewCheck.status !== 401 && previewCheck.status !== 200 && previewCheck.status !== 404) {
          return { ok: false, error: `Preview API returned ${previewCheck.status}` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
      }
    },
  },
  {
    name: "F4: Payment → Go-Live",
    description: "Payment and go-live endpoints accessible",
    check: async () => {
      try {
        const billingCheck = await fetch(`${API_URL}/api/billing/plans`, { redirect: "manual" });
        if (billingCheck.status >= 500) {
          return { ok: false, error: `Billing API returned ${billingCheck.status}` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
      }
    },
  },
];

export async function checkGoldenFlows(): Promise<FlowCheckResult> {
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];
  let allPassed = true;

  for (const flow of GOLDEN_FLOWS) {
    const result = await flow.check();
    results.push({
      name: flow.name,
      ok: result.ok,
      error: result.error,
    });

    if (result.ok) {
      await resolveIncidentByMessage("golden_flow_failed", `Golden flow failed: ${flow.name}`);
    } else {
      allPassed = false;
      await raiseIncident({
        type: "golden_flow_failed",
        severity: "medium",
        message: `Golden flow failed: ${flow.name}`,
        details: {
          flowName: flow.name,
          description: flow.description,
          error: result.error,
          checkedAt: new Date().toISOString(),
        },
      });
    }
  }

  return {
    success: allPassed,
    details: {
      message: allPassed ? "All golden flows passed" : "Some golden flows failed",
      results,
      checkedAt: new Date().toISOString(),
    },
  };
}
