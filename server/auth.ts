import { Request, Response, NextFunction } from "express";
import { createHash, randomBytes, createCipheriv, createDecipheriv, scrypt } from "crypto";
import { promisify } from "util";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import type { User, Tenant, Membership, Role } from "@shared/schema";

const scryptAsync = promisify(scrypt);
const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key-32chars!!!";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
      tenant?: Tenant;
      tenantId?: string;
      membership?: Membership;
      role?: Role;
    }
  }
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return salt + ":" + derivedKey.toString("hex");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return key === derivedKey.toString("hex");
}

// JWT tokens
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

// API Key generation
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = "dpf_" + randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, 12);
  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Secret encryption
function getEncryptionKeyBuffer(): Buffer {
  const key = Buffer.alloc(32);
  Buffer.from(ENCRYPTION_KEY).copy(key);
  return key;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getEncryptionKeyBuffer(), iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, data] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", getEncryptionKeyBuffer(), iv);
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Role hierarchy check
const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  staff: 2,
  viewer: 1,
};

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// Auth middleware
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Try API key first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer dpf_")) {
      const key = authHeader.substring(7);
      const keyHash = hashApiKey(key);
      const apiKey = await storage.getApiKeyByHash(keyHash);
      
      if (apiKey) {
        await storage.updateApiKeyLastUsed(apiKey.id);
        const tenant = await storage.getTenantById(apiKey.tenantId);
        if (tenant) {
          req.tenantId = tenant.id;
          req.tenant = tenant;
          return next();
        }
      }
      return res.status(401).json({ error: "Invalid API key" });
    }

    // Try JWT token
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      if (decoded) {
        const user = await storage.getUserById(decoded.userId);
        if (user) {
          req.user = user;
          
          // Get tenant from header
          const tenantId = req.headers["x-tenant-id"] as string;
          if (tenantId) {
            const membership = await storage.getMembership(tenantId, user.id);
            if (membership) {
              const tenant = await storage.getTenantById(tenantId);
              req.tenant = tenant;
              req.tenantId = tenantId;
              req.membership = membership;
              req.role = membership.role as Role;
            }
          }
          
          return next();
        }
      }
    }

    return res.status(401).json({ error: "Authentication required" });
  } catch (error) {
    return res.status(401).json({ error: "Authentication failed" });
  }
}

// Require tenant middleware
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantId) {
    return res.status(400).json({ error: "Tenant ID required (x-tenant-id header)" });
  }
  next();
}

// Require role middleware
export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.role) {
      return res.status(403).json({ error: "No role assigned" });
    }
    if (!hasPermission(req.role, minRole)) {
      return res.status(403).json({ error: `Requires ${minRole} role or higher` });
    }
    next();
  };
}

// Simple rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.tenantId || req.ip || "anonymous";
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({ error: "Too many requests" });
    }

    record.count++;
    next();
  };
}
