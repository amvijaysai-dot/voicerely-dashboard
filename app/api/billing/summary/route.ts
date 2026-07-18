// app/api/billing/summary/route.ts
//
// Aggregates tenant usage vs. their configured plan rates, scoped to the
// tenant's CURRENT billing cycle ([billingCycleStart, billingCycleEnd)).
// The plan rate/allowance/type come from the tenant's client config (built
// from the DB row) and must render even when Retell is unreachable — only
// the usage figures depend on the live call list, which degrades gracefully.
//
// BILLING-CYCLE SCOPING: minutesConsumed is computed from calls inside the
// current cycle window ONLY, not all-time. The cycle is rolled forward (and
// usedMinutes reset) lazily on read when billingCycleEnd has passed, so no
// external cron is required.

import { NextRequest, NextResponse } from "next/server";
import { listCalls, getClientConfig } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { calculateBillingSummary } from "@/lib/billing/calculate";
import { rollCycleIfNeeded, isInCycle } from "@/lib/billing/cycle";
import { getSessionTenant } from "@/lib/auth";
import { updateTenant } from "@/lib/repositories/tenantRepository";
import { safeError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionTenant = await getSessionTenant();
  if (!sessionTenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Lazily roll the cycle forward + reset in-cycle minutes if the
    // persisted cycle end has already passed. Persist so the new window
    // sticks for subsequent reads. Historical CallLog rows are untouched.
    const { tenant, rolled } = rollCycleIfNeeded(sessionTenant);
    if (rolled) {
      await updateTenant(tenant.id, {
        billingCycleStart: tenant.billingCycleStart ?? null,
        billingCycleEnd: tenant.billingCycleEnd ?? null,
        usedMinutes: tenant.usedMinutes,
      });
    }

    const config = await getClientConfig(tenant);
    const cycle = {
      start: tenant.billingCycleStart ?? config.billingCycleStart,
      end: tenant.billingCycleEnd ?? "",
    };

    // Live call list is best-effort: if Retell is unreachable (e.g. a demo
    // tenant with no real key), fall back to the tenant's locally tracked
    // used minutes so the plan card still renders the correct rate/allowance.
    let calls: ReturnType<typeof transformCallToClientView>[] = [];
    try {
      const rawCalls = await listCalls(tenant, { limit: 1000 });
      const allViews = rawCalls.map((raw) =>
        transformCallToClientView(raw, config)
      );
      // Scope to the current cycle window only (skip all-time calls).
      calls = allViews.filter((c) =>
        cycle.end ? isInCycle(c.timestamp, cycle) : true
      );
    } catch {
      const fallbackMinutes = tenant.usedMinutes ?? 0;
      calls = [
        {
          callId: "local",
          agentName: tenant.clientName,
          customerNumber: "",
          timestamp: cycle.start,
          durationFormatted: "",
          durationMinutes: fallbackMinutes,
          status: "Completed",
          calculatedCost: fallbackMinutes * config.voicerely_per_minute_rate,
          hasRecording: false,
        },
      ];
    }

    const summary = calculateBillingSummary(calls, config);

    return NextResponse.json({
      ...summary,
      clientId: tenant.id,
      billingCycleStart: cycle.start,
      billingCycleEnd: cycle.end,
    });
  } catch (err) {
    const { error, status } = safeError(err);
    return NextResponse.json({ error }, { status });
  }
}
