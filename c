# OUTBOUND_CALL_AUDIT.md

**Date:** 2026-07-21
**Author:** Principal Retell AI Integration Engineer
**Status:** OUTBOUND CALLS NOT SUPPORTED

---

## Audit Summary

The current Voicerely integration **does NOT support outbound Retell calls**. All calls are treated as inbound calls.

---

## Evidence

### 1. RetellCallRecord Type (lib/retell/types.ts)

**File:** `lib/retell/types.ts`
**Line:** 1-51

**Expected Fields for Outbound Support:**
- `direction: "inbound" | "outbound"`
- `call_type: "phone_call" | "web_call"`

**Actual Fields:**
```typescript
export interface RetellCallRecord {
  call_id: string;
  agent_id: string;
  agent_name?: string;
  call_status: "ended" | "error" | "ongoing" | "registered";
  disconnection_reason?: string;
  start_timestamp: number;
  end_timestamp: number;
  duration_seconds: number;
  from_number?: string;
  to_number?: string;
  recording_url?: string;
  transcript?: string;
  transcript_object?: RetellTranscriptTurn[];
  call_analysis?: {
    call_successful?: boolean;
    user_sentiment?: "Positive" | "Neutral" | "Negative";
    call_summary?: string;
  };
}
```

**Status:** ❌ NO `direction` field

---

### 2. Webhook Parser (app/api/webhooks/retell/route.ts)

**File:** `app/api/webhooks/retell/route.ts`
**Function:** `toCallRecord()`
**Line:** 89-134

**Expected:** Filter outbound calls or handle them separately
**Actual:** No filtering for outbound calls

```typescript
function toCallRecord(data: Record<string, unknown>): RetellCallRecord {
  // ...
  return {
    call_id: String(data.call_id ?? data.callId ?? ""),
    agent_id: String(data.agent_id ?? data.agentId ?? ""),
    // ... NO direction check
  };
}
```

**Status:** ❌ NO OUTBOUND FILTERING

---

### 3. Call Event Filtering (app/api/webhooks/retell/route.ts)

**File:** `app/api/webhooks/retell/route.ts`
**Line:** 211-221

**Expected:** Only process inbound calls
**Actual:** Processes all call events

```typescript
const isCallEvent =
  event === "call_analyzed" ||
  event === "call_ended" ||
  event === "call.completed" ||
  event.includes("call_analyzed") ||
  event.includes("call_ended");
```

**Status:** ❌ NO DIRECTION CHECK

---

### 4. Call Storage (lib/repositories/tenantPostgresRepository.ts)

**File:** `lib/repositories/tenantPostgresRepository.ts`
**Function:** `appendCallLog()`
**Line:** 263-282

**Expected:** Store direction for filtering
**Actual:** No direction field stored

```typescript
export async function appendCallLog(
  log: CallLog,
  tenantId: string
): Promise<{ inserted: boolean }> {
  // ...
  // No direction check
}
```

**Status:** ❌ NO DIRECTION STORAGE

---

### 5. Transform Function (lib/transform.ts)

**File:** `lib/transform.ts`
**Function:** `transformCallToClientView()`
**Line:** 25-47

**Expected:** Handle outbound call direction
**Actual:** No direction handling

```typescript
export function transformCallToClientView(
  raw: RetellCallRecord,
  config: VoicerelyClientConfig
): VoicerelyCallView {
  // ...
  // No direction check
}
```

**Status:** ❌ NO DIRECTION HANDLING

---

### 6. Metrics Aggregation (app/api/dashboard/metrics/route.ts)

**File:** `app/api/dashboard/metrics/route.ts`
**Line:** 148-154

**Expected:** Filter by direction for metrics
**Actual:** No direction filtering

```typescript
const cycleCalls = calls.filter((call) => {
  const callTime = new Date(call.timestamp).getTime();
  const cycleStart = new Date(cycle.start).getTime();
  const cycleEnd = new Date(cycle.end).getTime();
  return callTime >= cycleStart && callTime < cycleEnd;
  // No direction check
});
```

**Status:** ❌ NO DIRECTION FILTERING

---

## Retell API Documentation

According to Retell AI's webhook documentation, the webhook payload includes:

```json
{
  "event": "call_analyzed",
  "data": {
    "call_id": "call_123",
    "agent_id": "agent_456",
    "direction": "inbound",  // or "outbound"
    "call_type": "phone_call",  // or "web_call"
    "call_status": "ended",
    "from_number": "+15551234567",
    "to_number": "+18005550100",
    "duration_seconds": 120,
    ...
  }
}
```

**Key Fields:**
- `direction`: "inbound" or "outbound"
- `call_type`: "phone_call" or "web_call"

---

## Impact Analysis

### If Outbound Calls Are Made:

1. **Webhook Received:** ✅ Yes (outbound calls trigger webhooks)
2. **Signature Verified:** ✅ Yes
3. **Tenant Resolved:** ✅ Yes (if agentId configured)
4. **Call Stored:** ✅ Yes (outbound calls stored as inbound)
5. **Metrics Updated:** ✅ Yes (outbound calls counted in metrics)

### Problem:

- **Outbound calls are stored and counted as inbound calls**
- **No way to distinguish between inbound and outbound**
- **Metrics will include outbound call minutes in billing**

---

## Recommendations

### Option 1: Add Outbound Call Support

**File:** `lib/retell/types.ts`
**Add:**
```typescript
export interface RetellCallRecord {
  // ... existing fields
  direction?: "inbound" | "outbound";
  call_type?: "phone_call" | "web_call";
}
```

**File:** `app/api/webhooks/retell/route.ts`
**Add to `toCallRecord()`:**
```typescript
direction: (data.direction as "inbound" | "outbound" | undefined) ?? "inbound",
call_type: (data.call_type as "phone_call" | "web_call" | undefined) ?? "phone_call",
```

**File:** `lib/db.ts`
**Add to `CallLog`:**
```typescript
direction?: "inbound" | "outbound";
```

**File:** `lib/repositories/tenantPostgresRepository.ts`
**Add to `appendCallLog()`:**
```typescript
if (log.direction === "outbound") {
  // Handle outbound call differently
}
```

### Option 2: Filter Out Outbound Calls

**File:** `app/api/webhooks/retell/route.ts`
**Add to `toCallRecord()` or after parsing:**
```typescript
// Skip outbound calls
if (data.direction === "outbound") {
  return NextResponse.json({ received: true, status: "ignored" }, { status: 200 });
}
```

---

## Current State

| Component | Outbound Support | Status |
|-----------|-----------------|--------|
| RetellCallRecord type | No `direction` field | ❌ Missing |
| Webhook parser | No direction check | ❌ Missing |
| Call storage | No direction field | ❌ Missing |
| Transform function | No direction handling | ❌ Missing |
| Metrics aggregation | No direction filter | ❌ Missing |

---

## Conclusion

The current integration **treats all calls as inbound**. If the Retell agent is configured for outbound calls, they will be:
1. Received by the webhook
2. Stored in the database
3. Counted in metrics
4. Billed as inbound calls

**This is a configuration issue, not a code issue.** The integration works correctly for inbound calls. Outbound call support would require adding the `direction` field throughout the stack.