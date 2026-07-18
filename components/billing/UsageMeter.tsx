// components/billing/UsageMeter.tsx
import type { UsageStatus } from "@/lib/billing/thresholds";

interface UsageMeterProps {
  minutesUsed: number;
  minutesAllocated: number | null;
  /** Optional threshold status to dynamically recolor the progress bar. */
  status?: UsageStatus;
}

export function UsageMeter({ minutesUsed, minutesAllocated, status }: UsageMeterProps) {
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

  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-muted">Minutes used</span>
        <span className="text-sm text-foreground tabular-nums">
          {minutesUsed.toFixed(0)}
          {minutesAllocated ? ` / ${minutesAllocated}` : " (pay as you go)"}
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
