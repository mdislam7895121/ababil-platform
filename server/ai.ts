import OpenAI from "openai";
import { createHash } from "crypto";
import { storage } from "./storage";

// Only initialize OpenAI if API key is available
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// AI Configuration
const AI_CONFIG = {
  model: "gpt-4o-mini", // Small model first for cost efficiency
  maxTokens: 1000,
  temperature: 0.7,
  cacheTTLHours: 24,
  quotas: {
    free: { dailyRequests: 10, monthlyTokens: 50000 },
    starter: { dailyRequests: 100, monthlyTokens: 500000 },
    pro: { dailyRequests: 1000, monthlyTokens: 5000000 },
    enterprise: { dailyRequests: 10000, monthlyTokens: 50000000 },
  },
};

// Check if AI is available
export function isAiAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Generate prompt hash for caching
function hashPrompt(message: string): string {
  return createHash("sha256").update(message.toLowerCase().trim()).digest("hex");
}

// Get period boundaries
function getPeriodBoundaries(): { daily: { start: Date; end: Date }; monthly: { start: Date; end: Date } } {
  const now = new Date();
  
  const dailyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dailyEnd = new Date(dailyStart.getTime() + 24 * 60 * 60 * 1000);
  
  const monthlyStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  return {
    daily: { start: dailyStart, end: dailyEnd },
    monthly: { start: monthlyStart, end: monthlyEnd },
  };
}

// Check quota
async function checkQuota(tenantId: string, plan: string): Promise<{ allowed: boolean; reason?: string }> {
  const quotas = AI_CONFIG.quotas[plan as keyof typeof AI_CONFIG.quotas] || AI_CONFIG.quotas.free;
  const periods = getPeriodBoundaries();
  
  const dailyUsage = await storage.getAiUsage(tenantId, periods.daily.start);
  if (dailyUsage && dailyUsage.requestCount >= quotas.dailyRequests) {
    return { allowed: false, reason: "Daily request limit reached" };
  }
  
  const monthlyUsage = await storage.getAiUsage(tenantId, periods.monthly.start);
  const totalTokens = (monthlyUsage?.tokensIn || 0) + (monthlyUsage?.tokensOut || 0);
  if (totalTokens >= quotas.monthlyTokens) {
    return { allowed: false, reason: "Monthly token limit reached" };
  }
  
  return { allowed: true };
}

// Track usage
async function trackUsage(tenantId: string, tokensIn: number, tokensOut: number): Promise<void> {
  const periods = getPeriodBoundaries();
  
  await storage.upsertAiUsage(
    tenantId,
    periods.daily.start,
    periods.daily.end,
    1,
    tokensIn,
    tokensOut
  );
  
  await storage.upsertAiUsage(
    tenantId,
    periods.monthly.start,
    periods.monthly.end,
    1,
    tokensIn,
    tokensOut
  );
}

// System prompt
const SYSTEM_PROMPT = `You are a helpful AI assistant for the Digital Platform Factory, a multi-tenant SaaS platform. You help users with:
- Understanding platform features (modules, connectors, API keys, users)
- Navigating the admin dashboard
- Troubleshooting common issues
- Best practices for platform usage

Be concise, helpful, and professional. If you don't know something, say so.`;

export interface ChatResponse {
  reply: string;
  cached: boolean;
  usage?: { tokensIn: number; tokensOut: number };
}

export async function chat(
  tenantId: string,
  plan: string,
  message: string
): Promise<ChatResponse> {
  // Mock mode if no API key
  if (!isAiAvailable()) {
    return {
      reply: "AI features are currently in demo mode. The AI assistant would normally help you with platform questions, navigation, and troubleshooting.",
      cached: false,
    };
  }

  // Check quota
  const quotaCheck = await checkQuota(tenantId, plan);
  if (!quotaCheck.allowed) {
    throw new Error(quotaCheck.reason);
  }

  // Check cache
  const promptHash = hashPrompt(message);
  const cached = await storage.getAiCache(tenantId, promptHash);
  if (cached) {
    return {
      reply: cached.response,
      cached: true,
      usage: { tokensIn: cached.tokensIn, tokensOut: cached.tokensOut },
    };
  }

  // Call OpenAI
  try {
    if (!openai) {
      throw new Error("OpenAI client not initialized");
    }
    const completion = await openai.chat.completions.create({
      model: AI_CONFIG.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      max_tokens: AI_CONFIG.maxTokens,
      temperature: AI_CONFIG.temperature,
    });

    const reply = completion.choices[0]?.message?.content || "I couldn't generate a response.";
    const tokensIn = completion.usage?.prompt_tokens || 0;
    const tokensOut = completion.usage?.completion_tokens || 0;

    // Track usage
    await trackUsage(tenantId, tokensIn, tokensOut);

    // Cache response
    const expiresAt = new Date(Date.now() + AI_CONFIG.cacheTTLHours * 60 * 60 * 1000);
    await storage.createAiCache({
      tenantId,
      promptHash,
      response: reply,
      tokensIn,
      tokensOut,
      expiresAt,
    });

    return {
      reply,
      cached: false,
      usage: { tokensIn, tokensOut },
    };
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate AI response");
  }
}
