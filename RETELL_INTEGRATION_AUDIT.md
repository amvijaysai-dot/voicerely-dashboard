# Retell Integration Audit Report

**Date:** 2026-07-21
**Author:** Principal Backend Engineer
**Scope:** Root cause analysis of zero metrics in dashboard

## 1. Complete Architecture Diagram

Retell AI (call_analyzed events)
         |
         v
POST /api/webhooks/retell
         |
         +-- rate limit (per IP)
         +-- verify HMAC signature (RETELL_WEBHOOK_SECRET)
         +-- parse + map payload
         +-- enqueue job (BullMQ/Redis) OR inline fallback
         v
lib/queue/processWebhook.ts
         |
         +-- Stage 1: attribute() -> getTenantByAgentId(agentId)
         +-- Stage 2: persist() -> appendCallLog(log, tenantId)
         +-- Stage 3: billing() -> incrementUsedMinutes(tenantId, minutes)
         +-- Stage 4: analytics() -> buildAgentHealthReport()
         +-- Stage 5: notify() -> sendWebhookNotification()
         v
lib/repositories/tenantRepository.ts (DATA_DRIVER=postgres)
         |
         +-- getTenantByAgentId() -> tenantPostgresRepository.ts
         +-- appendCallLog() -> Creates CallLog record
         +-- incrementUsedMinutes() -> Updates tenant.usedMinutes
         v
PostgreSQL (Supabase) via Prisma
         |
         +-- Tenant table (id, agentIds[], retellApiKey encrypted)
         +-- CallLog table (tenantId, callId, agentId, duration, etc.)
         v
/api/dashboard/metrics
         |
         +-- getSessionTenant() -> getTenant()
         +-- getClientConfig(tenant) -> buildClientConfig()
         +-- listCalls(tenant) -> retellFetch() -> Retell API OR generateDemoCalls()
         +-- transformCallToClientView()
         +-- calculateBillingSummary()
         v
React Frontend (app/(dashboard)/metrics/page.tsx)

## 2. Every Issue Found

### Issue #1: Missing Agent ID in Tenant Records (CRITICAL)
- Location: lib/repositories/tenantPostgresRepository.ts line 305-310
- Problem: getTenantByAgentId() queries agentIds array, but tenants have empty agentIds: []
- Evidence: Database check shows:
  - Test Client (test-client): agentIds: [], hasRetellKey: false
  - Voicerely demo (tenant_cba4ba83040a): agentIds: [], hasRetellKey: true

### Issue #2: Missing Retell API Key for Test Client (CRITICAL)
- Location: lib/retell/client.ts line 173-174
- Problem: listCalls() returns generateDemoCalls() when retellApiKey is empty
- Evidence: hasRetellKey: false for the test-client tenant

### Issue #3: Webhook Test Script Uses Wrong Data Source (CRITICAL)
- Location: scripts/test-webhook-ingestion.mjs line 170-178
- Problem: Script reads from data/calls.json and data/tenants.json (JSON driver)
- But: .env.local has DATA_DRIVER=postgres
- Result: Webhook test writes to JSON files that are NEVER read by the application

### Issue #4: Webhook Payload Format Mismatch (CRITICAL)
- Location: app/api/webhooks/retell/route.ts line 89-134
- Problem: toCallRecord() expects data.call_id, data.agent_id
- But: Test script sends flat payload without event wrapper

### Issue #5: No Real Retell API Key Configured (CRITICAL)
- Location: .env.local
- Problem: No RETELL_API_KEY environment variable
- But: Per documentation, keys are per-tenant via admin portal

### Issue #6: Redis Not Running (MEDIUM)
- Location: lib/queue/redis.ts
- Problem: REDIS_URL defaults to redis://localhost:6379
- Impact: Webhook processing falls back to inline mode

## 3. Root Cause

The metrics show zero because the dashboard is in DEMO MODE for the logged-in tenant.

The chain of failure:
1. Tenant has no Retell API key -> listCalls() returns generateDemoCalls()
2. Tenant has no agentIds -> getTenantByAgentId() returns undefined
3. Webhook test script writes to wrong storage -> data/calls.json instead of PostgreSQL
4. Webhook payload format mismatch -> Events not properly processed

## 4. Exact File Names and Functions

| Component | File | Function |
|-----------|------|----------|
| Webhook Handler | app/api/webhooks/retell/route.ts | toCallRecord() |
| Webhook Handler | app/api/webhooks/retell/route.ts | verifySignature() |
| Webhook Handler | app/api/webhooks/retell/route.ts | POST() |
| Webhook Processing | lib/queue/processWebhook.ts | attribute() |
| Webhook Processing | lib/queue/processWebhook.ts | processWebhook() |
| Tenant Repository | lib/repositories/tenantPostgresRepository.ts | getTenantByAgentId() |
| Retell Client | lib/retell/client.ts | listCalls() |
| Retell Client | lib/retell/client.ts | resolveTenant() |
| Retell Client | lib/retell/client.ts | generateDemoCalls() |
| Metrics API | app/api/dashboard/metrics/route.ts | GET() |
| Metrics API | app/api/dashboard/metrics/route.ts | emptyMetrics() |
| Test Script | scripts/test-webhook-ingestion.mjs | main() |

## 5. Why Metrics Remain Zero

1. No Retell API key -> listCalls() returns demo data (64 calls) OR empty array
2. Demo data is generated but may not match the tenant billing cycle
3. Billing cycle filtering may filter out all demo calls
4. Empty call list -> totalCalls = 0, minutesConsumed = 0, currentSpend = 0

## 6. Retell API Status

NOT WORKING - The application is not making real API calls because:
- No Retell API key is configured for the logged-in tenant
- The retellFetch() function is never called with a valid key
- Instead, generateDemoCalls() returns synthetic data

## 7. Webhook Status

NOT WORKING - Multiple issues:
1. No Redis -> Falls back to inline processing
2. Test script format mismatch -> Events not properly structured
3. No agent ID mapping -> getTenantByAgentId() returns undefined
4. Wrong storage -> Test script writes to JSON, app reads from Postgres

## 8. Persistence Status

PARTIALLY WORKING - PostgreSQL is accessible:
- Database connection works
- Tenant table accessible (3 tenants)
- CallLog table accessible (0 records)
- No call records ingested
- No usedMinutes incremented

## 9. Dashboard Queries Status

WORKING BUT RETURNING EMPTY DATA:
- /api/dashboard/metrics -> Returns zeros (correct behavior for no data)
- /api/calls -> Returns empty array (correct behavior for no data)
- /api/billing/summary -> Returns zeros (correct behavior for no data)

## 10. Frontend Status

WORKING CORRECTLY - The frontend:
- Fetches from correct endpoints
- Handles empty data gracefully
- Displays zeros as expected when no data exists

## 11. Configuration Status

| Variable | Status | Notes |
|----------|--------|-------|
| DATA_DRIVER | OK | postgres (correct for production) |
| DATABASE_URL | OK | Supabase connection |
| RETELL_WEBHOOK_SECRET | OK | test-webhook-secret-123 |
| ENCRYPTION_KEY | OK | 32-byte hex |
| REDIS_URL | WARNING | Defaults to localhost (not running) |
| RETELL_API_KEY | MISSING | Intentionally per-tenant, but no tenant has key |

## 12. Prioritized Fix List

### CRITICAL (Must fix for real Retell integration)

1. Add Retell API Key to Tenant
   - Login as admin
   - Edit the tenant
   - Add the real Retell API key
   - Add the real Retell Agent ID

2. Fix Webhook Test Script
   - Update to use PostgreSQL instead of JSON files
   - OR run with DATA_DRIVER=json for testing

3. Fix Webhook Payload Format
   - Wrap payload in { event: "call_analyzed", data: {...} }

### MEDIUM (Should fix for production)

4. Start Redis Server
   - Required for async webhook processing

5. Verify Webhook Signature
   - Ensure RETELL_WEBHOOK_SECRET matches Retell dashboard

## 13. Immediate Actions Required

1. Configure the tenant with real Retell credentials:
   - Retell API Key
   - Retell Agent ID

2. Test webhook ingestion:
   - Use the admin portal to add credentials
   - Send a test webhook from Retell dashboard
   - Verify call appears in dashboard

## 14. Verification Steps

After fixes:

1. Check tenant has credentials:
   node scripts/check-db.mjs
   Should show hasRetellKey: true and agentIds: ["your_agent_id"]

2. Test webhook:
   curl -X POST http://localhost:3000/api/webhooks/retell
     -H "Content-Type: application/json"
     -H "x-retell-signature: test-webhook-secret-123"
     -d '{"event":"call_analyzed","data":{"call_id":"test123","agent_id":"your_agent_id","duration_seconds":120}}'

3. Check metrics:
   curl http://localhost:3000/api/dashboard/metrics
   Should return non-zero values after webhook is processed
