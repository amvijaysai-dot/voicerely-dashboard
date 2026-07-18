// app/api/dashboard/metrics/route.ts
//
// Dynamic backend data sync for the main dashboard metrics view.
// Scoped to the authenticated client tenant (401 if no valid session).
// Aggregates the call-log ledger for the active billing cycle and computes
// Total Calls, Minutes Consumed, Average Call Duration, and Current Spend
// using the tenant's onboarding billing configuration.

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/auth";
import { listCalls, getClientConfig } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { safeError } from "@/lib/validation";
import type { BillingModel } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Computes Current Spend from the tenant's billing model + consumed minutes. */
function computeCurrentSpend(
  model: BillingModel,
  baseMonthlyFee: number,
  includedMinutes: number,
  perMinuteRate: number,
  minutesConsumed: number
): number {
  switch (model) {
    case "hybrid":
      // Base Fee + Max(0, Consumed - Included) * Overage Rate
      return baseMonthlyFee + Math.max(0, minutesConsumed - includedMinutes) * perMinuteRate;
    case "metered_maintenance":
      // Flat Maintenance + (Total Minutes * Rate)
      return baseMonthlyFee + minutesConsumed * perMinuteRate;
    case "pure_per_minute":
      // Total Minutes * Rate
      return minutesConsumed * perMinuteRate;
    default:
      return 0;
  }
}

/** Shape the frontend's MetricCard row expects. Return 200 with zeros
 *  (never throw) so the dashboard stays healthy when there's no data. */
function emptyMetrics() {
  return {
    totalCalls: 0,
    minutesConsumed: 0,
    currentSpend: 0,
    avgCallDuration: 0,
  };
}

export async function GET(_req: NextRequest) {
  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Aggregate the SAME dataset the trend chart uses: the active session's
    // Retell call list (including demo synthetic data), transformed through the
    // client config. This keeps the KPI cards and the chart perfectly in sync
    // and removes the dependency on the separate (often empty) call-log ledger.
    const config = await getClientConfig(tenant);
    const rawCalls = await listCalls(tenant, { limit: 1000 });
    const calls = rawCalls.map((c) => transformCallToClientView(c, config));

    // 1. Aggregate call metrics dynamically from the active call list.
    const totalCalls = calls.length;
    const totalSeconds = calls.reduce((sum, c) => sum + c.durationMinutes * 60, 0);
    const minutesConsumed = totalSeconds / 60;
    const avgCallDuration = totalCalls > 0 ? totalSeconds / totalCalls : 0; // seconds

    // 2. Read the tenant's onboarding billing configuration (with safe defaults).
    const billingModel: BillingModel = tenant.billingModel ?? "hybrid";
    const baseMonthlyFee = tenant.baseMonthlyFee ?? 0;
    const includedMinutes = tenant.includedMinutes ?? 0;
    const perMinuteRate = tenant.perMinuteRate ?? config.voicerely_per_minute_rate ?? 0;

    // 3. Dynamically compute Current Spend per the matched billing model.
    const currentSpend = computeCurrentSpend(
      billingModel,
      baseMonthlyFee,
      includedMinutes,
      perMinuteRate,
      minutesConsumed
    );

    return NextResponse.json({
      totalCalls,
      minutesConsumed: Math.round(minutesConsumed * 100) / 100,
      currentSpend: Math.round(currentSpend * 100) / 100,
      avgCallDuration: Math.round(avgCallDuration * 100) / 100,
    });
  } catch (err) {
    // A tenant with no call records must not crash the route. Fall back to a
    // clean zeroed payload (200) instead of surfacing a 5xx to the overview.
    const { error } = safeError(err);
    console.error("dashboard/metrics fallback to zeros:", error);
    return NextResponse.json(emptyMetrics());
  }
}