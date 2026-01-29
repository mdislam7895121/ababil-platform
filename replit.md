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
