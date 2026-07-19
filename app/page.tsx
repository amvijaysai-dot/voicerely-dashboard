//
// Root Overview route. Wrapped in the shared dashboard shell
// (sidebar + topbar) so it matches /calls and /billing.
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PhoneCall, Clock, DollarSign, Timer } from "lucide-react";
import { MetricCard } from "@/components/overview/MetricCard";
import { UsageAlertBanner } from "@/components/billing/UsageAlertBanner";
import { getUsageStatus } from "@/lib/billing/thresholds";
import DashboardLayout from "@/app/(dashboard)/layout";

// Lazy-load the SVG AreaChart so the heavy SVG math never blocks the
// initial paint. The chart is below the fold on most viewports anyway.
const UsageTrendChart = dynamic(
  () => import("@/components/overview/UsageTrendChart").then((m) => m.UsageTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);

interface DashboardMetrics {
  totalCalls: number;
  minutesConsumed: number;
  currentSpend: number;
  avgCallDuration: number; // seconds
  trend?: { day: number; calls: number }[];
  minutesAllocated: number | null;
  usagePercent: number | null;
  perMinuteRate: number;
  planType: string;
  revenueRecovered: number;
  afterHoursCalls: number;
  completedCalls: number;
  avgBookingValue?: number;
}

interface CallsResponse {
  calls: {
    status: "Completed" | "Failed";
    timestamp?: string;
  }[];
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-hover rounded ${className}`} />;
}

/** Centered empty state shown on the Overview chart when the tenant has no
 *  call volume yet — replaces a flat, lifeless line chart with onboarding
 *  guidance and a CTA into the Agents setup flow. */
function EmptyCallVolume() {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-5 py-10 px-6">
      <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FF6B00"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 11l18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      </div>
      <div className="flex flex-col gap-2 max-w-sm">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          Your dashboard is ready to go!
        </h3>
        <p className="text-sm text-muted leading-relaxed">
          Connect a phone number or trigger your first synthetic assistant call to
          stream real-time volume, duration, and sentiment metrics here.
        </p>
      </div>
      <Link
        href="/agents"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-black font-medium text-sm hover:opacity-90 transition"
      >
        Set Up Your First Agent
      </Link>
    </div>
  );
}

/** Formats a duration in seconds into an intuitive M:SS string (e.g. 292 → "4:52"). */
function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [totalCalls, setTotalCalls] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [spend, setSpend] = useState(0);
  const [avgDuration, setAvgDuration] = useState(0);
  const [trend, setTrend] = useState<{ day: number; calls: number }[]>([]);
  const [minutesAllocated, setMinutesAllocated] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let cancelled = false;
    async function load() {
      try {
        // Live KPI metrics from the dynamic backend sync endpoint.
        const [metricsRes, callsRes, summaryRes] = await Promise.all([
          fetch("/api/dashboard/metrics", { signal }),
          fetch("/api/calls?limit=20", { signal }),
          fetch("/api/billing/summary", { signal }),
        ]);
        if (!metricsRes.ok) throw new Error("Failed to load dashboard metrics");
        if (!callsRes.ok) throw new Error("Failed to load call history");

        const metrics: DashboardMetrics = await metricsRes.json();
        const calls: CallsResponse = await callsRes.json();
        if (cancelled) return;

        setMetrics(metrics);
        setTotalCalls(metrics.totalCalls);
        setMinutes(Math.round(metrics.minutesConsumed));
        setSpend(metrics.currentSpend);
        setAvgDuration(metrics.avgCallDuration);

        // Use server-provided 30-day trend (chronological: day 1 = 30 days ago, day 30 = today)
        if (metrics.trend && metrics.trend.length === 30) {
          setTrend(metrics.trend);
        } else {
          // Fallback: compute client-side from the last 20 calls if server trend missing
          const DAY_MS = 86_400_000;
          const now = Date.now();
          const buckets = new Array(30).fill(0);
          for (const c of calls.calls ?? []) {
            if (!c.timestamp) continue;
            const ageDays = Math.floor((now - new Date(c.timestamp).getTime()) / DAY_MS);
            if (ageDays >= 0 && ageDays < 30) buckets[29 - ageDays] += 1;
          }
          setTrend(buckets.map((calls, i) => ({ day: i + 1, calls })));
        }

        // Plan allocation (for threshold warnings) comes from the billing summary.
        if (summaryRes.ok) {
          const summary: { minutesAllocated: number | null } = await summaryRes.json();
          setMinutesAllocated(summary.minutesAllocated ?? null);
        }
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const usage = getUsageStatus(minutes, minutesAllocated ?? 0);
  const showUsageAlert = !isLoading && usage.status !== "safe";

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
          <p className="text-sm text-muted mt-1">Call performance and spend at a glance.</p>
        </div>

        {fetchError && (
          <div className="bg-danger/10 border border-danger/30 rounded-2xl px-4 py-3 text-sm text-danger">
            {fetchError}
          </div>
        )}

        {showUsageAlert && (
          <UsageAlertBanner status={usage.status} message={usage.message} />
        )}

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-[104px]" />
              <Skeleton className="h-[104px]" />
              <Skeleton className="h-[104px]" />
              <Skeleton className="h-[104px]" />
              <Skeleton className="h-[104px]" />
            </>
          ) : fetchError ? (
            <div className="col-span-full bg-surface border border-border rounded-2xl p-6 text-sm text-muted">
              Metrics unavailable.
            </div>
          ) : (
            <>
              {metrics && (metrics.revenueRecovered ?? 0) > 0 && (
                <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3 col-span-full sm:col-span-1 lg:col-span-1 ring-1 ring-accent/20">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted">Revenue Recovered</span>
                    <div className="relative group">
                      <button
                        aria-label="How is revenue recovered calculated?"
                        className="text-muted hover:text-foreground transition"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
                        </svg>
                      </button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-surface border border-border rounded-xl p-3 text-xs text-muted shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                        <p className="font-medium text-foreground mb-1">How this is calculated</p>
                        <p>Calls answered × avg. booking value × 60% conversion rate.</p>
                        <p className="mt-1">Avg. booking value: <span className="text-foreground font-medium">${metrics.avgBookingValue ?? 210}</span></p>
                        <p className="mt-1 text-accent">Adjust in Settings → Business Profile</p>
                      </div>
                    </div>
                  </div>
                  <span className="text-3xl font-semibold text-accent tabular-nums tracking-tight">
                    ${(metrics.revenueRecovered ?? 0).toLocaleString("en-US")}
                  </span>
                  <span className="text-sm text-muted">
                    incl. {metrics.afterHoursCalls ?? 0} after-hours calls captured
                  </span>
                </div>
              )}
              <MetricCard label="Total Calls" value={totalCalls} icon={PhoneCall} />
              <MetricCard label="Minutes Consumed" value={minutes} icon={Clock} />
              <MetricCard label="Current Spend" value={spend} icon={DollarSign} />
              <MetricCard label="Avg Call Duration" value={formatDuration(avgDuration)} icon={Timer} />
            </>
          )}
        </div>

        {/* Usage trend chart (Tremor AreaChart spec, §2.3 / §4.4) */}
        <section className="bg-surface border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">
            Call Volume — Last 30 Days
          </h2>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : totalCalls === 0 ? (
            <EmptyCallVolume />
          ) : (
            <UsageTrendChart data={trend} />
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}