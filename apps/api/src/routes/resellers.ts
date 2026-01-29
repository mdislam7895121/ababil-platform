import { Router, Response } from "express";
import { prisma } from "../index.js";
import { AuthRequest } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

const createResellerSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  domain: z.string().optional(),
  subdomain: z.string().optional(),
  showPoweredBy: z.boolean().optional(),
  commissionType: z.enum(["fixed", "percentage"]).optional(),
  commissionValue: z.number().min(0).max(100).optional(),
  ownerUserId: z.string().optional(),
});

const updateResellerSchema = createResellerSchema.partial();

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const userRole = req.membership?.role;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (userRole === "owner" || userRole === "admin") {
      const resellers = await prisma.reseller.findMany({
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { tenants: true, invoices: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ resellers });
    }

    const resellers = await prisma.reseller.findMany({
      where: { ownerUserId: userId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { tenants: true, invoices: true } },
      },
    });
    res.json({ resellers });
  } catch (error) {
    console.error("Error fetching resellers:", error);
    res.status(500).json({ error: "Failed to fetch resellers" });
  }
});

router.get("/my", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const reseller = await prisma.reseller.findFirst({
      where: { ownerUserId: userId },
      include: {
        tenants: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            createdAt: true,
          },
        },
      },
    });

    if (!reseller) {
      return res.status(404).json({ error: "Not a reseller" });
    }

    const paidInvoices = await prisma.invoice.findMany({
      where: {
        resellerId: reseller.id,
        status: "paid",
      },
      include: {
        tenant: { select: { name: true, slug: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    const totalCommission = paidInvoices.reduce(
      (sum, inv) => sum + (inv.resellerCommission ? Number(inv.resellerCommission) : 0),
      0
    );

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const monthlyInvoices = paidInvoices.filter(
      (inv) => inv.paidAt && new Date(inv.paidAt) >= thisMonth
    );
    const monthlyCommission = monthlyInvoices.reduce(
      (sum, inv) => sum + (inv.resellerCommission ? Number(inv.resellerCommission) : 0),
      0
    );

    res.json({
      reseller,
      customers: reseller.tenants,
      earnings: {
        total: totalCommission,
        monthly: monthlyCommission,
        invoiceCount: paidInvoices.length,
        monthlyInvoiceCount: monthlyInvoices.length,
      },
      recentInvoices: paidInvoices.slice(0, 10),
    });
  } catch (error) {
    console.error("Error fetching reseller dashboard:", error);
    res.status(500).json({ error: "Failed to fetch reseller data" });
  }
});

router.get("/my/payouts", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const reseller = await prisma.reseller.findFirst({
      where: { ownerUserId: userId },
    });
    if (!reseller) {
      return res.status(403).json({ error: "Not a reseller" });
    }
    const payouts = await prisma.resellerPayout.findMany({
      where: { resellerId: reseller.id },
      orderBy: { periodStart: "desc" },
      take: 50,
    });
    res.json({ payouts });
  } catch (error) {
    console.error("Error fetching my payouts:", error);
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});

router.get("/my/ledger", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const reseller = await prisma.reseller.findFirst({
      where: { ownerUserId: userId },
    });
    if (!reseller) {
      return res.status(403).json({ error: "Not a reseller" });
    }
    const entries = await prisma.resellerLedgerEntry.findMany({
      where: { resellerId: reseller.id },
      orderBy: { occurredAt: "desc" },
      take: 100,
      include: { invoice: { select: { id: true, amount: true } } },
    });
    const balance = entries.reduce((sum, e) => sum + Number(e.amount), 0);
    res.json({ entries, balance });
  } catch (error) {
    console.error("Error fetching my ledger:", error);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

router.get("/branding/lookup", async (req: AuthRequest, res: Response) => {
  try {
    const { domain, subdomain, slug } = req.query;

    let reseller = null;

    if (domain) {
      reseller = await prisma.reseller.findFirst({
        where: { domain: domain as string, status: "active" },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          showPoweredBy: true,
        },
      });
    }

    if (!reseller && subdomain) {
      reseller = await prisma.reseller.findFirst({
        where: { subdomain: subdomain as string, status: "active" },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          showPoweredBy: true,
        },
      });
    }

    if (!reseller && slug) {
      reseller = await prisma.reseller.findFirst({
        where: { slug: slug as string, status: "active" },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          showPoweredBy: true,
        },
      });
    }

    if (!reseller) {
      return res.json({
        branding: null,
        isWhiteLabel: false,
      });
    }

    res.json({
      branding: reseller,
      isWhiteLabel: true,
    });
  } catch (error) {
    console.error("Error looking up branding:", error);
    res.status(500).json({ error: "Failed to lookup branding" });
  }
});

router.get("/platform/summary", async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.membership?.role;
    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Only platform admins can view summary" });
    }

    const resellers = await prisma.reseller.findMany({
      include: {
        _count: { select: { tenants: true } },
      },
    });

    const allInvoices = await prisma.invoice.findMany({
      where: { status: "paid" },
    });

    const totalRevenue = allInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const totalCommissions = allInvoices.reduce(
      (sum, inv) => sum + (inv.resellerCommission ? Number(inv.resellerCommission) : 0),
      0
    );
    const platformRevenue = allInvoices.reduce(
      (sum, inv) => sum + (inv.platformRevenue ? Number(inv.platformRevenue) : 0),
      0
    );

    const resellerStats = resellers.map((r) => {
      const resellerInvoices = allInvoices.filter((inv) => inv.resellerId === r.id);
      return {
        id: r.id,
        name: r.name,
        customerCount: r._count.tenants,
        totalRevenue: resellerInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0),
        totalCommission: resellerInvoices.reduce(
          (sum, inv) => sum + (inv.resellerCommission ? Number(inv.resellerCommission) : 0),
          0
        ),
        status: r.status,
      };
    });

    res.json({
      summary: {
        totalResellers: resellers.length,
        activeResellers: resellers.filter((r) => r.status === "active").length,
        totalTenants: resellers.reduce((sum, r) => sum + r._count.tenants, 0),
        totalRevenue,
        totalCommissions,
        platformRevenue: platformRevenue || totalRevenue - totalCommissions,
      },
      resellers: resellerStats,
    });
  } catch (error) {
    console.error("Error fetching platform summary:", error);
    res.status(500).json({ error: "Failed to fetch platform summary" });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;

    const reseller = await prisma.reseller.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        tenants: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            createdAt: true,
          },
        },
      },
    });

    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ reseller });
  } catch (error) {
    console.error("Error fetching reseller:", error);
    res.status(500).json({ error: "Failed to fetch reseller" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const userRole = req.membership?.role;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Only platform admins can create resellers" });
    }

    const data = createResellerSchema.parse(req.body);

    const existingSlug = await prisma.reseller.findUnique({
      where: { slug: data.slug },
    });
    if (existingSlug) {
      return res.status(400).json({ error: "Slug already in use" });
    }

    if (data.domain) {
      const existingDomain = await prisma.reseller.findUnique({
        where: { domain: data.domain },
      });
      if (existingDomain) {
        return res.status(400).json({ error: "Domain already in use" });
      }
    }

    if (data.subdomain) {
      const existingSubdomain = await prisma.reseller.findUnique({
        where: { subdomain: data.subdomain },
      });
      if (existingSubdomain) {
        return res.status(400).json({ error: "Subdomain already in use" });
      }
    }

    const reseller = await prisma.reseller.create({
      data: {
        name: data.name,
        slug: data.slug,
        ownerUserId: data.ownerUserId || userId,
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor || "#3B82F6",
        secondaryColor: data.secondaryColor,
        domain: data.domain,
        subdomain: data.subdomain,
        showPoweredBy: data.showPoweredBy ?? true,
        commissionType: data.commissionType || "percentage",
        commissionValue: data.commissionValue ?? 20,
        status: "active",
      },
    });

    res.status(201).json({ reseller });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error creating reseller:", error);
    res.status(500).json({ error: "Failed to create reseller" });
  }
});

router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const data = updateResellerSchema.parse(req.body);

    if (data.slug && data.slug !== reseller.slug) {
      const existingSlug = await prisma.reseller.findUnique({
        where: { slug: data.slug },
      });
      if (existingSlug) {
        return res.status(400).json({ error: "Slug already in use" });
      }
    }

    const updated = await prisma.reseller.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.secondaryColor !== undefined && { secondaryColor: data.secondaryColor }),
        ...(data.domain !== undefined && { domain: data.domain }),
        ...(data.subdomain !== undefined && { subdomain: data.subdomain }),
        ...(data.showPoweredBy !== undefined && { showPoweredBy: data.showPoweredBy }),
        ...(data.commissionType && { commissionType: data.commissionType }),
        ...(data.commissionValue !== undefined && { commissionValue: data.commissionValue }),
      },
    });

    res.json({ reseller: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error updating reseller:", error);
    res.status(500).json({ error: "Failed to update reseller" });
  }
});

router.patch("/:id/branding", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const brandingSchema = z.object({
      logoUrl: z.string().url().optional().nullable(),
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
      showPoweredBy: z.boolean().optional(),
    });

    const data = brandingSchema.parse(req.body);

    const updated = await prisma.reseller.update({
      where: { id },
      data: {
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.primaryColor && { primaryColor: data.primaryColor }),
        ...(data.secondaryColor !== undefined && { secondaryColor: data.secondaryColor }),
        ...(data.showPoweredBy !== undefined && { showPoweredBy: data.showPoweredBy }),
      },
    });

    res.json({ reseller: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error updating branding:", error);
    res.status(500).json({ error: "Failed to update branding" });
  }
});

router.get("/:id/customers", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const customers = await prisma.tenant.findMany({
      where: { resellerId: id },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
        subscription: {
          select: {
            status: true,
            currentPeriodEnd: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

router.get("/:id/earnings", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        resellerId: id,
        status: "paid",
      },
      include: {
        tenant: { select: { name: true, slug: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const totalCommission = invoices.reduce(
      (sum, inv) => sum + (inv.resellerCommission ? Number(inv.resellerCommission) : 0),
      0
    );

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const monthlyInvoices = invoices.filter(
      (inv) => inv.paidAt && new Date(inv.paidAt) >= thisMonth
    );
    const monthlyRevenue = monthlyInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const monthlyCommission = monthlyInvoices.reduce(
      (sum, inv) => sum + (inv.resellerCommission ? Number(inv.resellerCommission) : 0),
      0
    );

    res.json({
      summary: {
        totalRevenue,
        totalCommission,
        monthlyRevenue,
        monthlyCommission,
        totalInvoices: invoices.length,
        monthlyInvoices: monthlyInvoices.length,
      },
      invoices: invoices.slice(0, 50),
    });
  } catch (error) {
    console.error("Error fetching earnings:", error);
    res.status(500).json({ error: "Failed to fetch earnings" });
  }
});

router.get("/:id/statements", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const statements = await prisma.resellerStatement.findMany({
      where: { resellerId: id },
      orderBy: { periodStart: "desc" },
    });

    res.json({ statements });
  } catch (error) {
    console.error("Error fetching statements:", error);
    res.status(500).json({ error: "Failed to fetch statements" });
  }
});

router.post("/:id/statements/generate", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.membership?.role;

    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Only platform admins can generate statements" });
    }

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const existingStatement = await prisma.resellerStatement.findUnique({
      where: {
        resellerId_periodStart: {
          resellerId: id,
          periodStart,
        },
      },
    });

    if (existingStatement) {
      return res.status(400).json({ error: "Statement already exists for this period" });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        resellerId: id,
        status: "paid",
        paidAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const commission = invoices.reduce(
      (sum, inv) => sum + (inv.resellerCommission ? Number(inv.resellerCommission) : 0),
      0
    );

    const statement = await prisma.resellerStatement.create({
      data: {
        resellerId: id,
        periodStart,
        periodEnd,
        totalRevenue,
        commission,
        invoiceCount: invoices.length,
        status: "pending",
      },
    });

    res.status(201).json({ statement });
  } catch (error) {
    console.error("Error generating statement:", error);
    res.status(500).json({ error: "Failed to generate statement" });
  }
});

router.post("/assign-tenant", async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.membership?.role;
    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Only platform admins can assign tenants" });
    }

    const { tenantId, resellerId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID is required" });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (resellerId) {
      const reseller = await prisma.reseller.findUnique({ where: { id: resellerId } });
      if (!reseller) {
        return res.status(404).json({ error: "Reseller not found" });
      }
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { resellerId: resellerId || null },
    });

    res.json({ tenant: updated });
  } catch (error) {
    console.error("Error assigning tenant:", error);
    res.status(500).json({ error: "Failed to assign tenant" });
  }
});

// ============== PAYOUT & LEDGER ENDPOINTS ==============

const generatePayoutSchema = z.object({
  periodStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  periodEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  currency: z.enum(["USD", "BDT"]).default("USD"),
});

const adjustmentSchema = z.object({
  currency: z.enum(["USD", "BDT"]).default("USD"),
  amount: z.number(),
  note: z.string().min(1),
});

const markPaidSchema = z.object({
  payoutMethod: z.enum(["bank", "bkash", "stripe", "manual"]),
  payoutDetails: z.record(z.any()).optional(),
});

router.post("/:id/payouts/generate", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.membership?.role;
    const userId = req.userId;
    const tenantId = req.tenantId;

    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Only platform admins can generate payouts" });
    }

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    const data = generatePayoutSchema.parse(req.body);
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);
    periodEnd.setHours(23, 59, 59, 999);

    const existingPayout = await prisma.resellerPayout.findFirst({
      where: {
        resellerId: id,
        periodStart,
        periodEnd,
        currency: data.currency,
      },
    });
    if (existingPayout) {
      return res.status(400).json({ error: "Payout already exists for this period and currency" });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        resellerId: id,
        status: "paid",
        currency: data.currency,
        paidAt: { gte: periodStart, lte: periodEnd },
      },
    });

    const grossRevenue = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const commissionEarned = invoices.reduce(
      (sum, inv) => sum + (inv.resellerCommission ? Number(inv.resellerCommission) : 0),
      0
    );

    const adjustmentEntries = await prisma.resellerLedgerEntry.findMany({
      where: {
        resellerId: id,
        currency: data.currency,
        type: "adjustment",
        occurredAt: { gte: periodStart, lte: periodEnd },
      },
    });
    const adjustments = adjustmentEntries.reduce((sum, e) => sum + Number(e.amount), 0);
    const netPayable = commissionEarned + adjustments;

    const payout = await prisma.resellerPayout.create({
      data: {
        resellerId: id,
        periodStart,
        periodEnd,
        currency: data.currency,
        grossRevenue,
        commissionEarned,
        adjustments,
        netPayable,
        status: "owed",
      },
    });

    if (tenantId && userId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId,
          action: "RESELLER_PAYOUT_GENERATED",
          entityType: "reseller_payout",
          entityId: payout.id,
          metadata: { resellerId: id, periodStart, periodEnd, currency: data.currency, netPayable },
        },
      });
    }

    res.status(201).json({
      payout,
      breakdown: {
        invoiceCount: invoices.length,
        grossRevenue,
        commissionEarned,
        adjustments,
        netPayable,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error generating payout:", error);
    res.status(500).json({ error: "Failed to generate payout" });
  }
});

router.get("/:id/payouts", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const payouts = await prisma.resellerPayout.findMany({
      where: { resellerId: id },
      orderBy: { periodStart: "desc" },
      take: limit,
    });

    res.json({ payouts });
  } catch (error) {
    console.error("Error fetching payouts:", error);
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});

router.get("/:id/payouts/:payoutId", async (req: AuthRequest, res: Response) => {
  try {
    const { id, payoutId } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const payout = await prisma.resellerPayout.findFirst({
      where: { id: payoutId, resellerId: id },
      include: { approvedBy: { select: { id: true, name: true, email: true } } },
    });

    if (!payout) {
      return res.status(404).json({ error: "Payout not found" });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        resellerId: id,
        status: "paid",
        currency: payout.currency,
        paidAt: { gte: payout.periodStart, lte: payout.periodEnd },
      },
      include: { tenant: { select: { name: true, slug: true } } },
      orderBy: { paidAt: "desc" },
    });

    const adjustments = await prisma.resellerLedgerEntry.findMany({
      where: {
        resellerId: id,
        currency: payout.currency,
        type: "adjustment",
        occurredAt: { gte: payout.periodStart, lte: payout.periodEnd },
      },
      orderBy: { occurredAt: "desc" },
    });

    res.json({ payout, invoices, adjustments });
  } catch (error) {
    console.error("Error fetching payout:", error);
    res.status(500).json({ error: "Failed to fetch payout" });
  }
});

router.post("/:id/payouts/:payoutId/approve", async (req: AuthRequest, res: Response) => {
  try {
    const { id, payoutId } = req.params;
    const userRole = req.membership?.role;
    const userId = req.userId;
    const tenantId = req.tenantId;

    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Only platform admins can approve payouts" });
    }

    const payout = await prisma.resellerPayout.findFirst({
      where: { id: payoutId, resellerId: id },
    });

    if (!payout) {
      return res.status(404).json({ error: "Payout not found" });
    }

    if (payout.status !== "owed") {
      return res.status(400).json({ error: `Cannot approve payout with status: ${payout.status}` });
    }

    const updated = await prisma.resellerPayout.update({
      where: { id: payoutId },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedById: userId,
      },
    });

    if (tenantId && userId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId,
          action: "RESELLER_PAYOUT_APPROVED",
          entityType: "reseller_payout",
          entityId: payoutId,
          metadata: { resellerId: id, netPayable: Number(payout.netPayable) },
        },
      });
    }

    res.json({ payout: updated });
  } catch (error) {
    console.error("Error approving payout:", error);
    res.status(500).json({ error: "Failed to approve payout" });
  }
});

router.post("/:id/payouts/:payoutId/mark-paid", async (req: AuthRequest, res: Response) => {
  try {
    const { id, payoutId } = req.params;
    const userRole = req.membership?.role;
    const userId = req.userId;
    const tenantId = req.tenantId;

    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Only platform admins can mark payouts as paid" });
    }

    const payout = await prisma.resellerPayout.findFirst({
      where: { id: payoutId, resellerId: id },
    });

    if (!payout) {
      return res.status(404).json({ error: "Payout not found" });
    }

    if (payout.status !== "approved") {
      return res.status(400).json({ error: `Cannot mark as paid a payout with status: ${payout.status}` });
    }

    const data = markPaidSchema.parse(req.body);

    const updated = await prisma.resellerPayout.update({
      where: { id: payoutId },
      data: {
        status: "paid",
        paidAt: new Date(),
        payoutMethod: data.payoutMethod,
        payoutDetails: data.payoutDetails || {},
      },
    });

    await prisma.resellerLedgerEntry.create({
      data: {
        resellerId: id,
        currency: payout.currency,
        type: "payout",
        amount: -Number(payout.netPayable),
        note: `Payout #${payoutId.slice(0, 8)} via ${data.payoutMethod}`,
        occurredAt: new Date(),
      },
    });

    if (tenantId && userId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId,
          action: "RESELLER_PAYOUT_MARKED_PAID",
          entityType: "reseller_payout",
          entityId: payoutId,
          metadata: { resellerId: id, payoutMethod: data.payoutMethod, netPayable: Number(payout.netPayable) },
        },
      });
    }

    res.json({ payout: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error marking payout as paid:", error);
    res.status(500).json({ error: "Failed to mark payout as paid" });
  }
});

router.post("/:id/ledger/adjust", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.membership?.role;
    const userId = req.userId;
    const tenantId = req.tenantId;

    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Only platform admins can add adjustments" });
    }

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    const data = adjustmentSchema.parse(req.body);

    const entry = await prisma.resellerLedgerEntry.create({
      data: {
        resellerId: id,
        currency: data.currency,
        type: "adjustment",
        amount: data.amount,
        note: data.note,
        occurredAt: new Date(),
      },
    });

    if (tenantId && userId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId,
          action: "RESELLER_LEDGER_ADJUSTED",
          entityType: "reseller_ledger_entry",
          entityId: entry.id,
          metadata: { resellerId: id, amount: data.amount, currency: data.currency, note: data.note },
        },
      });
    }

    res.status(201).json({ entry });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("Error adding adjustment:", error);
    res.status(500).json({ error: "Failed to add adjustment" });
  }
});

router.get("/:id/ledger", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.membership?.role;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const reseller = await prisma.reseller.findUnique({ where: { id } });
    if (!reseller) {
      return res.status(404).json({ error: "Reseller not found" });
    }

    if (reseller.ownerUserId !== userId && userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const entries = await prisma.resellerLedgerEntry.findMany({
      where: { resellerId: id },
      orderBy: { occurredAt: "desc" },
      take: limit,
      include: {
        invoice: { select: { id: true, amount: true, tenantId: true } },
      },
    });

    const balance = entries.reduce((sum, e) => sum + Number(e.amount), 0);

    res.json({ entries, balance });
  } catch (error) {
    console.error("Error fetching ledger:", error);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

// ============== LEDGER ACCRUAL HELPER ==============

export async function createLedgerAccrualForInvoice(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { reseller: true },
  });

  if (!invoice || invoice.status !== "paid" || !invoice.resellerId || !invoice.resellerCommission) {
    return;
  }

  const existing = await prisma.resellerLedgerEntry.findFirst({
    where: {
      resellerId: invoice.resellerId,
      invoiceId: invoice.id,
      type: "commission_accrual",
    },
  });

  if (existing) {
    return;
  }

  await prisma.resellerLedgerEntry.create({
    data: {
      resellerId: invoice.resellerId,
      invoiceId: invoice.id,
      currency: invoice.currency,
      type: "commission_accrual",
      amount: Number(invoice.resellerCommission),
      note: `Commission for invoice ${invoice.id.slice(0, 8)}`,
      occurredAt: invoice.paidAt || new Date(),
    },
  });
}

export function calculateCommission(
  amount: number,
  commissionType: string,
  commissionValue: number
): { commission: number; platformRevenue: number } {
  let commission = 0;

  if (commissionType === "percentage") {
    commission = (amount * commissionValue) / 100;
  } else {
    commission = Math.min(commissionValue, amount);
  }

  return {
    commission: Math.round(commission * 100) / 100,
    platformRevenue: Math.round((amount - commission) * 100) / 100,
  };
}

export default router;
