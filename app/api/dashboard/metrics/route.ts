//
// Dynamic backend data sync for the main dashboard metrics view.
// Scoped to the authenticated client tenant (401 if no valid session).
// Aggregates the call-log ledger for the active billing cycle and computes
// Total Calls, Minutes Consumed, Average Call Duration, and Current Spend
// using the tenant's onboarding billing configuration.

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/auth";
import { listCalls } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { currentCycle, rollCycleIfNeeded } from "@/lib/billing/cycle";
import { calculateBillingSummary } from "@/lib/billing/calculate";
import { getClientConfig } from "@/lib/retell/client";
import { safeError } from "@/lib/validation";
import type { Tenant } from "@/lib/db";
import type { BillingCycle } from "@/lib/billing/cycle";
import type { BillingSummary } from "@/lib/billing/calculate";
import type { VoicerelyClientConfig } from "@/lib/billing/types";
import type { VoicerelyCallView } from "@/lib/transform";

export const dynamic = "force-dynamic";

/** Shape the frontend's MetricCard row expects. Return 200 with zeros
 *  (never throw) so the dashboard stays healthy when there's no data. */
function emptyMetrics() {
  return {
    totalCalls: 0,
    minutesConsumed: 0,
    currentSpend: 0,
    avgCallDuration: 0,
    trend: [],
    minutesAllocated: null,
    usagePercent: null,
    perMinuteRate: 0,
    planType: "hybrid" as const,
    revenueRecovered: 0,
    afterHoursCalls: 0,
    completedCalls: 0,
    avgBookingValue: 210,
  };
}

/** Aggregates calls into a daily count array for the last N days.
 *  Returns [{day: number (1..N), calls: number}] in chronological order. */
function buildDailyTrend(
  calls: { start_timestamp: number }[],
  days: number
): { day: number; calls: number }[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  const buckets = new Array<number>(days).fill(0);

  for (const c of calls) {
    const age = now - c.start_timestamp;
    const dayIndex = Math.floor(age / dayMs);
    if (dayIndex >= 0 && dayIndex < days) {
      // dayIndex 0 = today, 29 = 30 days ago. Reverse to chronological:
      buckets[days - 1 - dayIndex] += 1;
    }
  }

  return buckets.map((count, i) => ({ day: i + 1, calls: count }));
}

export async function GET(_req: NextRequest) {
  const sessionTenant = await getSessionTenant();
  if (!sessionTenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // getSessionTenant() already returns the full (cached) tenant row, so a
    // second getTenantById lookup is redundant — use it directly.
    const tenant = sessionTenant;

    // Get the current billing cycle, rolling forward if needed
    // Guard against missing createdAt (seeded/legacy tenants may not have it).
    // Default to day 1 of month so cycles are at least consistent.
    const anchorDay = tenant.createdAt
      ? new Date(tenant.createdAt).getUTCDate()
      : 1;
    const cycle = currentCycle(anchorDay);
    const { tenant: rolledTenant } = rollCycleIfNeeded(tenant);

    // Get client config for call transformation
    const config = await getClientConfig(rolledTenant);

    // Fetch calls for the current billing cycle
    const rawCalls = await listCalls(rolledTenant, { limit: 1000 });

    // Transform calls to client view
    const calls: VoicerelyCallView[] = rawCalls.map((c) =>
      transformCallToClientView(c, config)
    );

    // Filter calls to current billing cycle
    const cycleCalls = calls.filter((call) => {
      const callTime = new Date(call.timestamp).getTime();
      const cycleStart = new Date(cycle.start).getTime();
      const cycleEnd = new Date(cycle.end).getTime();
      return callTime >= cycleStart && callTime < cycleEnd;
    });

    // 1. Aggregate call metrics dynamically from the active call list.
    const totalCalls = cycleCalls.length;
    const totalSeconds = cycleCalls.reduce((sum, c) => sum + c.durationMinutes * 60, 0);
    const minutesConsumed = totalSeconds / 60;
    const avgCallDuration = totalCalls > 0 ? totalSeconds / totalCalls : 0; // seconds

    // 2. Calculate billing summary using the billing calculation utility
    const billingSummary: BillingSummary = calculateBillingSummary(cycleCalls, config);

    // 3. Build 30-day daily trend for the UsageTrendChart (using all calls for trend)
    const trend = buildDailyTrend(rawCalls, 30);

    // ── ROI / Revenue Recovered (computed from the same rawCalls already fetched) ──
    const CAPTURE_RATE = 0.60;
    const avgBookingValue = tenant.avgBookingValue ?? 210;
    const completedCalls = cycleCalls.filter((c) => c.status === "Completed").length;
    const afterHoursCalls = cycleCalls.filter((c) => {
      const hour = new Date(c.timestamp).getUTCHours();
      return hour >= 20 || hour < 8;
    }).length;
    const revenueRecovered =
      Math.round(completedCalls * avgBookingValue * CAPTURE_RATE) +
      Math.round(afterHoursCalls * avgBookingValue * CAPTURE_RATE);

    return NextResponse.json({
      // KPIs
      totalCalls,
      minutesConsumed: Math.round(minutesConsumed * 100) / 100,
      currentSpend: billingSummary.currentSpend,
      avgCallDuration: Math.round(avgCallDuration * 100) / 100,
      // Trend chart
      trend,
      // Billing summary
      minutesAllocated: billingSummary.minutesAllocated,
      usagePercent: billingSummary.usagePercent,
      perMinuteRate: billingSummary.perMinuteRate,
      planType: billingSummary.planType,
      // ROI (merged — no separate /api/dashboard/roi call needed)
      revenueRecovered,
      afterHoursCalls,
      completedCalls,
      avgBookingValue,
    });
  } catch (err) {
    // A tenant with no call records must not crash the route. Fall back to a
    // clean zeroed payload (200) instead of surfacing a 5xx to the overview.
    const { error } = safeError(err);
    console.error("dashboard/metrics fallback to zeros:", error);
    return NextResponse.json(emptyMetrics());
  }
}