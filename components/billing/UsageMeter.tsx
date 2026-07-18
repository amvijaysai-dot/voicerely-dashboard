// components/billing/UsageMeter.tsx
import type { UsageStatus } from "@/lib/billing/thresholds";
import type { VoicerelyPlanType } from "@/lib/billing/types";

interface UsageMeterProps {
  minutesUsed: number;
  minutesAllocated: number | null;
  /** Optional threshold status to dynamically recolor the progress bar. */
  status?: UsageStatus;
  /** Plan type so a hybrid plan with 0 included minutes is labeled
   *  correctly instead of being mistaken for pay-as-you-go. */
  planType?: VoicerelyPlanType;
}

export function UsageMeter({
  minutesUsed,
  minutesAllocated,
  status,
  planType,
}: UsageMeterProps) {
  const percent = minutesAllocated
    ? Math.min(100, (minutesUsed / minutesAllocated) * 100)
    : 0;

  // Default Voicerely-orange; amber for warning, crimson for depleted.
  const barClass =
    status === "depleted"
      ? "bg-gradient-to-r from-danger to-red-400"
      : status === "warning"
      ? "bg-gradient-to-r from-accent to-yellow-400"
      : "bg-gradient-to-r from-accent to-accent-alt";

  // A hybrid plan may legitimately include 0 minutes for the cycle — that
  // is NOT the same as pay-as-you-go. Only pure PAYG shows the
  // "pay as you go" label; a hybrid/fixed plan with 0 allocated shows a
  // clear "0 minutes included this cycle" state.
  const isPurePayg = planType === "pay_as_you_go";
  const allocationLabel =
    minutesAllocated === null || minutesAllocated === undefined
      ? isPurePayg
        ? " (pay as you go)"
        : " (0 minutes included this cycle)"
      : ` / ${minutesAllocated}`;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-muted">Minutes used</span>
        <span className="text-sm text-foreground tabular-nums">
          {minutesUsed.toFixed(0)}
          {allocationLabel}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-background-alt overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
