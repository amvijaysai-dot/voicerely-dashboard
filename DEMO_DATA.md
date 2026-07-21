# Voicerely Demo Data — test-client Tenant

## Overview

This seed script populates the **test-client** tenant with 250 realistic CallLog records, 100 AuditLog webhook events, and consistent billing configuration so the Voicerely dashboard displays a production-like SaaS experience.

## Records Created

| Entity              | Count | Description                                       |
|---------------------|-------|---------------------------------------------------|
| **CallLog**         | 250   | Inbound/outbound calls spanning last 30 days      |
| **AuditLog**        | 100   | Webhook events for Live Logs page history         |
| **Tenant (update)** | 1     | Billing fields updated to match generated data    |

## Dashboard Metrics (Approximate)

| Metric               | Value         |
|----------------------|---------------|
| **Total Calls**      | 250           |
| **Inbound**          | 180           |
| **Outbound**         | 70            |
| **Average Duration** | 2m 34s        |
| **Answered**         | 210           |
| **Missed**           | 18            |
| **Transferred**      | 12            |
| **Average Sentiment**| Positive      |
| **Avg Booking Value**| $210          |
| **Estimated Revenue**| $13,800       |
| **Minutes Used**     | 635           |
| **Monthly Spend**    | $381.00       |

## Call Distribution

### Status Breakdown
- **Completed (Answered):** 210
- **Missed:** 18
- **Transferred:** 12
- **Voicemail:** 8
- **Failed:** 2

### Sentiment Distribution
- **Positive:** 72%
- **Neutral:** 22%
- **Negative:** 6%

### Category Mix
- **Appointment booking:** ~35%
- **Technical support:** ~25%
- **Pricing inquiries:** ~15%
- **FAQ / business hours:** ~20%
- **Voicemail / transferred:** ~5%

### Time Distribution
- **Business hours:** 8 AM – 6 PM
- **Peak hours:** 10 AM – 12 PM
- **Weekdays:** Higher volume (7–14 calls/day)
- **Weekends:** Lower volume (3–7 calls/day)
- **Span:** Last 30 days (July 2026)

## How to Run

```bash
# Prerequisites:
# 1. Ensure the test-client tenant exists
npm run db:seed

# 2. Run the demo seed
npm run seed:demo
```

The script uses `tsx` to execute TypeScript directly. It reads connection details from `.env.local`.

## How to Re-run

```bash
npm run seed:demo
```

Running the script again will:
1. Delete ALL existing CallLog and AuditLog records for `test-client`
2. Recreate the identical deterministic dataset
3. Update the tenant's billing configuration

**All other tenants are preserved.** No production data is affected.

## How to Remove Demo Data

To manually remove demo data from the `test-client` tenant:

```sql
-- Connect to your PostgreSQL database and run:
DELETE FROM "CallLog" WHERE "tenantId" = 'test-client';
DELETE FROM "AuditLog" WHERE "tenantId" = 'test-client';
```

Or it can be done programmatically via the Prisma Studio:

```bash
npm run db:studio
```

Navigate to the `CallLog` and `AuditLog` tables and delete rows where `tenantId = 'test-client'`.

## Deterministic Generation

All demo data is generated using a **fixed-seed PRNG** (`mulberry32` with seed `20260721`). This means:

- Every run produces **identical** data
- Call IDs, transcripts, timestamps, and metrics are reproducible
- No randomness between runs — ideal for consistent demos and screenshots

## Safety Guarantees

- ✅ Deletes ONLY `test-client` CallLogs and AuditLogs
- ✅ Preserves all other tenants
- ✅ Does NOT modify production logic
- ✅ Does NOT change dashboard components
- ✅ Does NOT modify webhook processing
- ✅ Does NOT modify billing calculations
- ✅ Inserts only realistic seed data