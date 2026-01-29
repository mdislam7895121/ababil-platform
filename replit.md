# Digital Platform Factory

## Overview

This is a production-grade multi-tenant Digital Platform Factory built as a full-stack TypeScript monorepo. The application enables businesses to create and manage their own digital workspaces with features including user management, API key generation, module configuration, connector integrations, audit logging, and AI-powered assistance.

The platform follows a multi-tenant architecture where each business operates as an isolated tenant/workspace with their own users, configurations, and data.

## User Preferences

Preferred communication style: Simple, everyday language.

## Project Structure

```
/
├── apps/
│   ├── api/          # Express + TypeScript + Prisma backend API
│   ├── web/          # Next.js web admin dashboard
│   └── mobile/       # Expo mobile shell with basic navigation
├── packages/
│   └── shared/       # Shared Zod schemas, types, RBAC utilities
└── server/           # Entry point shim (imports from apps/api)
```

## System Architecture

### Backend Architecture (apps/api)
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **ORM**: Prisma with PostgreSQL
- **API Design**: RESTful endpoints under `/api/` prefix with JSON responses
- **Entry Point**: `apps/api/src/index.ts`

### Web Frontend Architecture (apps/web)
- **Framework**: Next.js 14 with App Router
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **State Management**: TanStack React Query for server state

### Mobile Architecture (apps/mobile)
- **Framework**: Expo with Expo Router
- **Navigation**: Tab-based navigation with login, dashboard, modules, settings screens

### Authentication & Authorization
- **Auth Method**: JWT tokens with Bearer authentication
- **Password Security**: Scrypt-based password hashing with random salts
- **Multi-tenancy**: Tenant ID passed via `x-tenant-id` header
- **RBAC**: Role-based access control with membership system (owner, admin, staff, viewer roles)
- **Rate Limiting**: express-rate-limit for API protection
- **Secrets**: Encrypted at rest using AES-256-GCM

### Data Storage
- **Database**: PostgreSQL with Prisma ORM
- **Schema Location**: `apps/api/prisma/schema.prisma`
- **Migrations**: Prisma with `npx prisma db push` command
- **Core Entities**: Tenants, Users, Memberships, API Keys, Audit Logs, Module Flags, Connector Configs, AI Usage/Cache

### AI Integration
- **Provider**: OpenAI (optional, gracefully degrades if API key missing)
- **Cost Control**: Small model first strategy (gpt-4o-mini), usage quotas per plan tier, response caching
- **Safety**: AI module disabled by default, must be explicitly enabled per tenant

### Module System
- Pluggable feature modules: booking, ecommerce, crm, support, analytics, ai_assistant
- Feature flags stored per-tenant for granular control
- Each module can have associated configuration

### Connector System
- Third-party service integrations: Stripe, Email, Storage, Push notifications
- Config stored with encrypted secrets
- Placeholder architecture for easy extension

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **Prisma ORM**: Type-safe database queries and schema management with auto-generated client

### AI Services
- **OpenAI API**: Optional AI assistant functionality, requires `OPENAI_API_KEY`
- **Replit AI Integrations**: Additional audio, image, and chat capabilities via `AI_INTEGRATIONS_OPENAI_API_KEY`

### Key Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (required)
- `SESSION_SECRET`: JWT signing secret
- `ENCRYPTION_KEY`: Secret encryption key (32 characters)
- `OPENAI_API_KEY`: OpenAI API access (optional)
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Replit AI integrations

## Running the Application

The `npm run dev` command starts the Express API server on port 5000. The server entry point (`server/index.ts`) imports and runs the API from `apps/api/src/index.ts`.

For the Next.js web dashboard, run `cd apps/web && npm run dev` (runs on port 3000).

For the Expo mobile app, run `cd apps/mobile && npx expo start`.

## Phase 1 Features (Demand-Focused Upgrade)

### Post-Build Checklist
- **API**: `/api/checklist` - Get checklist items, progress, and blocking items
- **Endpoints**: `GET /`, `POST /complete`, `POST /reset`
- Tracks required vs optional items, shows what's blocking go-live

### Live Preview Mode
- **API**: `/api/preview` - Create shareable preview sessions
- **Endpoints**: `POST /create`, `GET /validate`, `GET /demo-data`, `GET /sessions`, `DELETE /sessions/:id`
- Role-based previews (admin/staff/customer), 24-hour expiry, demo data clearly marked

### Industry Presets
- **API**: `/api/presets` - Get and apply industry-specific configurations
- **Endpoints**: `GET /`, `GET /:templateKey/:presetKey`, `POST /apply`, `GET /applied`
- Templates: booking (salon, clinic, gym), ecommerce (grocery, clothing, pharmacy), crm, support
- Applied preset stored in tenant.settings

### Cost Transparency Panel
- **API**: `/api/costs` - Get monthly cost estimates
- Breakdown by category: hosting, database, email, AI, platform
- Shows what's paid to whom with min/max estimates

### Human-Friendly Error Messages
- **Location**: `apps/api/src/lib/errors.ts`
- Error types: DATABASE_CONNECTION_FAILED, JWT_SECRET_MISSING, ENCRYPTION_KEY_INVALID, etc.
- Each error includes actionable guidance for the user

## Zero-Thinking Mode (Auto-Pilot UX) Features

### Guided Setup
- **API**: `/api/setup` - Track and verify setup progress
- **Endpoints**: `GET /state`, `POST /step/:key/verify`, `POST /step/:key/complete`, `POST /verify-all`
- **Steps tracked**: database, secrets, email, payments, ai, deploy_check
- Shows progress percentage, blocking items, and ready-to-deploy status

### Environment Auto-Generator
- **API**: `/api/env/generate` - Generate secure random secrets
- Creates SESSION_SECRET (64 chars hex) and ENCRYPTION_KEY (32 chars hex)
- Returns one-time values with storage instructions

### Health Monitor
- **API**: `/api/health/status/summary` - Traffic light status
- Status: green (healthy), yellow (warnings), red (critical/Safe Mode)
- Returns issues with actionable guidance

### Safe Mode
- **Location**: `apps/api/src/lib/safeMode.ts`
- Active when critical config missing (SESSION_SECRET, ENCRYPTION_KEY)
- Blocks external actions (AI calls, emails, payments)
- Enforced in AI route with 503 response

### What's Missing Panel
- **API**: `/api/health/status/missing` - Proactive suggestions
- Shows unconfigured optional features with impact statements
- Priority levels: high, medium, low

### Pre-Flight Check
- **API**: `/api/deploy/preflight` - Block bad deploys
- Checks: database, JWT secret, encryption key, admin user
- Returns canDeploy boolean and blocking issues list

### Simple Analytics
- **API**: `/api/analytics/summary` - Zero-setup metrics
- Metrics: totalUsers, activeUsersToday, requestsToday, aiRequestsToday, aiTokensToday
- Derived from existing audit logs and AI usage data

### Deploy Wizard UI Enhancements
- **Health Badge**: Dashboard header shows traffic light status (green/yellow/red) with link to Deploy Wizard
- **Secret Generator**: Step 3 includes button to generate SESSION_SECRET (64 chars) and ENCRYPTION_KEY (32 chars)
- **Pre-Flight Check**: Step 5 runs deployment readiness checks before allowing verification
- **Go-Live Flow**: Step 6 shows Go-Live button after successful verification; status transitions: pending → verified → live
- **API**: `/api/deploy/go-live` - Marks tenant as LIVE after successful verification run
