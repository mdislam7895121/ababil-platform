# STEP 25: Agent Chat UI + Workspace Builder Bridge - Proof Pack

## Overview
Created a customer-facing "Agent" chat screen in the web dashboard that turns natural language prompts into a working platform preview using existing Builder + Success + Preview + Marketplace systems.

## Implementation Summary

### 1. Web UI: /dashboard/agent
- Chat UI with prompt input and conversation history
- "Generate Draft" action on submit
- Draft summary panel showing template + modules + connectors
- Action buttons: Approve & Build, Create Preview Link, Open Preview, Show Next Steps, Open Success Center

### 2. Backend Integration (using existing endpoints)
- POST /api/builder/draft - Creates draft from prompt
- POST /api/builder/approve - Approves draft
- POST /api/builder/run - Runs the build
- POST /api/preview/create - Creates preview session
- GET /api/success/next-steps - Gets recommended next steps

### 3. Safety + UX
- 401 errors show login/permission message
- 402 errors show billing CTA to /dashboard/billing
- 403 errors show permission denied message
- 429 errors show retry-after message
- All errors displayed in context with appropriate icons

## A) Raw curl proofs

### 1) GET /api/health (200)
```json
{"status":"ok","timestamp":"2026-01-30T19:47:31.487Z"}
```

### 2) GET /api/ready (200)
```json
{"status":"ready","database":"connected"}
```

### 3) POST /api/builder/draft (200)
```json
{
  "builderRequestId": "1039b02e-aaa3-4e27-936c-5d73f3895f49",
  "blueprintId": "41662df1-daf3-4977-a423-5a0ae58144a2",
  "blueprint": {
    "templateName": "Booking Business",
    "modules": ["booking", "analytics"]
  }
}
```

### 4) POST /api/builder/approve (200)
```json
{"ok":true}
```

### 5) POST /api/builder/run (200)
```json
{
  "buildRunId": "364939d3-0524-4eef-bf92-8492da294123",
  "status": "done",
  "output": {
    "templateName": "Booking Business",
    "enabledModules": ["booking", "analytics"]
  }
}
```

### 6) POST /api/preview/create (200)
```json
{
  "ok": true,
  "previewUrl": "/preview/81a72a620f5bc97d7d979535c41f14615d59187968950dda5a0f5509b31ba654",
  "token": "81a72a620f5bc97d7d979535c41f14615d59187968950dda5a0f5509b31ba654",
  "role": "admin",
  "expiresAt": "2026-01-31T19:47:31.916Z"
}
```

### 7) GET /api/success/next-steps (200)
```json
{
  "lastAction": "default",
  "nextSteps": [
    {
      "id": "subscribe",
      "title": "Subscribe to Go Live",
      "priority": 1
    }
  ]
}
```

## B) UI Proof (Playwright Test)
Test executed successfully with the following verifications:
1. ✅ /dashboard/agent loaded - Agent page with chat UI visible
2. ✅ Draft summary visible after prompt submission
3. ✅ Build completed successfully with summary displayed
4. ✅ Preview link shown and Open Preview button appeared
5. ✅ Next steps visible in agent screen

## C) Regression

### Smoke Test
```
✓ API Health (HTTP 200)
✓ API Ready (HTTP 200)
✓ Web Homepage (HTTP 200)
✓ Web Login (HTTP 200)
✓ SMOKE TEST PASSED
```

### Verify Script
TypeScript warnings are pre-existing (non-blocking) - marked with ⚠ symbol.
No new errors introduced by STEP 25 implementation.

## New Files Created
- `apps/web/src/app/dashboard/agent/page.tsx` - Agent chat UI page
- `apps/web/src/components/ui/textarea.tsx` - Textarea component
- `apps/web/src/components/ui/alert.tsx` - Alert component

## Key Features
1. **Chat Interface**: User-friendly chat UI with message history
2. **Draft Generation**: Natural language prompt → blueprint summary
3. **Approve & Build**: One-click approval and build execution
4. **Preview Links**: Create shareable preview links (24hr expiry)
5. **Next Steps**: Integration with Success Center for recommended actions
6. **Error Handling**: Clear messages for auth, permission, billing, and rate limit errors

## Data-testid Coverage
- `agent-page` - Main container
- `chat-messages` - Chat messages area
- `input-prompt` - Prompt textarea
- `button-send` - Send button
- `button-approve-build` - Approve & Build button
- `button-create-preview` - Create Preview Link button
- `button-open-preview` - Open Preview button
- `button-show-next-steps` - Show Next Steps button
- `button-open-success` - Open Success Center button
- `draft-summary` - Draft summary panel
- `build-summary` - Build summary panel
- `preview-link` - Preview link panel
- `next-steps-panel` - Next steps panel

## Verification Date
2026-01-30
