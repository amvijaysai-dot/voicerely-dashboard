// components/billing/CustomPlanUsage.tsx
//
// "Custom Plan Minutes Consumed" — a premium, proprietary-looking usage meter
// for the client Metrics view. Deliberately avoids any mention of external
// infrastructure; it reads as a Voicerely platform-native tier calculation.

interface CustomPlanUsageProps {
  minutesUsed: number;
  minutesAllocated: number;
}

export function CustomPlanUsage({ minutesUsed, minutesAllocated }: CustomPlanUsageProps) {
  const percent = minutesAllocated > 0 ? Math.min(100, (minutesUsed / minutesAllocated) * 100) : 0;
  const remaining = Math.max(0, minutesAllocated - minutesUsed);
  const nearLimit = percent >= 85;
  const isReady = minutesUsed === 0;

  return (
    <section className="bg-surface border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Custom Plan Minutes Consumed
        </h2>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            nearLimit ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"
          }`}
        >
          {nearLimit ? "Approaching limit" : isReady ? "Ready to use" : "On track"}
        </span>
      </div>
      <p className="text-sm text-muted mb-5">
        {isReady
          ? `Ready to use — ${remaining.toLocaleString("en-US")} minutes remaining.`
          : "Your proprietary Voicerely voice allowance, calculated entirely by your plan tier."}
      </p>

      <div className="flex items-baseline justify-between mb-3">
        <span className="text-2xl font-semibold text-foreground tabular-nums">
          {minutesUsed.toLocaleString("en-US")}
          <span className="text-muted text-base font-normal">
            {" "}/ {minutesAllocated.toLocaleString("en-US")} minutes
          </span>
        </span>
        <span className="text-sm text-muted tabular-nums">
          {percent.toFixed(0)}% used
        </span>
      </div>

      <div className="w-full h-3 rounded-full bg-background-alt overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            nearLimit
              ? "bg-gradient-to-r from-danger to-accent"
              : "bg-gradient-to-r from-accent to-accent-alt"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-muted">
        <span>{remaining.toLocaleString("en-US")} minutes remaining this month</span>
        <span>Resets on your billing cycle</span>
      </div>
    </section>
  );
}
