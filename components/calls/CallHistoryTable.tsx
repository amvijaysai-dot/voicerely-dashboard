// components/calls/CallHistoryTable.tsx
//
// Scannable call-history table for the client Metrics view. Columns: Date &
// Time, From Number, Duration, Sentiment, and a "View Transcript" action.
// Supports a polished loading-skeleton state and an empty state.

import { FileSearch } from "lucide-react";
import { SentimentBadge, type Sentiment } from "@/components/calls/SentimentBadge";

export interface CallHistoryRow {
  id: string;
  timestamp: string; // ISO
  fromNumber: string; // already formatted/masked
  durationFormatted: string; // e.g. "2m 14s"
  sentiment: Sentiment;
}

interface CallHistoryTableProps {
  rows: CallHistoryRow[];
  loading?: boolean;
  onViewTranscript: (row: CallHistoryRow) => void;
}

function formatTimestamp(iso: string): string {
  // Fixed locale + timeZone so server and client render identically (no
  // hydration mismatch from locale-dependent formatting).
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-6 py-4"><div className="h-4 w-28 animate-pulse rounded bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-4 w-24 animate-pulse rounded bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-4 w-16 animate-pulse rounded bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-5 w-20 animate-pulse rounded-full bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-8 w-28 animate-pulse rounded-lg bg-surface-hover ml-auto" /></td>
    </tr>
  );
}

export function CallHistoryTable({ rows, loading, onViewTranscript }: CallHistoryTableProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Desktop/tablet table */}
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            <th className="px-6 py-3 font-medium">Date & Time</th>
            <th className="px-6 py-3 font-medium">From Number</th>
            <th className="px-6 py-3 font-medium">Duration</th>
            <th className="px-6 py-3 font-medium">Sentiment</th>
            <th className="px-6 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center">
                    <FileSearch className="w-5 h-5 text-muted" />
                  </div>
                  <div className="text-foreground font-medium">No call history found for this billing cycle.</div>
                  <p className="text-sm text-muted max-w-xs">
                    Go to the Agents tab to test your assistant live.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
              >
                <td className="px-6 py-4 text-muted tabular-nums whitespace-nowrap">
                  {formatTimestamp(row.timestamp)}
                </td>
                <td className="px-6 py-4 text-foreground tabular-nums">{row.fromNumber}</td>
                <td className="px-6 py-4 text-foreground tabular-nums">{row.durationFormatted}</td>
                <td className="px-6 py-4">
                  <SentimentBadge sentiment={row.sentiment} />
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onViewTranscript(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onViewTranscript(row);
                      }
                    }}
                    className="text-sm font-medium text-accent hover:text-accent-alt transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-inset rounded"
                    aria-label={`View transcript for call at ${formatTimestamp(row.timestamp)}`}
                  >
                    View Transcript
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Mobile card list */}
      <ul className="sm:hidden divide-y divide-border">
        {loading ? (
          <>
            <li className="px-4 py-4"><div className="h-12 animate-pulse rounded-lg bg-surface-hover" /></li>
            <li className="px-4 py-4"><div className="h-12 animate-pulse rounded-lg bg-surface-hover" /></li>
            <li className="px-4 py-4"><div className="h-12 animate-pulse rounded-lg bg-surface-hover" /></li>
          </>
        ) : rows.length === 0 ? (
          <li className="px-6 py-16 text-center">
            <div className="text-foreground font-medium">No call history found for this billing cycle.</div>
            <p className="text-sm text-muted mt-1">Go to the Agents tab to test your assistant live.</p>
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium truncate">{row.fromNumber}</p>
                <p className="text-xs text-muted tabular-nums">{formatTimestamp(row.timestamp)} · {row.durationFormatted}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SentimentBadge sentiment={row.sentiment} />
                <button
                  onClick={() => onViewTranscript(row)}
                  className="text-xs font-medium text-accent hover:text-accent-alt transition-colors"
                >
                  View
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
