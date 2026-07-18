// components/overview/OutcomeMetricCard.tsx
//
// Premium top-line outcome card for the client Metrics view. Shows a numeric
// total, an optional month-over-month delta, and a compact sparkline built
// from a small series of recent values. Uses the Voicerely dark palette.

import { LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface OutcomeMetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Month-over-month percentage, e.g. 12.4 (means +12.4%). */
  momPercent?: number;
  /** Recent values for the sparkline (e.g. last 12 periods). */
  sparkline?: number[];
  /** When true, a downward movement is good (e.g. handle time). */
  invertTrend?: boolean;
}

const SPARK_W = 120;
const SPARK_H = 36;

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * SPARK_W;
    const y = SPARK_H - ((v - min) / range) * (SPARK_H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="w-[120px] h-9"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={line} fill="none" stroke="#FF6B00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OutcomeMetricCard({
  label,
  value,
  icon: Icon,
  momPercent,
  sparkline,
  invertTrend = false,
}: OutcomeMetricCardProps) {
  const hasTrend = typeof momPercent === "number";
  const up = (momPercent ?? 0) >= 0;
  // "good" depends on whether an increase is desirable for this metric.
  const good = invertTrend ? !up : up;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <Icon className="w-4 h-4 text-accent" />
      </div>

      <div className="flex items-end justify-between gap-3">
        <span className="text-3xl font-semibold text-foreground tabular-nums tracking-tight">
          {value}
        </span>
        {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} />}
      </div>

      {hasTrend && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className={good ? "text-success" : "text-danger"}>
            {up ? <ArrowUpRight className="w-4 h-4 inline" /> : <ArrowDownRight className="w-4 h-4 inline" />}
            {Math.abs(momPercent as number).toFixed(1)}%
          </span>
          <span className="text-muted">vs last month</span>
        </div>
      )}
    </div>
  );
}
