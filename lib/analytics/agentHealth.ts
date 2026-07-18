// lib/analytics/agentHealth.ts
//
// Aggregates post-call Retell metadata into an "Agent Health & Performance"
// analytics model for the Admin Portal. Pure, deterministic, and driver-agnostic:
// it consumes the raw RetellCallRecord shape (the same records the dashboard
// already proxies) and never touches secrets or the network.

import type { RetellCallRecord } from "@/lib/retell/types";

export type HealthTier = "excellent" | "healthy" | "watch" | "critical";

export interface HealthMetric {
  /** 0–100 score. */
  score: number;
  tier: HealthTier;
  label: string;
}

export interface MicroMetric {
  label: string;
  /** Display value, already formatted (e.g. "87%"). */
  value: string;
  /** Raw numeric for sorting/coloring, 0–100 where applicable. */
  raw: number;
}

export interface TerminationReason {
  reason: string;
  count: number;
  /** Share of all calls, 0–1. */
  share: number;
}

export interface IssueAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface OptimizationRecommendation {
  id: string;
  title: string;
  detail: string;
  actionItem: string;
}

export interface AgentHealthReport {
  agentId: string;
  agentName: string;
  totalCalls: number;
  health: HealthMetric;
  microMetrics: MicroMetric[];
  terminationReasons: TerminationReason[];
  alerts: IssueAlert[];
  recommendations: OptimizationRecommendation[];
  /** True when derived from synthetic demo data (no live Retell key). */
  isDemo: boolean;
}

const TERMINATION_LABELS: Record<string, string> = {
  "": "Standard hangup",
  customer_hangup: "Standard hangup",
  agent_hangup: "Agent hangup",
  agent_error: "Agent error",
  customer_error: "Customer error",
  connection_timeout: "Connection timeout",
  call_ended_unexpectedly: "Call ended unexpectedly",
  user_busy: "User busy",
  no_answer: "No answer",
};

function classifyTier(score: number): HealthTier {
  if (score >= 90) return "excellent";
  if (score >= 75) return "healthy";
  if (score >= 55) return "watch";
  return "critical";
}

function tierLabel(tier: HealthTier): string {
  switch (tier) {
    case "excellent":
      return "Excellent";
    case "healthy":
      return "Healthy";
    case "watch":
      return "Needs Watch";
    case "critical":
      return "Critical";
  }
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/**
 * Builds the full Agent Health report from a set of Retell call records.
 * `isDemo` flags synthetic data so the UI can surface a "demo" notice.
 */
export function buildAgentHealthReport(
  records: RetellCallRecord[],
  opts: { agentId: string; agentName?: string; isDemo?: boolean }
): AgentHealthReport {
  const total = records.length;
  const agentName = opts.agentName ?? records[0]?.agent_name ?? "Primary Agent";

  if (total === 0) {
    return {
      agentId: opts.agentId,
      agentName,
      totalCalls: 0,
      health: { score: 0, tier: "critical", label: "No Data" },
      microMetrics: [],
      terminationReasons: [],
      alerts: [
        {
          id: "no-data",
          severity: "info",
          message: "No call records available yet to compute agent health.",
        },
      ],
      recommendations: [],
      isDemo: Boolean(opts.isDemo),
    };
  }

  // --- Core aggregates ---
  const successful = records.filter(
    (r) => r.call_analysis?.call_successful === true
  ).length;
  const goalSuccessRate = (successful / total) * 100;

  const negative = records.filter(
    (r) => r.call_analysis?.user_sentiment === "Negative"
  ).length;
  const frustrationRate = (negative / total) * 100;

  // Interruption density: share of calls that ended in an error/disconnect.
  const interrupted = records.filter(
    (r) => r.call_status === "error" || Boolean(r.disconnection_reason)
  ).length;
  const interruptionDensity = (interrupted / total) * 100;

  // --- Composite health score (0–100) ---
  // Weighted blend: goal success dominates, frustration penalizes, interruptions penalize.
  const score = clamp(
    Math.round(
      goalSuccessRate * 0.55 +
        (100 - frustrationRate) * 0.3 +
        (100 - interruptionDensity) * 0.15
    ),
    0,
    100
  );
  const tier = classifyTier(score);

  const microMetrics: MicroMetric[] = [
    { label: "Goal Success Rate", value: pct(goalSuccessRate), raw: goalSuccessRate },
    { label: "Avg Frustration Rate", value: pct(frustrationRate), raw: frustrationRate },
    { label: "Interruption Density", value: pct(interruptionDensity), raw: interruptionDensity },
  ];

  // --- Termination reasons (from disconnection_reason metadata) ---
  const reasonCounts = new Map<string, number>();
  for (const r of records) {
    const key = r.disconnection_reason ?? "";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const terminationReasons: TerminationReason[] = [...reasonCounts.entries()]
    .map(([reason, count]) => ({
      reason: TERMINATION_LABELS[reason] ?? (reason || "Standard hangup"),
      count,
      share: count / total,
    }))
    .sort((a, b) => b.count - a.count);

  // --- Issue alerts (abnormal spikes) ---
  const alerts: IssueAlert[] = [];
  if (frustrationRate >= 15) {
    alerts.push({
      id: "frustration-spike",
      severity: frustrationRate >= 25 ? "critical" : "warning",
      message: `Alert: ${Math.round(frustrationRate)}% spike in user frustration across recent calls.`,
    });
  }
  if (interruptionDensity >= 20) {
    alerts.push({
      id: "interruption-spike",
      severity: interruptionDensity >= 35 ? "critical" : "warning",
      message: `Alert: ${Math.round(interruptionDensity)}% of calls dropped due to interruptions/errors.`,
    });
  }
  if (goalSuccessRate < 60) {
    alerts.push({
      id: "goal-drop",
      severity: "warning",
      message: `Alert: Goal completion fell to ${Math.round(goalSuccessRate)}% — below target threshold.`,
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: "stable",
      severity: "info",
      message: "No abnormal agent spikes detected. Performance is within normal bounds.",
    });
  }

  // --- Automated LLM-style optimization recommendations ---
  const recommendations: OptimizationRecommendation[] = [];
  if (frustrationRate >= 15) {
    recommendations.push({
      id: "rec-frustration",
      title: "Reduce mid-call friction",
      detail:
        "Users are showing elevated negative sentiment during data-collection steps. Systemic prompt failures appear when requesting structured inputs (e.g. zip codes, account numbers).",
      actionItem:
        "System Prompt Action Item: Users are dropping out when asked for zip codes. Modify prompt constraints to accept voice spell-outs and confirm digit-by-digit.",
    });
  }
  if (interruptionDensity >= 20) {
    recommendations.push({
      id: "rec-interrupt",
      title: "Stabilize call handoffs",
      detail:
        "A high share of calls terminate via errors or timeouts. This often signals brittle tool-calling or slow backend lookups mid-conversation.",
      actionItem:
        "System Prompt Action Item: Add graceful timeout handling and a retry/escalation branch so the agent never dead-ends on a failed tool call.",
    });
  }
  if (goalSuccessRate < 60) {
    recommendations.push({
      id: "rec-goal",
      title: "Tighten goal routing",
      detail:
        "Goal completion is below target. Intents may be misrouted at the opening turn, wasting caller time before the agent reaches the right workflow.",
      actionItem:
        "System Prompt Action Item: Introduce an explicit intent-confirmation turn within the first 2 exchanges to lock routing before tool calls.",
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: "rec-stable",
      title: "Maintain current configuration",
      detail:
        "Agent health is strong. No systemic prompt failures detected in the recent window.",
      actionItem:
        "System Prompt Action Item: None required — keep monitoring weekly for drift.",
    });
  }

  return {
    agentId: opts.agentId,
    agentName,
    totalCalls: total,
    health: { score, tier, label: tierLabel(tier) },
    microMetrics,
    terminationReasons,
    alerts,
    recommendations,
    isDemo: Boolean(opts.isDemo),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}