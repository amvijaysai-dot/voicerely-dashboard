// lib/billing/calculate.ts

import type { VoicerelyCallView } from "../transform";
import type { VoicerelyClientConfig, VoicerelyPlanType } from "./types";

export interface BillingSummary {
  minutesUsed: number;
  minutesAllocated: number | null;
  usagePercent: number | null;      // null when unlimited/PAYG
  currentSpend: number;
  perMinuteRate: number;
  planType: VoicerelyPlanType;
}

export function calculateBillingSummary(
  calls: VoicerelyCallView[],
  config: VoicerelyClientConfig
): BillingSummary {
  const minutesUsed = round2(
    calls.reduce((sum, c) => sum + c.durationMinutes, 0)
  );
  const currentSpend = round2(
    calls.reduce((sum, c) => sum + c.calculatedCost, 0)
  );

  return {
    minutesUsed,
    minutesAllocated: config.allocated_minutes,
    usagePercent: config.allocated_minutes
      ? round2((minutesUsed / config.allocated_minutes) * 100)
      : null,
    currentSpend,
    perMinuteRate: config.voicerely_per_minute_rate,
    planType: config.voicerely_plan_type,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}