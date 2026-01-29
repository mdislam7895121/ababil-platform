# Digital Platform Factory

A production-grade multi-tenant Digital Platform Factory for building and managing business workspaces.

## Features

- **Multi-Tenant Architecture**: Complete tenant isolation with secure data separation
- **User Management**: RBAC with owner, admin, staff, and viewer roles
- **API Key System**: Secure API key generation with scopes and usage tracking
- **Module System**: Pluggable feature modules (booking, ecommerce, crm, support, analytics, ai_assistant)
- **Connector Hub**: Third-party integrations with encrypted secrets (Stripe, Email, Storage, Push)
- **AI Assistant**: Optional OpenAI integration with cost controls (quotas, caching, mock mode)
- **Prompt Builder Engine**: Build from natural language prompts - automatically configures modules, workflows, and sample data
- **Audit Logging**: Comprehensive activity tracking
- **Professional UI**: Enterprise admin dashboard with light/dark mode

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database

### Local Development

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # Required
   DATABASE_URL="postgresql://user:pass@localhost:5432/dpf"
   SESSION_SECRET="your-32-character-secret-here!!"
   ENCRYPTION_KEY="your-32-character-encrypt-key!!"
   
   # Optional (for AI features)
   OPENAI_API_KEY="sk-..."
   ```

3. **Push database schema:**
   ```bash
   npm run db:push
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Open in browser:**
   ```
   http://localhost:5000
   ```

## Project Structure

```
├── apps/
│   ├── api/                # Express + TypeScript + Prisma backend
│   │   ├── src/
│   │   │   ├── routes/     # API route handlers
│   │   │   ├── lib/        # Utilities, templates, audit
│   │   │   └── middleware/ # Auth middleware
│   │   └── prisma/         # Prisma schema
│   ├── web/                # Next.js 14 web dashboard
│   │   └── src/
│   │       ├── app/        # App Router pages
│   │       └── components/ # UI components
│   └── mobile/             # Expo mobile app
│       └── app/            # Expo Router screens
├── packages/
│   └── shared/             # Shared Zod schemas, types, RBAC utilities
├── server/                 # Entry point shim (imports apps/api)
└── reports/                # Documentation
    └── proof.md            # Verification report
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user with tenant (requires: email, password, tenantName, tenantSlug)
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Users & Memberships
- `GET /api/users` - List tenant users
- `POST /api/users/invite` - Invite new user
- `PATCH /api/users/:id/role` - Update user role

### API Keys
- `GET /api/api-keys` - List API keys
- `POST /api/api-keys` - Create new API key
- `DELETE /api/api-keys/:id` - Revoke API key

### Modules
- `GET /api/modules` - List available modules
- `POST /api/modules/:key/toggle` - Enable/disable module

### Connectors
- `GET /api/connectors` - List connectors
- `POST /api/connectors/:key` - Configure connector

### Audit Logs
- `GET /api/audit-logs` - List audit logs with pagination

### AI (when enabled)
- `POST /api/ai/chat` - Send chat message
- `GET /api/ai/usage` - Get usage statistics

### Builder (Prompt-to-Platform)
- `GET /api/builder/templates` - List available templates
- `POST /api/builder/draft` - Generate blueprint from prompt
- `POST /api/builder/approve` - Approve blueprint
- `POST /api/builder/run` - Execute build
- `GET /api/builder/requests` - List build requests

## Security

- **Authentication**: JWT tokens with secure signing
- **Password Security**: Scrypt-based hashing with random salts
- **Tenant Isolation**: All queries scoped by tenant ID
- **Secret Encryption**: AES-256-GCM for connector secrets
- **Rate Limiting**: Per-IP and per-tenant limits
- **Zod Validation**: Input validation on all endpoints

## Deployment

See [DEPLOY.md](./DEPLOY.md) for detailed deployment instructions including:
- Environment variable configuration
- Database setup
- Hosting provider guides (Replit, Render, Railway, Fly.io)

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS, shadcn/ui
- **Mobile**: Expo with Expo Router
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: JWT, scrypt
- **AI**: OpenAI (optional)

## License

MIT
