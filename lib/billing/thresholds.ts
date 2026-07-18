// lib/billing/thresholds.ts
//
// Shared usage-threshold evaluator. Both the client dashboard banners and the
// billing progress meters derive their warning state from this single helper
// so the "safe / warning / depleted" semantics stay consistent everywhere.

export type UsageStatus = "safe" | "warning" | "depleted";

export interface UsageStatusResult {
  status: UsageStatus;
  /** Calculated usage percentage (0–100+, clamped for display only). */
  percentage: number;
  /** Clean, user-facing alert copy. */
  message: string;
}

const WARNING_THRESHOLD = 80; // >= 80% -> warning
const DEPLETED_THRESHOLD = 100; // >= 100% -> depleted

export function getUsageStatus(used: number, allocated: number): UsageStatusResult {
  // Pay-as-you-go (no allocation) or non-positive allocation is always "safe"
  // — there is no fixed cap to exceed.
  if (!allocated || allocated <= 0) {
    return {
      status: "safe",
      percentage: 0,
      message: "You're on a pay-as-you-go plan with no fixed minute cap.",
    };
  }

  const percentage = Math.round((used / allocated) * 100);
  const clamped = Math.min(100, Math.max(0, percentage));

  if (percentage >= DEPLETED_THRESHOLD) {
    return {
      status: "depleted",
      percentage,
      message:
        "You have used 100% of your included minutes. Please upgrade your plan to avoid service interruption.",
    };
  }

  if (percentage >= WARNING_THRESHOLD) {
    return {
      status: "warning",
      percentage,
      message: `You have used ${clamped}% of your included minutes. Please upgrade your plan soon to avoid service interruption.`,
    };
  }

  return {
    status: "safe",
    percentage,
    message: `You have used ${clamped}% of your included minutes.`,
  };
}
