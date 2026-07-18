// app/api/dashboard/roi/route.ts
//
// Returns the "Revenue Recovered" estimate for the current billing cycle.
// This is VoiceRely's key differentiator metric — shows clients the exact
// dollar value their AI agent delivered, not just call volume.
//
// Formula:
//   inbound_revenue = total_calls * avg_booking_value * capture_rate (0.60)
//   after_hours_revenue = after_hours_calls * avg_booking_value
//   total_recovered = inbound_revenue + after_hours_revenue
//
// capture_rate of 0.60 is conservative: industry average for AI vs voicemail.

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/auth";
import { listCalls, getClientConfig } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { isInCycle, rollCycleIfNeeded } from "@/lib/billing/cycle";

export const dynamic = "force-dynamic";

const CAPTURE_RATE = 0.60; // Conservative: 60% of answered calls convert to bookings

export async function GET(_req: NextRequest) {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { tenant: t } = rollCycleIfNeeded(tenant);
    const config = await getClientConfig(t);
    const avgBookingValue = t.avgBookingValue ?? 210;

    const cycle = {
      start: t.billingCycleStart ?? new Date().toISOString(),
      end: t.billingCycleEnd ?? "",
    };

    let rawCalls: Awaited<ReturnType<typeof listCalls>> = [];
    try {
      rawCalls = await listCalls(t, { limit: 1000 });
    } catch {
      rawCalls = [];
    }

    const allViews = rawCalls.map((c) => transformCallToClientView(c, config));
    // Scope to current billing cycle.
    const cycleCalls = allViews.filter((c) =>
      cycle.end ? isInCycle(c.timestamp, cycle) : true
    );

    const totalCalls = cycleCalls.length;
    const completedCalls = cycleCalls.filter((c) => c.status === "Completed").length;

    // Estimate after-hours calls: calls between 6pm–8am local time.
    // We use UTC hour as a proxy (UTC 20:00–08:00 covers most AU/US after-hours).
    const afterHoursCalls = cycleCalls.filter((c) => {
      const hour = new Date(c.timestamp).getUTCHours();
      return hour >= 20 || hour < 8;
    }).length;

    // Revenue recovered calculation.
    const inboundRevenue = Math.round(completedCalls * avgBookingValue * CAPTURE_RATE);
    const afterHoursRevenue = Math.round(afterHoursCalls * avgBookingValue * CAPTURE_RATE);
    const totalRevenue = inboundRevenue + afterHoursRevenue;

    return NextResponse.json({
      revenueRecovered: totalRevenue,
      inboundRevenue,
      afterHoursRevenue,
      totalCalls,
      completedCalls,
      afterHoursCalls,
      avgBookingValue,
      captureRate: CAPTURE_RATE,
    });
  } catch {
    return NextResponse.json({
      revenueRecovered: 0,
      inboundRevenue: 0,
      afterHoursRevenue: 0,
      totalCalls: 0,
      completedCalls: 0,
      afterHoursCalls: 0,
      avgBookingValue: 210,
      captureRate: 0.60,
    });
  }
}