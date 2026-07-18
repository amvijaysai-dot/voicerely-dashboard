// app/api/billing/summary/route.ts
//
// Aggregates tenant usage vs. their configured plan rates.
// The plan rate/allowance/type come from the tenant's client config (built
// from the DB row) and must render even when Retell is unreachable — only the
// usage figures depend on the live call list, which degrades gracefully.

import { NextRequest, NextResponse } from "next/server";
import { listCalls, getClientConfig } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { calculateBillingSummary } from "@/lib/billing/calculate";
import { getSessionTenant } from "@/lib/auth";
import { safeError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getClientConfig(tenant);

    // Live call list is best-effort: if Retell is unreachable (e.g. a demo
    // tenant with no real key), fall back to the tenant's locally tracked
    // used minutes so the plan card still renders the correct rate/allowance.
    let calls: ReturnType<typeof transformCallToClientView>[] = [];
    try {
      const rawCalls = await listCalls(tenant, { limit: 1000 });
      calls = rawCalls.map((raw) => transformCallToClientView(raw, config));
    } catch {
      const fallbackMinutes = tenant.usedMinutes ?? 0;
      calls = [
        {
          callId: "local",
          agentName: tenant.clientName,
          customerNumber: "",
          timestamp: new Date().toISOString(),
          durationFormatted: "",
          durationMinutes: fallbackMinutes,
          status: "Completed",
          calculatedCost: fallbackMinutes * config.voicerely_per_minute_rate,
          hasRecording: false,
        },
      ];
    }

    const summary = calculateBillingSummary(calls, config);

    return NextResponse.json({ ...summary, clientId: tenant.id });
  } catch (err) {
    const { error, status } = safeError(err);
    return NextResponse.json({ error }, { status });
  }
}