// components/overview/MetricCard.tsx
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
}

/** Formats a number with locale-aware grouping (e.g., 1234567 → "1,234,567"). */
function formatLocale(value: string | number): string {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function MetricCard({ label, value, icon: Icon, trend }: MetricCardProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <Icon className="w-4 h-4 text-accent" />
      </div>
      <span className="text-3xl font-semibold text-foreground tabular-nums tracking-tight">
        {formatLocale(value)}
      </span>
      {trend && (
        <span className={trend.positive ? "text-sm text-success" : "text-sm text-danger"}>
          {trend.value}
        </span>
      )}
    </div>
  );
}
