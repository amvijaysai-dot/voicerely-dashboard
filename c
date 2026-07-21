# WEBHOOK_TRACE_REPORT.md

**Date:** 2026-07-21
**Author:** Senior Backend Engineer
**Status:** ROOT CAUSE IDENTIFIED

---

## Complete Persistence Path Trace

### Stage 1: Webhook Received
**File:** `app/api/webhooks/retell/route.ts`
**Function:** `POST()`
**Line:** 136-286

**Expected:** Webhook POST received with `x-retell-signature` header
**Actual:** ✅ WORKING (if webhook is sent)

**Log:**
```
[webhook] rateLimit check
[webhook] verifySignature: signature validated
[webhook] JSON.parse: payload parsed
[webhook] event: call_analyzed
[webhook] callId: <call_id>
[webhook] agentId: <agent_id>
```

---

### Stage 2: Tenant Resolution
**File:** `lib/queue/processWebhook.ts`
**Function:** `attribute()`
**Line:** 50-64

**Expected:** `getTenantByAgentId(agentId)` returns tenant
**Actual:** ❌ FAILS - No tenant has agentId configured

**Log:**
```
[webhook] webhook.job_start: { callId, agentId, event, stage: "attribute" }
[webhook] webhook.job_unknown_agent: { error: "no_tenant_for_agent", agentId }
```

**Root Cause:**
- `getTenantByAgentId()` in `lib/tenantService.ts` (line 138-151) queries:
  ```typescript
  const tenant = await repoGetTenantByAgentId(agentId);
  ```
- `repoGetTenantByAgentId()` in `lib/repositories/tenantPostgresRepository.ts` (line 305-312) queries:
  ```typescript
  const row = await prisma.tenant.findFirst({
    where: { agentIds: { has: agentId } },
    include: { retellApiKey: true },
  });
  ```
- **This query returns `undefined` when `agentIds` is empty**

**File:** `lib/tenantService.ts`
**Line:** 145-150

```typescript
const tenant = await repoGetTenantByAgentId(agentId);
if (!tenant) {
  agentIndex.set(agentId, { tenantId: null, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
  return undefined;
}
```

---

### Stage 3: Webhook Processing Stops
**File:** `lib/queue/processWebhook.ts`
**Function:** `processWebhook()`
**Line:** 173-178

**Expected:** Continue to persist call
**Actual:** ❌ STOPS HERE - Throws WebhookTerminalError

```typescript
// Stage 1: attribute
const attr = await attribute(agentId, requestId);
if ("error" in attr) {
  // Unknown agent → not retryable; surface as a terminal (DLQ) failure.
  throw new WebhookTerminalError(attr.error, "attribute");
}
```

**Log:**
```
[webhook] webhook.job_unknown_agent: { error: "no_tenant_for_agent" }
Error: no_tenant_for_agent
```

---

### Stage 4: Call Storage (NEVER REACHED)
**File:** `lib/repositories/tenantPostgresRepository.ts`
**Function:** `appendCallLog()`
**Line:** 315-340

**Expected:** CallLog record created
**Actual:** ❌ NEVER REACHED - Tenant resolution fails first

```typescript
export async function appendCallLog(
  log: CallLog,
  actorId?: string
): Promise<{ log: CallLog; inserted: boolean }> {
  const requestId = newRequestId();
  const existing = await prisma.callLog.findUnique({
    where: { tenantId_callId: { tenantId: log.tenantId, callId: log.callId } },
  });
  if (existing) {
    return { log: existing, inserted: false };
  }
  const created = await prisma.callLog.create({ data: log });
  return { log: created, inserted: true };
}
```

---

## Exact Line Where Execution Stops

**File:** `lib/queue/processWebhook.ts`
**Line:** 177

```typescript
throw new WebhookTerminalError(attr.error, "attribute");
```

**Why:** `getTenantByAgentId(agentId)` returns `undefined` because no tenant in the database has the `agentIds` array populated with the webhook's `agent_id`.

---

## Database State Verification

**File:** `prisma/schema.prisma` (database)
**Query:** `SELECT * FROM "Tenant" WHERE "isAdmin" = false`

**Result:**
```
- Test Client (test-client)
  agentIds: []
  hasRetellKey: false

- Voicerely demo (tenant_cba4ba83040a)
  agentIds: []
  hasRetellKey: true
```

**Expected:** `agentIds: ["agent_xxxxxxxx"]`
**Actual:** `agentIds: []`

---

## Complete Flow Diagram

```
Retell Webhook
    ↓
[app/api/webhooks/retell/route.ts:POST()]
    ↓
Signature Verified ✅
    ↓
JSON Parsed ✅
    ↓
Event: call_analyzed ✅
    ↓
[lib/queue/processWebhook.ts:processWebhook()]
    ↓
[lib/queue/processWebhook.ts:attribute()]
    ↓
[lib/tenantService.ts:getTenantByAgentId(agentId)]
    ↓
[lib/repositories/tenantPostgresRepository.ts:getTenantByAgentId(agentId)]
    ↓
prisma.tenant.findFirst({ where: { agentIds: { has: agentId } } })
    ↓
❌ RETURNS UNDEFINED (agentIds is empty)
    ↓
[lib/queue/processWebhook.ts:177]
    ↓
throw new WebhookTerminalError("no_tenant_for_agent", "attribute")
    ↓
❌ STOP - Call NOT stored
```

---

## Why No CallLog Rows Are Created

1. **Webhook is received** ✅
2. **Signature is verified** ✅
3. **Payload is parsed** ✅
4. **Tenant resolution fails** ❌
   - `getTenantByAgentId(agentId)` returns `undefined`
   - No tenant has `agentIds` configured
5. **Webhook processing stops** ❌
   - `WebhookTerminalError` is thrown
   - Call is never stored

---

## Fix Required

**File:** `prisma/schema.prisma` (database)
**Action:** Configure Agent ID for tenant

**Via Admin Portal:**
1. Go to "All Clients" tab
2. Click the pencil icon on a tenant
3. Enter the Retell Agent ID in "Primary Retell Agent ID" field
4. Click "Save Changes"

**Or via API:**
```bash
curl -X PATCH http://localhost:3000/api/admin/tenants/[tenant-id] \
  -H "Content-Type: application/json" \
  -d '{"agentId": "agent_xxxxxxxx"}'
```

---

## Verification After Fix

After configuring the Agent ID:

1. **Webhook received:** ✅
2. **Signature verified:** ✅
3. **Tenant resolved:** ✅
4. **Call stored:** ✅
5. **Metrics updated:** ✅

**Log:**
```
[webhook] webhook.job_start
[webhook] webhook.job_persisted
[webhook] webhook.job_billing_rolled
[webhook] webhook.job_done
```

---

## Summary

**ROOT CAUSE:** No Agent ID configured in database.

**EXACT LINE:** `lib/queue/processWebhook.ts:177` - `throw new WebhookTerminalError(attr.error, "attribute")`

**REASON:** `getTenantByAgentId(agentId)` returns `undefined` because `prisma.tenant.findFirst({ where: { agentIds: { has: agentId } } })` finds no matching tenant.

**FIX:** Configure the Retell Agent ID for the tenant via Admin Portal or API.