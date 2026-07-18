// components/admin/ClientDiagnosticView.tsx
//
// Isolated Client Anomaly & Diagnostic Ledger. Triggered from the "All Clients"
// grid when an admin clicks a specific client. Bypasses global averages and
// shows ONLY this tenant's call-level anomaly markers: top metrics (Success
// Rate, Interruption Index, Total Hallucinations/Deviations), an aggregated
// "AI Prompt Fix Recommendation" container, and a historical call-log table
// with the breakdown parameters for every single call.

import { ArrowLeft, Sparkles, AlertTriangle, Webhook } from "lucide-react";
import type { CallLog } from "@/lib/db";

interface ClientDiagnosticViewProps {
  clientName: string;
  username: string;
  agentId: string;
  logs: CallLog[];
  onBack: () => void;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ClientDiagnosticView({
  clientName,
  username,
  agentId,
  logs,
  onBack,
}: ClientDiagnosticViewProps) {
  const total = logs.length;

  // ---- Per-agent aggregates (bypass global averages) ----
  // A call is successful unless it ended in a failure-style disconnection
  // (user/agent hang-up, error, dropped). A normal "call_ended" completion is
  // a success even though it carries a disconnection reason.
  const FAILURE_REASONS = new Set([
    "user_hung_up",
    "agent_hung_up",
    "error",
    "call_failed",
    "dropped",
    "no_answer",
  ]);
  const isFailure = (l: CallLog): boolean =>
    Boolean(l.disconnectionReason) && FAILURE_REASONS.has(l.disconnectionReason as string);
  const successful = logs.filter((l) => !isFailure(l)).length;
  const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

  const totalInterruptions = logs.reduce((s, l) => s + (l.interruptionCount ?? 0), 0);
  const interruptionIndex = total > 0 ? Math.round((totalInterruptions / total) * 10) / 10 : 0;

  const totalHallucinations = logs.filter((l) => l.hallucinationDetected).length;
  const totalDeviations = logs.filter((l) => l.scriptDeviation).length;
  const totalMissed = logs.filter((l) => l.missedInformation).length;

  // ---- Aggregated AI Prompt Fix Recommendation ----
  // Collect the distinct recommended corrections across calls; if none are
  // present, synthesize a summary from the detected anomaly counts.
  const corrections = Array.from(
    new Set(logs.map((l) => l.recommendedPromptCorrection).filter((c): c is string => Boolean(c)))
  );
  const aggregatedSummary =
    logs
      .map((l) => l.mistakeSummary)
      .filter((s): s is string => Boolean(s))
      .join(" ") || null;

  const topMetrics = [
    { label: "Success Rate", value: `${successRate}%`, tone: successRate >= 75 ? "text-success" : successRate >= 50 ? "text-accent" : "text-danger" },
    { label: "Interruption Index", value: interruptionIndex.toFixed(1), tone: interruptionIndex <= 1 ? "text-success" : interruptionIndex <= 3 ? "text-accent" : "text-danger" },
    { label: "Hallucinations", value: String(totalHallucinations), tone: totalHallucinations === 0 ? "text-success" : "text-danger" },
    { label: "Script Deviations", value: String(totalDeviations), tone: totalDeviations === 0 ? "text-success" : "text-danger" },
  ];

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition w-fit"
      >
        <ArrowLeft className="w-4 h-4" /> Back to All Clients
      </button>

      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{clientName}</h2>
          <p className="text-xs text-muted">@{username} · {agentId || "No agent linked"}</p>
        </div>
        <span className="ml-auto text-xs text-muted tabular-nums">{total} calls analyzed</span>
      </div>

      {/* Top metrics — this agent only */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {topMetrics.map((m) => (
          <div key={m.label} className="bg-surface border border-border rounded-2xl p-5">
            <p className="text-xs text-muted">{m.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${m.tone}`}>{m.value}</p>
          </div>
        ))}
      </section>

      {/* AI Prompt Fix Recommendation */}
      <section className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">AI Prompt Fix Recommendation</h3>
        </div>
        {corrections.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {corrections.map((c, i) => (
              <li
                key={i}
                className="text-sm text-accent bg-accent/10 border border-accent/20 rounded-lg px-3 py-2"
              >
                {c}
              </li>
            ))}
          </ul>
        ) : aggregatedSummary ? (
          <p className="text-sm text-accent bg-accent/10 border border-accent/20 rounded-lg px-3 py-2">
            {aggregatedSummary}
          </p>
        ) : (
          <p className="text-sm text-muted flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            No systemic prompt failures detected for this agent. Keep monitoring call-level markers.
          </p>
        )}
        {(totalHallucinations > 0 || totalDeviations > 0 || totalMissed > 0) && (
          <p className="text-xs text-muted">
            Detected across {total} calls: {totalHallucinations} hallucination(s), {totalDeviations} script deviation(s), {totalMissed} missed-information event(s).
          </p>
        )}
      </section>

      {/* Historical call-log table — every single call */}
      <section className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Call History & Breakdown</h3>
        </div>
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center">
              <Webhook className="w-5 h-5 text-muted" />
            </div>
            <div className="text-foreground font-medium">Awaiting Live Integration</div>
            <p className="text-sm text-muted max-w-sm">
              Hook up your Retell AI API key to stream call analytics here.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop/tablet table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="px-4 py-3 font-medium">Call ID</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium text-right">Duration</th>
                    <th className="px-4 py-3 font-medium text-center">Halluc.</th>
                    <th className="px-4 py-3 font-medium text-center">Deviation</th>
                    <th className="px-4 py-3 font-medium text-center">Missed</th>
                    <th className="px-4 py-3 font-medium text-right">Interrupts</th>
                    <th className="px-4 py-3 font-medium text-right">Talk Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.callId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-foreground font-mono text-xs truncate max-w-[140px]">{l.callId}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(l.createdAt)}</td>
                      <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatDuration(l.totalDurationSeconds)}</td>
                      <td className="px-4 py-3 text-center">
                        {l.hallucinationDetected ? (
                          <span className="text-danger font-semibold">✓</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {l.scriptDeviation ? (
                          <span className="text-danger font-semibold">✓</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {l.missedInformation ? (
                          <span className="text-danger font-semibold">✓</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground tabular-nums">{(l.interruptionCount ?? 0).toFixed(0)}</td>
                      <td className="px-4 py-3 text-right text-foreground tabular-nums">
                        {l.agentTalkRatio != null ? `${Math.round(l.agentTalkRatio * 100)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <ul className="sm:hidden divide-y divide-border">
              {logs.map((l) => (
                <li key={l.callId} className="px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-mono text-xs truncate">{l.callId}</span>
                    <span className="text-xs text-muted shrink-0">{formatDate(l.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-foreground tabular-nums">{formatDuration(l.totalDurationSeconds)}</span>
                    <span className={l.hallucinationDetected ? "text-danger font-semibold" : "text-muted"}>
                      Halluc: {l.hallucinationDetected ? "Yes" : "No"}
                    </span>
                    <span className={l.scriptDeviation ? "text-danger font-semibold" : "text-muted"}>
                      Dev: {l.scriptDeviation ? "Yes" : "No"}
                    </span>
                    <span className={l.missedInformation ? "text-danger font-semibold" : "text-muted"}>
                      Missed: {l.missedInformation ? "Yes" : "No"}
                    </span>
                    <span className="text-foreground tabular-nums">Int: {(l.interruptionCount ?? 0).toFixed(0)}</span>
                    <span className="text-foreground tabular-nums">
                      Talk: {l.agentTalkRatio != null ? `${Math.round(l.agentTalkRatio * 100)}%` : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
