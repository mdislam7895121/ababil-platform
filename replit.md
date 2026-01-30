# Digital Platform Factory

## Overview
This is a production-grade multi-tenant Digital Platform Factory, a full-stack TypeScript monorepo. It allows businesses to create and manage digital workspaces, offering features such as user management, API key generation, module configuration, connector integrations, audit logging, and AI assistance. The platform is designed with a multi-tenant architecture, ensuring each business operates in an isolated environment with its own users, configurations, and data. The project aims to provide a robust, scalable, and customizable platform for various business needs, including reseller and white-label capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The platform is a full-stack TypeScript monorepo.
- **Backend**: Node.js with Express.js for REST API, using Prisma with PostgreSQL.
- **Web Frontend**: Next.js 14 (App Router) with shadcn/ui, Radix UI, Tailwind CSS for styling (including light/dark mode), and TanStack React Query for state management.
- **Mobile Frontend**: Expo with Expo Router for basic mobile access.

### Multi-tenancy and Security
- **Multi-tenancy**: Each tenant is isolated, identified by an `x-tenant-id` header.
- **Authentication**: JWT tokens with Bearer authentication. Passwords are secured using Scrypt-based hashing.
- **Authorization**: Role-based access control (RBAC) with roles like owner, admin, staff, and viewer.
- **Security**: Rate limiting via `express-rate-limit` protects API endpoints. Secrets are encrypted at rest using AES-256-GCM.

### Data Management
- **Database**: PostgreSQL managed with Prisma ORM.
- **Key Entities**: Tenants, Users, Memberships, API Keys, Audit Logs, Module Flags, Connector Configurations, and AI Usage/Cache.

### AI Integration
- **Provider**: OpenAI (optional, with graceful degradation).
- **Cost Control**: Uses smaller models (gpt-4o-mini), enforces usage quotas, and caches responses.
- **Safety**: AI module is opt-in, disabled by default per tenant.

### Modular System
- **Modules**: Supports pluggable feature modules (e.g., booking, e-commerce, CRM, AI assistant) enabled via per-tenant feature flags.
- **Connectors**: Placeholder architecture for integrating third-party services (e.g., Stripe, Email, Storage). Configurations store encrypted secrets.

### Advanced Features
- **Phase 1 Features (Demand-Focused Upgrade)**: Includes a post-build checklist for deployment readiness, live preview mode with shareable sessions, industry presets for rapid configuration, cost transparency panel, and human-friendly error messages.
- **Zero-Thinking Mode (Auto-Pilot UX)**: Features like guided setup, environment auto-generator for secrets, health monitor (traffic light status), safe mode for critical misconfigurations, "What's Missing" panel for unconfigured features, pre-flight checks before deployment, and simple analytics.
- **White-Label + Reseller Mode**: Allows third-party resellers to brand the platform, manage customers, track commissions, and utilize custom domains. Branding is dynamically detected and applied via CSS variables.
- **Background Jobs**: Automated tasks using `node-cron` for cleanup and maintenance (e.g., `cleanupPreviewSessions`, `cleanupI18nCache`). Jobs can be triggered manually.
- **Rate Limiting + Abuse Guard**: Configurable rate limits on critical API endpoints, using IP, tenant+user, or token-based key strategies. Blocks are logged and return a `429 Too Many Requests` response with `Retry-After` header.
- **Backups + Tenant Data Export + Safe Delete**: Complete data management system with:
  - **Tenant Data Export**: ZIP file generation with all tenant data (users, memberships, modules, connectors, billing, audit logs). 24-hour expiry with automatic cleanup.
  - **Backup Snapshots**: Manual and scheduled snapshots recording counts of all tenant data for record-keeping.
  - **Safe Delete**: 2-step deletion process with confirmation token (30-min expiry). Soft delete with 30-day retention. API keys and preview sessions revoked on delete.
  - **Restore**: Restore deleted workspaces within retention period.
  - **Cleanup Job**: Runs every 4 hours to expire old exports and delete files.
  - **UI**: `/dashboard/data` page for export, backup, delete, and restore operations.
- **Enterprise Compliance + Trust Pack**: Complete compliance and security management system:
  - **Security Center**: Data retention policies (30-365 days), PII redaction controls, 2FA enforcement for admins.
  - **Permissions Matrix**: Visual RBAC breakdown for all 14 capabilities across 4 roles.
  - **Access Review**: Dormant user detection (30+ days inactive), API key aging analysis (90+ days old), automated security recommendations.
  - **Evidence Export**: Audit-ready exports (audit logs, support tickets, incidents, access reviews) in JSON/CSV with automatic PII redaction.
  - **SLA Reports**: Support ticket metrics (created, solved, avg response, SLA breaches) and incident metrics.
  - **Legal Document Generator**: Auto-generate Terms of Service, Privacy Policy, and Refund Policy based on company info.
  - **UI**: `/dashboard/compliance` with 5-tab interface (Security, Access, Evidence, SLA, Legal).
- **Mobile Publish Pipeline + CI Runner (Step 29-30)**: Complete mobile app build and store submission system:
  - **Build Targets**: Expo (EAS Build), Flutter (native), FlutterFlow (Mode A: instructions, Mode B: CI)
  - **Publish Jobs**: Atomic job claiming, queued/running/completed status, 72-hour expiry, proof pack generation
  - **Credential Gating**: Encrypted storage for expo_token, apple_api_key, android_keystore, etc.
  - **CI Integration**: GitHub Actions workflow dispatch with callback notifications for status updates
  - **Artifact Management**: APK, AAB, IPA, EAS build URLs, store submission receipts
  - **Admin Endpoints**: `/capabilities`, `/trigger-ci`, `/ci`, `/artifacts/attach`, `/run-now`, `/logs`
  - **CI Callback**: Token-authenticated webhook for GitHub Actions to update job status
  - **UI**: `/dashboard/mobile/publish` for job management and CI mode selection

## External Dependencies

### Database
- **PostgreSQL**: Primary database, configured via `DATABASE_URL`.
- **Prisma ORM**: Used for type-safe database interactions.

### AI Services
- **OpenAI API**: For optional AI assistant features, requires `OPENAI_API_KEY`.
- **Replit AI Integrations**: For additional AI capabilities (audio, image, chat), requires `AI_INTEGRATIONS_OPENAI_API_KEY`.

### Key Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: JWT signing secret.
- `ENCRYPTION_KEY`: Secret encryption key.
- `OPENAI_API_KEY`: OpenAI API access key.
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Replit AI integrations key.
- `JOBS_ENABLED`: Controls the background job scheduler.