# Digital Platform Factory

## Overview

This is a production-grade multi-tenant Digital Platform Factory built as a full-stack TypeScript monorepo. The application enables businesses to create and manage their own digital workspaces with features including user management, API key generation, module configuration, connector integrations, audit logging, and AI-powered assistance.

The platform follows a multi-tenant architecture where each business operates as an isolated tenant/workspace with their own users, configurations, and data. All clients (web and potential mobile apps) share a single backend API and database.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state, React Context for auth and theme
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **File Uploads**: Uppy with AWS S3 integration for presigned URL uploads

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **Build System**: esbuild for server bundling, Vite for client
- **API Design**: RESTful endpoints under `/api/` prefix with JSON responses

### Authentication & Authorization
- **Auth Method**: JWT tokens with Bearer authentication
- **Password Security**: Scrypt-based password hashing with random salts
- **Multi-tenancy**: Tenant ID passed via `x-tenant-id` header
- **RBAC**: Role-based access control with membership system (owner, admin, member, viewer roles)
- **Rate Limiting**: express-rate-limit for API protection
- **Secrets**: Encrypted at rest using AES-256-GCM

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` - shared between client and server
- **Migrations**: Drizzle Kit with `drizzle-kit push` command
- **Core Entities**: Tenants, Users, Memberships, API Keys, Audit Logs, Secrets, Module Flags, Connector Configs, AI Usage/Cache

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
- **Drizzle ORM**: Type-safe database queries and schema management

### AI Services
- **OpenAI API**: Optional AI assistant functionality, requires `OPENAI_API_KEY`
- **Replit AI Integrations**: Additional audio, image, and chat capabilities via `AI_INTEGRATIONS_OPENAI_API_KEY`

### Cloud Storage
- **Google Cloud Storage**: Object storage for file uploads via `@google-cloud/storage`
- **Replit Object Storage**: Uses sidecar endpoint at `http://127.0.0.1:1106` for credentials

### Payment Processing
- **Stripe**: Payment and subscription management (connector placeholder)

### Email
- **Nodemailer**: Email sending capability (connector placeholder)

### Key Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (required)
- `SESSION_SECRET`: JWT signing secret
- `ENCRYPTION_KEY`: Secret encryption key (32 characters)
- `OPENAI_API_KEY`: OpenAI API access (optional)
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Replit AI integrations
- `PUBLIC_OBJECT_SEARCH_PATHS`: Object storage public paths