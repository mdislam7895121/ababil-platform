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

## Health Checks

Configure your hosting provider to check these endpoints:

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /api/health` | Application health | `200 OK` with `{"status":"ok"}` |

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
- [ ] No secrets in logs (built-in)

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
