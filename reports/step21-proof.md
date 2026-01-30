# STEP 21: Marketplace / App Store - Proof of Completion

## Overview
Built a comprehensive Marketplace system with:
- **21.1 Marketplace Catalog (Backend)**: Prisma models + 7 API endpoints
- **21.2 Installer Engine (Backend)**: InstallSpec processor with module/connector/preset support
- **21.3 Web UI (Frontend)**: 3 pages (public browse, detail, dashboard)
- **21.4 Payments Integration**: Plan eligibility checks + subscription validation

## Database Schema
Added 2 new tables to `apps/api/prisma/schema.prisma`:

### MarketplaceItem
- `id`, `slug` (unique), `name`, `type` (template/addon)
- `priceCents`, `currency`, `isFree`
- `shortDesc`, `longDesc`, `screenshots[]`, `tags[]`
- `version`, `status` (draft/published/archived)
- `requiredPlan`, `installSpec` (JSON)

### MarketplaceInstall
- `id`, `tenantId`, `itemId`, `installedVersion`
- `status` (installed/failed/rolled_back)
- `installedAt`, `lastError`, `rollbackData`

## API Endpoints (7 total)

### GET /api/marketplace/items (public list)
```json
{
  "items": [
    {
      "id": "91cdc666-15e8-4dbf-a11e-cfb4489467b7",
      "slug": "ecommerce-starter",
      "name": "E-Commerce Starter Template",
      "type": "template",
      "priceCents": 0,
      "isFree": true,
      "tags": ["ecommerce", "store", "products", "payments"],
      "version": "1.0.0",
      "requiredPlan": "free"
    },
    {
      "id": "f52b07bf-4090-48ee-8e11-3de876f69920",
      "slug": "analytics-pro",
      "name": "Analytics Pro Add-on",
      "type": "addon",
      "priceCents": 4999,
      "isFree": false,
      "requiredPlan": "pro"
    },
    {
      "id": "58b7717d-6856-4d77-91f6-1831ced0ee02",
      "slug": "crm-lite",
      "name": "CRM Lite Template",
      "type": "template",
      "priceCents": 0,
      "isFree": true
    }
  ],
  "total": 3
}
```

### GET /api/marketplace/items/:slug (public detail)
```json
{
  "item": {
    "id": "91cdc666-15e8-4dbf-a11e-cfb4489467b7",
    "slug": "ecommerce-starter",
    "name": "E-Commerce Starter Template",
    "longDesc": "A comprehensive e-commerce starter template...",
    "installSpec": {
      "modules": ["ecommerce", "payments", "inventory"],
      "connectors": [{"name": "stripe", "config": {}}],
      "presets": ["retail"]
    },
    "installCount": 0
  }
}
```

### POST /api/marketplace/items (admin create)
```json
{
  "item": {
    "id": "91cdc666-15e8-4dbf-a11e-cfb4489467b7",
    "slug": "ecommerce-starter",
    "status": "draft",
    "installSpec": {...}
  },
  "message": "Item created as draft"
}
```

### POST /api/marketplace/items/:id/publish (admin publish)
```json
{
  "item": {
    "status": "published"
  },
  "message": "Item published successfully"
}
```

### POST /api/marketplace/install/:slug (owner/admin install)
```json
{
  "install": {
    "id": "6b29924f-c09b-44a8-a76d-f20d872cb062",
    "tenantId": "1afcce92-c373-489c-9946-46b824d992de",
    "itemId": "91cdc666-15e8-4dbf-a11e-cfb4489467b7",
    "installedVersion": "1.0.0",
    "status": "installed",
    "rollbackData": {
      "modulesEnabled": ["ecommerce", "payments", "inventory"],
      "connectorsConfigured": ["stripe"],
      "presetsApplied": ["retail"],
      "sampleDataAdded": []
    }
  },
  "item": {
    "slug": "ecommerce-starter",
    "name": "E-Commerce Starter Template"
  },
  "message": "Item installed successfully"
}
```

### GET /api/marketplace/installs (tenant installs list)
```json
{
  "installs": [
    {
      "id": "6b29924f-c09b-44a8-a76d-f20d872cb062",
      "installedVersion": "1.0.0",
      "status": "installed",
      "item": {
        "slug": "ecommerce-starter",
        "name": "E-Commerce Starter Template"
      }
    }
  ],
  "total": 1
}
```

### POST /api/marketplace/rollback/:installId (owner/admin rollback)
```json
{
  "install": {
    "id": "6b29924f-c09b-44a8-a76d-f20d872cb062",
    "status": "rolled_back"
  },
  "message": "Install rolled back successfully"
}
```

## Installer Engine Features

### InstallSpec Actions
- **Modules**: Enables module flags for tenant
- **Connectors**: Creates connector configs (pending secrets)
- **Presets**: Applies industry presets to tenant settings
- **Sample Data**: Flags demo data (placeholder)

### Idempotency
- Same item/version cannot be installed twice
- Existing modules/connectors are not duplicated

### Transactional Rollback
- Failed installs automatically rollback changes
- Manual rollback available via API
- RollbackData tracks all changes for reversal

## Frontend Pages

### /marketplace (Public Browse)
- Search and filter by type/tag
- Item cards with pricing and plan requirements
- Links to detail pages

### /marketplace/[slug] (Public Detail)
- Full item description
- InstallSpec summary
- Sign in prompt for installation
- Requirements panel

### /dashboard/marketplace (Authenticated)
- Installed items section with rollback buttons
- Available items with Install buttons
- Real-time status updates
- Error/success notifications

## Security

### Access Control
- Public: GET /items, GET /items/:slug (read-only)
- Admin only: POST /items, POST /items/:id/publish
- Owner/Admin: POST /install/:slug, POST /rollback/:installId

### Rate Limiting
- Install endpoint: 10 requests per minute

### Tenant Isolation
- Installs are tenant-scoped
- Only tenant members can see their installs

## Audit Events
- MARKETPLACE_ITEM_PUBLISHED
- MARKETPLACE_INSTALLED
- MARKETPLACE_INSTALL_FAILED
- MARKETPLACE_ROLLED_BACK

## Payments Integration

### Plan Eligibility
- Items specify `requiredPlan` (free/pro/business)
- Tenant plan is checked before install

### Paid Items
- `priceCents` > 0 requires active subscription
- Returns 402 with price details if no subscription

## Regression Tests

### Smoke Test
```
✓ API Health (HTTP 200)
✓ API Ready (HTTP 200)
✓ Web Homepage (HTTP 200)
✓ Web Login (HTTP 200)
✓ SMOKE TEST PASSED
```

### verify.sh
- TypeScript warnings in unrelated files (non-blocking)
- All marketplace routes compile and run correctly

## Files Created/Modified

### New Files
- `apps/api/src/routes/marketplace.ts` - 7 API endpoints
- `apps/web/src/app/marketplace/page.tsx` - Public browse
- `apps/web/src/app/marketplace/[slug]/page.tsx` - Public detail
- `apps/web/src/app/dashboard/marketplace/page.tsx` - Dashboard
- `reports/step21-proof.md` - This proof document

### Modified Files
- `apps/api/prisma/schema.prisma` - Added MarketplaceItem, MarketplaceInstall models
- `apps/api/src/index.ts` - Registered marketplace routes

## Test Data Created
1. **E-Commerce Starter Template** (free, template)
2. **Analytics Pro Add-on** ($49.99, addon, requires pro)
3. **CRM Lite Template** (free, template)

---

**STEP 21: COMPLETE** ✓
