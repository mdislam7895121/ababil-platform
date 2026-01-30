import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest, requireRole } from "../middleware/auth.js";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";

const prisma = new PrismaClient();

async function logAudit(params: {
  tenantId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as any
      }
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

const router = Router();

// Simple test route to verify partners module is loading
router.get("/test", (req, res) => {
  res.json({ ok: true, message: "Partners route is working!" });
});

const partnerApplyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: any) => `partner-apply:${req.tenantId}:${req.userId}`,
  message: { error: "Too many partner applications, please try again later" },
});

const partnerListingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => `partner-listing:${req.tenantId}:${req.userId}`,
  message: { error: "Too many listing requests, please try again later" },
});

const partnerPayoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => `partner-payout:${req.tenantId}:${req.userId}`,
  message: { error: "Too many payout requests, please try again later" },
});

const applySchema = z.object({
  displayName: z.string().min(2).max(100),
  contactEmail: z.string().email(),
  country: z.string().min(2).max(100).optional(),
  payoutPreferences: z.object({
    method: z.enum(["bank", "bkash", "stripe", "paypal"]).optional(),
    details: z.record(z.string()).optional(),
  }).optional(),
});

const listingSchema = z.object({
  marketplaceItemId: z.string().uuid(),
  commissionType: z.enum(["percent", "fixed"]).default("percent"),
  commissionValue: z.number().min(0).max(100).default(20),
  status: z.enum(["active", "paused"]).default("active"),
});

const updateListingSchema = listingSchema.partial().omit({ marketplaceItemId: true });

router.post("/apply", partnerApplyLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const parsed = applySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid application data", details: parsed.error.flatten() });
    }

    const existing = await prisma.partnerAccount.findUnique({
      where: { tenantId },
    });

    if (existing) {
      return res.status(409).json({ error: "Partner application already exists", status: existing.status });
    }

    const partner = await prisma.partnerAccount.create({
      data: {
        tenantId,
        displayName: parsed.data.displayName,
        contactEmail: parsed.data.contactEmail,
        country: parsed.data.country || "US",
        payoutPreferences: parsed.data.payoutPreferences || {},
        status: "pending",
      },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "PARTNER_APPLIED",
      entityType: "PartnerAccount",
      entityId: partner.id,
      metadata: { displayName: partner.displayName, contactEmail: partner.contactEmail },
    });

    res.status(201).json({ partner, message: "Partner application submitted" });
  } catch (error) {
    console.error("Partner apply error:", error);
    res.status(500).json({ error: "Failed to submit partner application" });
  }
});

router.get("/me", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const partner = await prisma.partnerAccount.findUnique({
      where: { tenantId },
      include: {
        listings: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { earnings: true, payouts: true },
        },
      },
    });

    if (!partner) {
      return res.status(404).json({ error: "Not a partner" });
    }

    res.json({ partner });
  } catch (error) {
    console.error("Partner me error:", error);
    res.status(500).json({ error: "Failed to fetch partner account" });
  }
});

router.get("/my/earnings", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { from, to } = req.query;

    const partner = await prisma.partnerAccount.findUnique({
      where: { tenantId },
    });

    if (!partner) {
      return res.status(403).json({ error: "Not a partner" });
    }

    const where: any = { partnerId: partner.id };
    if (from) where.createdAt = { ...(where.createdAt || {}), gte: new Date(from as string) };
    if (to) where.createdAt = { ...(where.createdAt || {}), lte: new Date(to as string) };

    const earnings = await prisma.partnerEarning.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const totals = await prisma.partnerEarning.aggregate({
      where: { partnerId: partner.id },
      _sum: {
        grossAmount: true,
        commissionAmount: true,
        partnerNet: true,
      },
    });

    res.json({
      earnings,
      totals: {
        grossAmount: Number(totals._sum.grossAmount || 0),
        commissionAmount: Number(totals._sum.commissionAmount || 0),
        partnerNet: Number(totals._sum.partnerNet || 0),
      },
    });
  } catch (error) {
    console.error("Partner my earnings error:", error);
    res.status(500).json({ error: "Failed to fetch earnings" });
  }
});

router.get("/my/payouts", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const partner = await prisma.partnerAccount.findUnique({
      where: { tenantId },
    });

    if (!partner) {
      return res.status(403).json({ error: "Not a partner" });
    }

    const payouts = await prisma.partnerPayout.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ payouts });
  } catch (error) {
    console.error("Partner my payouts error:", error);
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});

router.get("/my/listings", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const partner = await prisma.partnerAccount.findUnique({
      where: { tenantId },
    });

    if (!partner) {
      return res.status(403).json({ error: "Not a partner" });
    }

    const listings = await prisma.partnerListing.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({ listings });
  } catch (error) {
    console.error("Partner my listings error:", error);
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

router.get("/", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status && ["pending", "approved", "suspended"].includes(status as string)) {
      where.status = status;
    }

    const [partners, total] = await Promise.all([
      prisma.partnerAccount.findMany({
        where,
        include: {
          _count: { select: { listings: true, earnings: true, payouts: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.partnerAccount.count({ where }),
    ]);

    res.json({ partners, total, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error("List partners error:", error);
    res.status(500).json({ error: "Failed to list partners" });
  }
});

router.post("/:id/approve", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const partner = await prisma.partnerAccount.findUnique({
      where: { id },
    });

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    if (partner.status === "approved") {
      return res.status(400).json({ error: "Partner already approved" });
    }

    const updated = await prisma.partnerAccount.update({
      where: { id },
      data: { status: "approved" },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "PARTNER_APPROVED",
      entityType: "PartnerAccount",
      entityId: id,
      metadata: { previousStatus: partner.status },
    });

    res.json({ partner: updated, message: "Partner approved" });
  } catch (error) {
    console.error("Approve partner error:", error);
    res.status(500).json({ error: "Failed to approve partner" });
  }
});

router.post("/:id/suspend", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { reason } = req.body;

    const partner = await prisma.partnerAccount.findUnique({
      where: { id },
    });

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    if (partner.status === "suspended") {
      return res.status(400).json({ error: "Partner already suspended" });
    }

    const updated = await prisma.partnerAccount.update({
      where: { id },
      data: { status: "suspended" },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "PARTNER_SUSPENDED",
      entityType: "PartnerAccount",
      entityId: id,
      metadata: { previousStatus: partner.status, reason: reason || "No reason provided" },
    });

    res.json({ partner: updated, message: "Partner suspended" });
  } catch (error) {
    console.error("Suspend partner error:", error);
    res.status(500).json({ error: "Failed to suspend partner" });
  }
});

router.post("/:partnerId/listings", partnerListingLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.params;
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const parsed = listingSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid listing data", details: parsed.error.flatten() });
    }

    const partner = await prisma.partnerAccount.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const myPartner = await prisma.partnerAccount.findUnique({
      where: { tenantId },
    });
    const isOwnPartner = myPartner?.id === partnerId;
    const isAdmin = req.membership?.role === "owner" || req.membership?.role === "admin";

    if (!isAdmin && (!isOwnPartner || partner.status !== "approved")) {
      return res.status(403).json({ error: "Not authorized to create listings for this partner" });
    }

    const item = await prisma.marketplaceItem.findUnique({
      where: { id: parsed.data.marketplaceItemId },
    });

    if (!item) {
      return res.status(404).json({ error: "Marketplace item not found" });
    }

    const existingListing = await prisma.partnerListing.findUnique({
      where: { marketplaceItemId: parsed.data.marketplaceItemId },
    });

    if (existingListing) {
      return res.status(409).json({ error: "Marketplace item already has a partner listing" });
    }

    const listing = await prisma.partnerListing.create({
      data: {
        partnerId,
        marketplaceItemId: parsed.data.marketplaceItemId,
        commissionType: parsed.data.commissionType,
        commissionValue: parsed.data.commissionValue,
        status: parsed.data.status,
      },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "PARTNER_LISTING_CREATED",
      entityType: "PartnerListing",
      entityId: listing.id,
      metadata: {
        partnerId,
        marketplaceItemId: parsed.data.marketplaceItemId,
        commissionType: parsed.data.commissionType,
        commissionValue: parsed.data.commissionValue,
      },
    });

    res.status(201).json({ listing, message: "Partner listing created" });
  } catch (error) {
    console.error("Create partner listing error:", error);
    res.status(500).json({ error: "Failed to create partner listing" });
  }
});

router.get("/:partnerId/listings", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.params;

    const partner = await prisma.partnerAccount.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const listings = await prisma.partnerListing.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ listings });
  } catch (error) {
    console.error("Get partner listings error:", error);
    res.status(500).json({ error: "Failed to fetch partner listings" });
  }
});

router.get("/:partnerId/earnings", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.params;
    const { from, to } = req.query;

    const partner = await prisma.partnerAccount.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const where: any = { partnerId };
    if (from) where.createdAt = { ...(where.createdAt || {}), gte: new Date(from as string) };
    if (to) where.createdAt = { ...(where.createdAt || {}), lte: new Date(to as string) };

    const earnings = await prisma.partnerEarning.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const totals = await prisma.partnerEarning.aggregate({
      where: { partnerId },
      _sum: {
        grossAmount: true,
        commissionAmount: true,
        partnerNet: true,
      },
    });

    res.json({
      earnings,
      totals: {
        grossAmount: Number(totals._sum.grossAmount || 0),
        commissionAmount: Number(totals._sum.commissionAmount || 0),
        partnerNet: Number(totals._sum.partnerNet || 0),
      },
    });
  } catch (error) {
    console.error("Get partner earnings error:", error);
    res.status(500).json({ error: "Failed to fetch partner earnings" });
  }
});

router.post("/:partnerId/payouts/generate", partnerPayoutLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.params;
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const partner = await prisma.partnerAccount.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const paidPayoutIds = await prisma.partnerPayout.findMany({
      where: { partnerId, status: { in: ["approved", "paid"] } },
      select: { id: true },
    });

    const earningsNotPaid = await prisma.partnerEarning.findMany({
      where: { partnerId },
    });

    if (earningsNotPaid.length === 0) {
      return res.status(400).json({ error: "No earnings to generate payout from" });
    }

    const totalNet = earningsNotPaid.reduce(
      (sum, e) => sum + Number(e.partnerNet),
      0
    );

    if (totalNet <= 0) {
      return res.status(400).json({ error: "No positive earnings balance" });
    }

    const existingOwed = await prisma.partnerPayout.findFirst({
      where: { partnerId, status: "owed" },
    });

    if (existingOwed) {
      return res.status(409).json({
        error: "There is already an owed payout pending",
        payout: existingOwed,
      });
    }

    const payout = await prisma.partnerPayout.create({
      data: {
        partnerId,
        currency: "USD",
        amount: totalNet,
        status: "owed",
      },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "PARTNER_PAYOUT_GENERATED",
      entityType: "PartnerPayout",
      entityId: payout.id,
      metadata: { partnerId, amount: totalNet, earningsCount: earningsNotPaid.length },
    });

    res.status(201).json({ payout, message: "Payout generated" });
  } catch (error) {
    console.error("Generate partner payout error:", error);
    res.status(500).json({ error: "Failed to generate payout" });
  }
});

router.post("/:partnerId/payouts/:payoutId/approve", partnerPayoutLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId, payoutId } = req.params;
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const payout = await prisma.partnerPayout.findFirst({
      where: { id: payoutId, partnerId },
    });

    if (!payout) {
      return res.status(404).json({ error: "Payout not found" });
    }

    if (payout.status !== "owed") {
      return res.status(400).json({ error: `Cannot approve payout with status: ${payout.status}` });
    }

    const updated = await prisma.partnerPayout.update({
      where: { id: payoutId },
      data: {
        status: "approved",
        approvedAt: new Date(),
      },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "PARTNER_PAYOUT_APPROVED",
      entityType: "PartnerPayout",
      entityId: payoutId,
      metadata: { partnerId, amount: Number(payout.amount) },
    });

    res.json({ payout: updated, message: "Payout approved" });
  } catch (error) {
    console.error("Approve partner payout error:", error);
    res.status(500).json({ error: "Failed to approve payout" });
  }
});

router.post("/:partnerId/payouts/:payoutId/mark-paid", partnerPayoutLimiter, requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId, payoutId } = req.params;
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { payoutMethod, payoutDetails } = req.body;

    const payout = await prisma.partnerPayout.findFirst({
      where: { id: payoutId, partnerId },
    });

    if (!payout) {
      return res.status(404).json({ error: "Payout not found" });
    }

    if (payout.status !== "approved") {
      return res.status(400).json({ error: `Cannot mark as paid: payout status is ${payout.status}, expected approved` });
    }

    const updated = await prisma.partnerPayout.update({
      where: { id: payoutId },
      data: {
        status: "paid",
        paidAt: new Date(),
        payoutMethod: payoutMethod || null,
        payoutDetails: payoutDetails || null,
      },
    });

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: "PARTNER_PAYOUT_PAID",
      entityType: "PartnerPayout",
      entityId: payoutId,
      metadata: { partnerId, amount: Number(payout.amount), payoutMethod },
    });

    res.json({ payout: updated, message: "Payout marked as paid" });
  } catch (error) {
    console.error("Mark payout paid error:", error);
    res.status(500).json({ error: "Failed to mark payout as paid" });
  }
});

router.get("/:partnerId/payouts", requireRole("owner", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.params;

    const partner = await prisma.partnerAccount.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const payouts = await prisma.partnerPayout.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ payouts });
  } catch (error) {
    console.error("Get partner payouts error:", error);
    res.status(500).json({ error: "Failed to fetch partner payouts" });
  }
});

export async function accruePartnerEarning(invoiceId: string, grossAmount: number, currency: string = "USD"): Promise<boolean> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || invoice.status !== "paid") {
      return false;
    }

    const partnerListing = await prisma.partnerListing.findFirst({
      where: { status: "active" },
      include: { partner: true },
    });

    if (!partnerListing || partnerListing.partner.status !== "approved") {
      return false;
    }

    const existing = await prisma.partnerEarning.findUnique({
      where: {
        partnerId_invoiceId: {
          partnerId: partnerListing.partnerId,
          invoiceId,
        },
      },
    });

    if (existing) {
      return false;
    }

    let commissionAmount: number;
    if (partnerListing.commissionType === "percent") {
      commissionAmount = grossAmount * (Number(partnerListing.commissionValue) / 100);
    } else {
      commissionAmount = Math.min(Number(partnerListing.commissionValue), grossAmount);
    }

    const partnerNet = grossAmount - commissionAmount;

    await prisma.partnerEarning.create({
      data: {
        partnerId: partnerListing.partnerId,
        invoiceId,
        currency,
        grossAmount,
        commissionAmount,
        partnerNet,
      },
    });

    if (invoice.tenantId) {
      await logAudit({
        tenantId: invoice.tenantId,
        action: "PARTNER_EARNING_ACCRUED",
        entityType: "PartnerEarning",
        entityId: invoiceId,
        metadata: {
          partnerId: partnerListing.partnerId,
          grossAmount,
          commissionAmount,
          partnerNet,
        },
      });
    }

    return true;
  } catch (error) {
    console.error("Accrue partner earning error:", error);
    return false;
  }
}

export default router;
