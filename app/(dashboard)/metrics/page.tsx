// app/(dashboard)/metrics/page.tsx
//
// Client Dashboard & Metrics view. Premium, business-outcome-focused surface
// for an end-business owner: top-line outcome cards, a proprietary custom-plan
// usage meter, and a scannable call-history table. All data is pulled live
// from the same unified listCalls/transform pipeline the Overview tab uses
// (/api/calls and /api/dashboard/metrics) so both tabs stay perfectly in sync.

"use client";

import { useEffect, useState } from "react";
import { PhoneCall, Timer, CalendarCheck } from "lucide-react";
import { OutcomeMetricCard } from "@/components/overview/OutcomeMetricCard";
import { CustomPlanUsage } from "@/components/billing/CustomPlanUsage";
import { UsageAlertBanner } from "@/components/billing/UsageAlertBanner";
import { getUsageStatus } from "@/lib/billing/thresholds";
import {
  CallHistoryTable,
  type CallHistoryRow,
} from "@/components/calls/CallHistoryTable";
import {
  CallTranscriptModal,
  type CallTranscriptDetail,
  type TranscriptTurn,
} from "@/components/drawer/CallTranscriptModal";

// Shape returned by /api/calls (VoicerelyCallView) + the metrics payload.
interface CallsResponse {
  calls: {
    callId: string;
    agentName: string;
    customerNumber: string;
    timestamp: string;
    durationFormatted: string;
    durationMinutes: number;
    status: "Completed" | "Failed";
    calculatedCost: number;
    sentiment?: "Positive" | "Neutral" | "Negative";
    hasRecording: boolean;
  }[];
}
interface DashboardMetrics {
  totalCalls: number;
  minutesConsumed: number;
  currentSpend: number;
  avgCallDuration: number; // seconds
}

// Shape returned by /api/billing/summary (BillingSummary).
interface BillingSummary {
  minutesUsed: number;
  minutesAllocated: number | null;
  usagePercent: number | null;
  currentSpend: number;
  perMinuteRate: number;
  planType: string;
}

/** Maps a live call record to the table row shape. */
function toHistoryRow(c: CallsResponse["calls"][number]): CallHistoryRow {
  return {
    id: c.callId,
    timestamp: c.timestamp,
    fromNumber: c.customerNumber,
    durationFormatted: c.durationFormatted,
    sentiment: c.sentiment ?? "Neutral",
  };
}

/** Builds an interactive transcript detail from a live call record. The live
 *  Retell payload exposes a flat transcript string (no speaker turns yet), so
 *  we surface it as a single agent-side block plus the per-call metadata. */
function buildDetail(row: CallHistoryRow, raw: CallsResponse["calls"][number]): CallTranscriptDetail {
  const durationSeconds = Math.round(raw.durationMinutes * 60);
  const transcriptText = (raw as { transcript?: string }).transcript?.trim();
  const turns: TranscriptTurn[] = transcriptText
    ? [{ id: `${row.id}-1`, speaker: "agent", timestamp: "00:00", text: transcriptText }]
    : [];
  const executiveSummary = raw.hasRecording
    ? "Call handled by your Voicerely voice agent. Full recording available."
    : "Call handled by your Voicerely voice agent.";
  return {
    id: row.id,
    timestamp: row.timestamp,
    fromNumber: row.fromNumber,
    durationSeconds,
    sentiment: row.sentiment,
    executiveSummary,
    transcript: turns,
  };
}

export default function MetricsPage() {
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<CallsResponse["calls"]>([]);
  const [rows, setRows] = useState<CallHistoryRow[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalCalls: 0,
    minutesConsumed: 0,
    currentSpend: 0,
    avgCallDuration: 0,
  });
  const [minutesAllocated, setMinutesAllocated] = useState<number | null>(null);
  const [selected, setSelected] = useState<CallHistoryRow | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        // Unified data sources — identical to the Overview tab.
        const [callsRes, metricsRes, summaryRes] = await Promise.all([
          fetch("/api/calls?limit=1000"),
          fetch("/api/dashboard/metrics"),
          fetch("/api/billing/summary"),
        ]);
        if (!callsRes.ok) throw new Error("Failed to load call history");
        if (!metricsRes.ok) throw new Error("Failed to load metrics");

        const callsData: CallsResponse = await callsRes.json();
        const m: DashboardMetrics = await metricsRes.json();
        if (!active) return;

        setCalls(callsData.calls ?? []);
        setRows((callsData.calls ?? []).map(toHistoryRow));
        setMetrics(m);

        // Real plan allowance comes from the billing summary (allocated_minutes),
        // not derived from consumption. Tolerates a failed summary fetch.
        if (summaryRes.ok) {
          const summary: BillingSummary = await summaryRes.json();
          setMinutesAllocated(summary.minutesAllocated ?? null);
        }
      } catch {
        /* surfaces empty/loading state; cards already default to 0s */
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  // Derive outcome cards from the live metrics payload so the Metrics tab
  // mirrors the Overview tab exactly (0s for a brand-new account).
  const totalCalls = metrics.totalCalls;
  const avgHandleSeconds = metrics.avgCallDuration;
  const avgHandleFormatted = `${Math.floor(avgHandleSeconds / 60)}m ${Math.floor(
    avgHandleSeconds % 60
  )
    .toString()
    .padStart(2, "0")}s`;

  // Spend proxy for "appointments booked" would be inaccurate, so we map it to
  // the live Current Spend figure rendered as a dollar outcome instead of a mock.
  const selectedRaw = selected ? calls.find((c) => c.callId === selected.id) ?? null : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Business Metrics</h1>
        <p className="text-sm text-muted mt-1">
          Outcome-focused performance and your Voicerely voice plan usage.
        </p>
      </div>

      {!loading &&
        (() => {
          const usage = getUsageStatus(Math.round(metrics.minutesConsumed), minutesAllocated ?? 0);
          return usage.status !== "safe" ? (
            <UsageAlertBanner status={usage.status} message={usage.message} />
          ) : null;
        })()}

      {/* 1. Top-line outcome metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <OutcomeMetricCard
          label="Total Calls Answered"
          value={totalCalls.toLocaleString("en-US")}
          icon={PhoneCall}
        />
        <OutcomeMetricCard
          label="Average Handle Time"
          value={avgHandleFormatted}
          icon={Timer}
          invertTrend
        />
        <OutcomeMetricCard
          label="Current Spend"
          value={`$${metrics.currentSpend.toFixed(2)}`}
          icon={CalendarCheck}
        />
      </div>

      {/* 2. Agency custom usage & quota */}
      <CustomPlanUsage
        minutesUsed={Math.round(metrics.minutesConsumed)}
        minutesAllocated={minutesAllocated ?? Math.round(metrics.minutesConsumed)}
      />

      {/* 3. Scannable call history logs */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Recent Call History</h2>
        <CallHistoryTable
          rows={rows}
          loading={loading}
          onViewTranscript={setSelected}
        />
      </section>

      {/* Interactive transcript & recording modal */}
      <CallTranscriptModal
        call={selected && selectedRaw ? buildDetail(selected, selectedRaw) : null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
