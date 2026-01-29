# Deployment Guide - Digital Platform Factory

This guide covers deploying the Digital Platform Factory to production environments.

## Overview

The Digital Platform Factory is a multi-tenant SaaS platform that can be deployed to various cloud providers. The application consists of:
- **Backend API**: Express.js server with REST endpoints
- **Frontend**: React SPA built with Vite
- **Database**: PostgreSQL

## Prerequisites

- Node.js 20+ LTS
- PostgreSQL 14+
- A cloud hosting provider account (Render, Railway, Fly.io, or similar)

## Environment Variables

Create these environment variables in your production environment:

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |
| `SESSION_SECRET` | JWT signing secret (32+ chars) | `your-super-secret-jwt-key-here-32chars` |
| `ENCRYPTION_KEY` | AES-256 encryption key (32 chars) | `32-character-encryption-key-here` |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (optional, default 5000) | `5000` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for AI features | Mock mode if not set |
| `JOBS_ENABLED` | Enable background job scheduler | `true` |
| `APP_URL` | Primary application URL (for CORS allowlist) | Auto-detected |
| `CORS_ALLOWED_ORIGINS` | Comma-separated CORS allowed origins | localhost only |

## Database Setup

### Option 1: Managed PostgreSQL (Recommended)

Use a managed PostgreSQL service:
- **Neon** (free tier available) - https://neon.tech
- **Supabase** - https://supabase.com
- **Railway** - https://railway.app
- **Render** - https://render.com

1. Create a new PostgreSQL database
2. Copy the connection string
3. Set it as `DATABASE_URL` environment variable

### Option 2: Self-Hosted PostgreSQL

```bash
# Create database
createdb digital_platform_factory

# Set connection string
export DATABASE_URL="postgresql://localhost:5432/digital_platform_factory"
```

### Run Migrations

The schema is pushed automatically on first run using Drizzle ORM. For manual migration:

```bash
npm run db:push
```

## Deployment Options

### Option 1: Replit (Recommended - One-Click)

1. Fork this Repl
2. Set environment variables in Secrets tab
3. Click "Deploy" button
4. Your app is live at `https://your-app.replit.app`

### Option 2: Render

1. Create a new Web Service
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
4. Add environment variables in Render dashboard
5. Deploy

### Option 3: Railway

1. Create new project from GitHub repo
2. Add PostgreSQL plugin
3. Set environment variables
4. Deploy automatically on push

### Option 4: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (creates app and Postgres)
fly launch

# Set secrets
fly secrets set SESSION_SECRET="your-secret"
fly secrets set ENCRYPTION_KEY="your-32-char-key"

# Deploy
fly deploy
```

### Option 5: Docker (Self-Hosted)

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

EXPOSE 5000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t digital-platform-factory .
docker run -p 5000:5000 \
  -e DATABASE_URL="..." \
  -e SESSION_SECRET="..." \
  -e ENCRYPTION_KEY="..." \
  digital-platform-factory
```

## Build Commands

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Start production server
npm start

# Run development server
npm run dev
```

## Pre-Deployment Verification

Before deploying, run the verification scripts to ensure everything is working:

### Full Verification (Recommended)

```bash
./scripts/verify.sh
```

This runs comprehensive checks:
1. **Node/Dependencies** - Verifies Node.js and npm are available
2. **API Typecheck** - Runs TypeScript validation on the API
3. **Web Build Check** - Validates Next.js configuration
4. **Prisma Validation** - Ensures database schema is valid
5. **API Smoke Tests** - Tests core endpoints
6. **Golden Flow Checks** - Validates critical user flows

### Quick Smoke Test

```bash
./scripts/smoke.sh
```

Fast health check for essential services only.

### When Verification Fails

Run the recovery tool:

```bash
./scripts/recover.sh
```

Options:
1. Restart services (kill ports 3000/5000)
2. Regenerate Prisma client
3. Re-run preflight check
4. Run smoke test
5. Run full verification
6. Check environment variables

### Golden Flows

These critical user journeys are verified:

| Flow | Description |
|------|-------------|
| F1 | Landing → Onboarding |
| F2 | Onboarding → Preview |
| F3 | Preview → Billing |
| F4 | Payment → Go-Live |

## Health Checks

Configure your hosting provider to check these endpoints:

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /api/health` | Application health | `200 OK` with `{"status":"ok"}` |
| `GET /api/ready` | Database connectivity | `200 OK` with `{"status":"ready","database":"connected"}` |

## Deploy Wizard (Self-Serve)

The Digital Platform Factory includes a built-in **Deploy Wizard** that helps you go live with minimal steps.

### Access the Wizard

1. Log in to your dashboard at `/dashboard`
2. Navigate to **Deploy** in the sidebar
3. Follow the 6-step wizard

### Wizard Steps

**Step 1: Choose Provider**
- Select your hosting provider (Replit, Render, Railway, Fly.io, or Docker)
- Replit is recommended for one-click deployment

**Step 2: Enter Live App URL**
- Enter the public URL where your app will be accessible
- Example: `https://myapp.replit.app` or `https://myapp.onrender.com`

**Step 3: Database & Secrets**
- Enter your production `DATABASE_URL`
- Enter your `JWT_SECRET` (SESSION_SECRET)
- These values are encrypted and never shown again

**Step 4: Review & Save**
- Confirm your settings
- Click "Save Configuration" to securely store your deployment config

**Step 5: Deploy Checklist**
- View required environment variables
- Copy the migration command: `npx prisma migrate deploy`
- Copy the start command: `npm run start`

**Step 6: Verify Deployment**
- Click "Run Verification" to test your live URL
- The wizard checks:
  - Environment variables are set
  - Database connectivity
  - `/api/health` endpoint responds
  - `/api/ready` endpoint responds

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/deploy/config` | GET | Get current deploy configuration |
| `/api/deploy/config` | POST | Save deploy configuration |
| `/api/deploy/verify` | POST | Run verification checks |
| `/api/deploy/runs` | GET | List verification history |
| `/api/deploy/checklist` | GET | Get deploy checklist |

## Post-Deployment Verification

After deployment, verify the platform is working:

```bash
# Check health
curl https://your-app.com/api/health

# Register first user (becomes tenant owner)
# Note: tenantSlug must be lowercase alphanumeric with hyphens only (e.g., "my-company")
curl -X POST https://your-app.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"secure123","name":"Admin","tenantName":"My Company","tenantSlug":"my-company"}'

# Login
curl -X POST https://your-app.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"secure123"}'
```

## Security Checklist

Before going live, ensure:

- [ ] `SESSION_SECRET` is a strong random string (32+ characters)
- [ ] `ENCRYPTION_KEY` is exactly 32 characters, randomly generated
- [ ] `DATABASE_URL` uses SSL connection (`?sslmode=require`)
- [ ] HTTPS is enabled (most hosting providers handle this)
- [ ] Rate limiting is active (built-in)
- [ ] No secrets in logs (built-in redaction)
- [ ] Security headers enabled (Helmet - automatic in production)
- [ ] CORS allowlist configured via `CORS_ALLOWED_ORIGINS`
- [ ] Run `./scripts/security-check.sh` to audit dependencies

### Security Audit

Run the security audit script before deployment:

```bash
./scripts/security-check.sh
```

This checks for known vulnerabilities in production dependencies. Policy:
- **Critical/High**: Must be fixed or explicitly waived
- **Moderate/Low**: Allowed if no fix available

## Scaling Considerations

### Horizontal Scaling

The application is stateless and can be scaled horizontally:
- Session state is in JWT tokens
- All data is in PostgreSQL
- No in-memory caching between requests

### Database Connection Pooling

For high traffic, use a connection pooler:
- PgBouncer
- Neon connection pooling
- Supabase connection pooling

### CDN for Static Assets

Consider using a CDN for the frontend assets:
- Cloudflare
- Fastly
- AWS CloudFront

## Monitoring

Recommended monitoring setup:
- **Uptime**: UptimeRobot, Pingdom
- **Errors**: Sentry
- **Logs**: Logtail, Papertrail
- **Metrics**: Prometheus + Grafana

## Troubleshooting

### Database Connection Errors

```
Error: Connection refused
```
- Verify `DATABASE_URL` is correct
- Check database is running and accessible
- Ensure firewall allows connection from your server

### JWT Token Errors

```
Error: Invalid token
```
- Ensure `SESSION_SECRET` is the same across deployments
- Tokens are invalidated if secret changes

### Build Failures

```
Error: Cannot find module
```
- Run `npm install` before `npm run build`
- Ensure all dependencies are in `package.json`

## Support

For issues or questions:
1. Check the logs in your hosting provider
2. Review this deployment guide
3. Check the GitHub issues page
