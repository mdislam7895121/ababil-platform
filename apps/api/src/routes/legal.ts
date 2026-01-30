import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AuthRequest, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router = Router();
const prisma = new PrismaClient();

const LEGAL_TEMPLATES = [
  { type: "terms", name: "Terms of Service", description: "Standard terms and conditions" },
  { type: "privacy", name: "Privacy Policy", description: "Data privacy and handling policy" },
  { type: "refunds", name: "Refund Policy", description: "Payment and refund terms" },
];

const generateSchema = z.object({
  docType: z.enum(["terms", "privacy", "refunds"]),
  companyName: z.string().min(1).max(200),
  country: z.string().min(2).max(100),
  supportEmail: z.string().email(),
  billingModel: z.enum(["subscription", "one-time", "usage-based", "freemium"]),
  whiteLabel: z.boolean().optional(),
});

function generateTermsOfService(data: z.infer<typeof generateSchema>): { html: string; markdown: string } {
  const { companyName, country, supportEmail, billingModel } = data;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const markdown = `# Terms of Service

**${companyName}**
**Effective Date:** ${date}

## 1. Acceptance of Terms

By accessing or using ${companyName}'s services, you agree to be bound by these Terms of Service.

## 2. Description of Service

${companyName} provides a digital platform service with ${billingModel} billing model.

## 3. User Accounts

- You must provide accurate information when creating an account
- You are responsible for maintaining account security
- You must be at least 18 years old to use this service

## 4. Acceptable Use

You agree not to:
- Violate any applicable laws
- Infringe intellectual property rights
- Transmit malicious code or interfere with the service

## 5. Payment Terms

${billingModel === "subscription" ? "Subscription fees are billed in advance and are non-refundable except as stated in our refund policy." : 
  billingModel === "one-time" ? "One-time payments are processed at the time of purchase." :
  billingModel === "usage-based" ? "You will be billed based on your usage of the service." :
  "Basic features are free. Premium features require payment."}

## 6. Limitation of Liability

${companyName} shall not be liable for any indirect, incidental, or consequential damages.

## 7. Governing Law

These terms are governed by the laws of ${country}.

## 8. Contact

For questions, contact: ${supportEmail}

---
© ${new Date().getFullYear()} ${companyName}. All rights reserved.`;

  const html = markdownToHtml(markdown);
  return { html, markdown };
}

function generatePrivacyPolicy(data: z.infer<typeof generateSchema>): { html: string; markdown: string } {
  const { companyName, country, supportEmail } = data;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const markdown = `# Privacy Policy

**${companyName}**
**Effective Date:** ${date}

## 1. Information We Collect

We collect information you provide directly:
- Account information (name, email)
- Payment information
- Usage data and analytics

## 2. How We Use Your Information

We use collected information to:
- Provide and improve our services
- Process transactions
- Send service communications
- Comply with legal obligations

## 3. Data Sharing

We do not sell your personal information. We may share data with:
- Service providers who assist our operations
- Legal authorities when required by law

## 4. Data Security

We implement industry-standard security measures to protect your data.

## 5. Your Rights

You have the right to:
- Access your personal data
- Request data correction or deletion
- Opt out of marketing communications

## 6. Data Retention

We retain data for as long as your account is active or as needed for legal compliance.

## 7. International Transfers

Your data may be transferred to and processed in ${country} or other jurisdictions.

## 8. Contact

For privacy inquiries: ${supportEmail}

---
© ${new Date().getFullYear()} ${companyName}. All rights reserved.`;

  const html = markdownToHtml(markdown);
  return { html, markdown };
}

function generateRefundPolicy(data: z.infer<typeof generateSchema>): { html: string; markdown: string } {
  const { companyName, billingModel, supportEmail } = data;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const markdown = `# Refund Policy

**${companyName}**
**Effective Date:** ${date}

## 1. Refund Eligibility

${billingModel === "subscription" ? 
  `Subscription refunds may be requested within 14 days of initial purchase. After 14 days, no refunds will be issued for subscription payments.` :
  billingModel === "one-time" ?
  `One-time purchases are eligible for refund within 30 days if the service was not used.` :
  billingModel === "usage-based" ?
  `Usage-based charges are non-refundable as they reflect actual service consumption.` :
  `Free tier usage is not eligible for refunds. Premium feature refunds follow our standard 14-day policy.`}

## 2. How to Request a Refund

Contact ${supportEmail} with:
- Your account email
- Order/invoice number
- Reason for refund request

## 3. Refund Processing

Approved refunds are processed within 5-10 business days to your original payment method.

## 4. Exceptions

Refunds may be denied if:
- Terms of service were violated
- Service was substantially used
- Request is outside the refund window

## 5. Cancellation

${billingModel === "subscription" ?
  "You may cancel your subscription at any time. Access continues until the end of the billing period." :
  "Service cancellation does not automatically trigger a refund."}

## 6. Contact

For refund requests: ${supportEmail}

---
© ${new Date().getFullYear()} ${companyName}. All rights reserved.`;

  const html = markdownToHtml(markdown);
  return { html, markdown };
}

function markdownToHtml(markdown: string): string {
  let html = markdown
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.+<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/^---$/gm, "<hr>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6}h1,h2,h3{margin-top:1.5rem}ul{padding-left:1.5rem}</style></head><body><p>${html}</p></body></html>`;
}

router.get("/templates", async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ templates: LEGAL_TEMPLATES });
});

router.post("/generate", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const parsed = generateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    let result: { html: string; markdown: string };

    switch (parsed.data.docType) {
      case "terms":
        result = generateTermsOfService(parsed.data);
        break;
      case "privacy":
        result = generatePrivacyPolicy(parsed.data);
        break;
      case "refunds":
        result = generateRefundPolicy(parsed.data);
        break;
      default:
        res.status(400).json({ error: "Unknown document type" });
        return;
    }

    await prisma.legalDoc.create({
      data: {
        tenantId,
        docType: parsed.data.docType,
        html: result.html,
        markdown: result.markdown,
      },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "LEGAL_DOC_GENERATED",
      entityType: "LegalDoc",
      entityId: parsed.data.docType,
      metadata: { docType: parsed.data.docType, companyName: parsed.data.companyName },
    });

    res.json({ ...result, docType: parsed.data.docType });
  } catch (error) {
    console.error("Legal doc generate error:", error);
    res.status(500).json({ error: "Failed to generate legal document" });
  }
});

router.get("/docs", requireRole("owner", "admin"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const docs = await prisma.legalDoc.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "LEGAL_DOC_VIEWED",
      entityType: "LegalDoc",
      entityId: tenantId,
    });

    res.json({ docs });
  } catch (error) {
    console.error("Legal docs list error:", error);
    res.status(500).json({ error: "Failed to list legal documents" });
  }
});

export default router;
