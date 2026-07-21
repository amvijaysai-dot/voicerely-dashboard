# Agent ID Save Path Trace

## Problem Statement
The Admin UI displays the correct Retell Agent ID, but after clicking Save, the `Tenant.agentIds` column in PostgreSQL remains `[]`.

---

## Save Path Analysis

### 1. Edit Tenant Modal (AdminPortal.tsx)

**Location:** `app/(admin)/AdminPortal.tsx`

**Incoming agentId (from tenant row):**
- `t.agentId` is derived from `t.agentIds?.[0] ?? ""` (line 48 in admin/page.tsx)
- When opening edit modal: `setEditForm({ agentId: t.agentId, ... })` (line 183)

**Outgoing payload (submitEdit function, lines 196-204):**
```javascript
const payload: Record<string, unknown> = {
  clientName: editForm.clientName,
  allowedMinutes: Number(editForm.allowedMinutes),
  perMinuteRate: Number(editForm.perMinuteRate),
  agentId: editForm.agentId.trim(),  // <-- agentId sent as string
  billingModel: editForm.billingModel,
  baseMonthlyFee: Number(editForm.baseMonthlyFee),
  includedMinutes: Number(editForm.includedMinutes),
};
```

**Key observation:** The payload sends `agentId` (singular) as a string, NOT `agentIds` (plural) as an array.

---

### 2. PATCH /api/admin/tenants/[id] (route.ts)

**Location:** `app/api/admin/tenants/[id]/route.ts`

**Request payload received:**
- `input.agentId` (string) - validated by `updateTenantSchema` (line 64 in validation.ts)

**Outgoing patch object (lines 38-46):**
```javascript
const patch: Record<string, unknown> = {};
if (input.clientName !== undefined) patch.clientName = input.clientName;
if (input.allowedMinutes !== undefined) patch.allowedMinutes = input.allowedMinutes;
if (input.perMinuteRate !== undefined) patch.perMinuteRate = input.perMinuteRate;
if (input.status !== undefined) patch.status = input.status;
if (input.retellApiKey !== undefined) patch.retellApiKey = input.retellApiKey;
// Primary Retell agent tracking id -> stored as agentIds[0].
if (input.agentId !== undefined) patch.agentIds = input.agentId ? [input.agentId] : [];
```

**Key observation:** The route correctly converts `agentId` to `agentIds: [agentId]` array.

---

### 3. Validation (validation.ts)

**Location:** `lib/validation.ts`

**Schema (lines 56-72):**
```typescript
export const updateTenantSchema = z
  .object({
    clientName: z.string().trim().min(1, "Client name is required").optional(),
    allowedMinutes: z.coerce.number().int().min(0, "Allowed minutes must be >= 0").optional(),
    perMinuteRate: z.coerce.number().min(0, "Per-minute rate must be >= 0").optional(),
    status: z.enum(["active", "suspended"]).optional(),
    retellApiKey: z.string().min(1).optional(),
    agentId: z.string().trim().optional(),  // <-- agentId is optional string
    billingModel: z.enum(["hybrid", "metered_maintenance", "pure_per_minute"]).optional(),
    baseMonthlyFee: z.coerce.number().min(0, "Base monthly fee must be >= 0").optional(),
    includedMinutes: z.coerce.number().int().min(0, "Included minutes must be >= 0").optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");
```

**Key observation:** `agentId` is optional and trimmed. If provided, it passes through.

---

### 4. repository.updateTenant() (tenantPostgresRepository.ts)

**Location:** `lib/repositories/tenantPostgresRepository.ts`

**Incoming patch (line 192):**
- `patch: Partial<Tenant>` - contains `agentIds: string[]` (array)

**Outgoing data object (lines 210-219):**
```javascript
const data: Record<string, unknown> = {};
if (patch.clientName !== undefined) data.clientName = patch.clientName;
if (patch.allowedMinutes !== undefined) data.allowedMinutes = patch.allowedMinutes;
if (patch.usedMinutes !== undefined) data.usedMinutes = patch.usedMinutes;
if (patch.perMinuteRate !== undefined) data.perMinuteRate = patch.perMinuteRate;
if (patch.status !== undefined) data.status = patch.status;
if (patch.agentIds !== undefined) data.agentIds = patch.agentIds;  // <-- agentIds passed to Prisma
if (patch.billingModel !== undefined) data.billingModel = patch.billingModel;
if (patch.baseMonthlyFee !== undefined) data.baseMonthlyFee = patch.baseMonthlyFee;
if (patch.includedMinutes !== undefined) data.includedMinutes = patch.includedMinutes;
```

**Key observation:** `agentIds` is correctly passed to the Prisma data object.

---

### 5. Prisma Update (tenantPostgresRepository.ts)

**Location:** `lib/repositories/tenantPostgresRepository.ts` (lines 257-261)

**Prisma update call:**
```javascript
const updated = await prisma.tenant.update({
  where: { id },
  data,
  include: { retellApiKey: true },
});
```

**Key observation:** The `data` object should contain `agentIds` if it was set.

---

### 6. PostgreSQL (schema.prisma)

**Location:** `prisma/schema.prisma` (line 32)

**Schema definition:**
```prisma
agentIds       String[] @default([])
```

**Key observation:** The column is a `String[]` with default `[]`.

---

## Logging Added for Debugging

### Changes Made:

1. **API Route** (`app/api/admin/tenants/[id]/route.ts`) - Added logging:
   - `incoming agentId` - logs the raw agentId from the request
   - `outgoing patch.agentIds` - logs the converted array before calling repository
   - `updated.agentIds from repo` - logs the returned value from repository

2. **Repository** (`lib/repositories/tenantPostgresRepository.ts`) - Added logging:
   - `Prisma update data.agentIds` - logs the value being sent to Prisma
   - `Database row after update - agentIds` - logs the value returned from database

---

## Trace Output Format

When the save operation is executed, the following console logs will appear:

```
[TRACE][<requestId>] PATCH /api/admin/tenants/<tenantId>
[TRACE][<requestId>] incoming agentId: <value>
[TRACE][<requestId>] outgoing patch.agentIds: <value>
[TRACE][<requestId>] Prisma update data.agentIds: <value>
[TRACE][<requestId>] Database row after update - agentIds: <value>
```

---

## Root Cause Analysis

### THE BUG: Missing `agentIds` in API Response

**Location:** `app/api/admin/tenants/[id]/route.ts` (lines 57-67)

The API response does NOT include `agentIds`:
```javascript
return NextResponse.json({
  id: updated.id,
  clientName: updated.clientName,
  allowedMinutes: updated.allowedMinutes,
  perMinuteRate: updated.perMinuteRate,
  status: updated.status,
  hasRetellKey: Boolean(updated.retellApiKey),
  billingModel: updated.billingModel,
  baseMonthlyFee: updated.baseMonthlyFee,
  includedMinutes: updated.includedMinutes,
  // MISSING: agentIds
});
```

**However, this is NOT the root cause of the database issue.**

### THE REAL BUG: Conditional Check in API Route

**Location:** `app/api/admin/tenants/[id]/route.ts` (line 46)

```javascript
if (input.agentId !== undefined) patch.agentIds = input.agentId ? [input.agentId] : [];
```

**Problem:** When `input.agentId` is an empty string `""` (after `.trim()`), the condition `input.agentId ? [input.agentId] : []` evaluates to `false` because empty string is falsy in JavaScript.

**BUT WAIT:** The user says the UI displays the CORRECT agent ID. So the agentId is NOT empty.

---

## CONCLUSION

Based on code analysis, the save path appears correct. The issue must be determined by running the application and checking the trace logs.

**To diagnose:**
1. Start the application with `npm run dev`
2. Open the Admin UI
3. Edit a tenant and set an Agent ID
4. Click Save
5. Check the console output for the trace logs

**Expected correct flow:**
- `incoming agentId` should show the agent ID value
- `outgoing patch.agentIds` should show `["<agentId>"]`
- `Prisma update data.agentIds` should show `["<agentId>"]`
- `Database row after update - agentIds` should show `["<agentId>"]`

**If the database value is still `[]`, the issue is in the Prisma update itself.**

---

## Additional Investigation Needed

The `toTenant` function in `tenantPostgresRepository.ts` (line 55) does:
```javascript
agentIds: (row.agentIds as string[]) ?? [],
```

This should work correctly. However, if the Prisma update is not persisting the value, we need to check:

1. Is the `data` object being built correctly?
2. Is Prisma receiving the correct payload?
3. Is there a Prisma type mismatch?

The logging added will help identify exactly where the value is lost.