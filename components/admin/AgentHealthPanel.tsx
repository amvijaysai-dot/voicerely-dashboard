// components/admin/AgentHealthPanel.tsx
//
// "Agent Performance & Health Analytics" sub-panel for the Admin Portal.
// Renders a color-coded Agent Health Rating ring, micro-metric grids, a
// call-termination breakdown, an issue-alerts log, and an automated LLM-style
// optimization summary. Purely presentational — it receives a fully-built
// AgentHealthReport (see lib/analytics/agentHealth.ts).

import { AlertTriangle, Sparkles, TrendingDown, Activity } from "lucide-react";
import type {
  AgentHealthReport,
  HealthTier,
  IssueAlert,
  OptimizationRecommendation,
  TerminationReason,
} from "@/lib/analytics/agentHealth";

const TIER_STYLES: Record<HealthTier, { ring: string; text: string; badge: string }> = {
  excellent: { ring: "#22C55E", text: "text-success", badge: "bg-success/15 text-success" },
  healthy: { ring: "#FF6B00", text: "text-accent", badge: "bg-accent/15 text-accent" },
  watch: { ring: "#F59E0B", text: "text-accent", badge: "bg-accent/15 text-accent" },
  critical: { ring: "#EF4444", text: "text-danger", badge: "bg-danger/15 text-danger" },
};

const SEVERITY_STYLES: Record<IssueAlert["severity"], string> = {
  info: "bg-background-alt border-border text-muted",
  warning: "bg-accent/10 border-accent/30 text-accent",
  critical: "bg-danger/10 border-danger/30 text-danger",
};

function HealthRing({ score, tier, label }: { score: number; tier: HealthTier; label: string }) {
  const style = TIER_STYLES[tier];
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#2A2A2E" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={style.ring}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-3xl font-semibold tabular-nums ${style.text}`}>{score}</span>
        <span className="text-xs text-muted">/ 100</span>
      </div>
      <span className={`absolute -bottom-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>
        {label}
      </span>
    </div>
  );
}

function MicroMetricGrid({ metrics }: { metrics: AgentHealthReport["microMetrics"] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {metrics.map((m) => {
        const tone =
          m.raw >= 75 ? "text-success" : m.raw >= 50 ? "text-accent" : "text-danger";
        return (
          <div key={m.label} className="bg-background-alt border border-border rounded-xl p-4">
            <p className="text-xs text-muted">{m.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{m.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function TerminationList({ reasons }: { reasons: TerminationReason[] }) {
  if (reasons.length === 0) {
    return <p className="text-sm text-muted">No termination data available.</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {reasons.map((r) => (
        <li key={r.reason} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">{r.reason}</span>
            <span className="text-muted tabular-nums">
              {r.count} · {Math.round(r.share * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-background-alt overflow-hidden">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round(r.share * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AlertLog({ alerts }: { alerts: IssueAlert[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${SEVERITY_STYLES[a.severity]}`}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{a.message}</span>
        </li>
      ))}
    </ul>
  );
}

function RecommendationCard({ rec }: { rec: OptimizationRecommendation }) {
  return (
    <div className="bg-background-alt border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <h4 className="text-sm font-semibold text-foreground">{rec.title}</h4>
      </div>
      <p className="text-sm text-muted">{rec.detail}</p>
      <p className="text-sm text-accent bg-accent/10 border border-accent/20 rounded-lg px-3 py-2">
        {rec.actionItem}
      </p>
    </div>
  );
}

export function AgentHealthPanel({ report }: { report: AgentHealthReport }) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Agent Performance & Health Analytics
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {report.isDemo && (
            <span className="text-xs text-muted bg-background-alt border border-border rounded-full px-2.5 py-0.5">
              Demo data
            </span>
          )}
          <span className="text-xs text-muted tabular-nums">{report.totalCalls} calls analyzed</span>
        </div>
      </div>

      {/* 1. Agent Health Score & Metric Rings */}
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <HealthRing score={report.health.score} tier={report.health.tier} label={report.health.label} />
        <div className="flex-1 w-full">
          <MicroMetricGrid metrics={report.microMetrics} />
        </div>
      </div>

      {/* 2. System Friction & Drop-off Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-accent" /> Top Call Termination Reasons
          </h3>
          <TerminationList reasons={report.terminationReasons} />
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-accent" /> Issue Alerts
          </h3>
          <AlertLog alerts={report.alerts} />
        </div>
      </div>

      {/* 3. Automated LLM Optimization Recommendations */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" /> AI Optimization Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {report.recommendations.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} />
          ))}
        </div>
      </div>
    </section>
  );
}
