// app/(dashboard)/calls/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CallStatusBadge } from "@/components/calls/CallStatusBadge";
import { CallDetailDrawer } from "@/components/drawer/CallDetailDrawer";
import type { VoicerelyCallView } from "@/lib/transform";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

function formatTimestamp(iso: string): string {
  // Fixed locale + timeZone so server and client render identically
  // (avoids React hydration mismatch from locale-dependent formatting).
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
      <td className="px-6 py-4"><div className="h-4 w-24 animate-pulse rounded bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-4 w-20 animate-pulse rounded bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-4 w-16 animate-pulse rounded bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-4 w-12 animate-pulse rounded bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-4 w-16 animate-pulse rounded bg-surface-hover" /></td>
      <td className="px-6 py-4"><div className="h-4 w-12 animate-pulse rounded bg-surface-hover ml-auto" /></td>
    </tr>
  );
}

function SkeletonCard() {
  return (
    <li className="px-4 py-4"><div className="h-12 animate-pulse rounded-lg bg-surface-hover" /></li>
  );
}

interface PaginationData {
  page: number;
  limit: number;
  totalCalls: number;
  totalPages: number;
}

export default function CallsPage() {
  const [calls, setCalls] = useState<VoicerelyCallView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VoicerelyCallView | null>(null);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 20,
    totalCalls: 0,
    totalPages: 1,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // Date range preset helpers
  function setThisMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(now.toISOString().slice(0, 10));
    setPage(1);
  }

  function clearDateFilter() {
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  function setPage(page: number) {
    setPagination((prev) => ({ ...prev, page }));
  }

  // Fetch calls when pagination, search, or status changes
  const fetchCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await fetch(`/api/calls?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load calls");
      const data = await res.json();
      setCalls(data.calls ?? []);
      setPagination((prev) => ({
        ...prev,
        page: data.pagination.page,
        limit: data.pagination.limit,
        totalCalls: data.pagination.totalCalls,
        totalPages: data.pagination.totalPages,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, debouncedSearch, statusFilter, fromDate, toDate]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Reset to page 1 when search, status, or dates change
  useEffect(() => {
    if (pagination.page !== 1) {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [debouncedSearch, statusFilter, fromDate, toDate]);

  // Also reset page when dates change directly (via onChange handlers)
  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
    }
  };

  const handleLimitChange = (newLimit: number) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Live Agent Logs</h1>
        <p className="text-sm text-muted mt-1">Recent call history.</p>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search calls…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-xl bg-surface text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 text-sm border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
        >
          <option value="">All Statuses</option>
          <option value="Completed">Completed</option>
          <option value="Failed">Failed</option>
        </select>

        {/* Date range filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="bg-background-alt border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition"
            aria-label="Filter from date"
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="bg-background-alt border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition"
            aria-label="Filter to date"
          />
          <button
            type="button"
            onClick={setThisMonth}
            className="text-xs text-accent hover:underline whitespace-nowrap px-2 py-2"
          >
            This month
          </button>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={clearDateFilter}
              className="text-xs text-muted hover:text-foreground whitespace-nowrap px-2 py-2"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {/* Desktop/tablet table */}
        <table className="hidden w-full text-sm sm:table">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="px-6 py-3 font-medium">Timestamp</th>
              <th className="px-6 py-3 font-medium">Agent</th>
              <th className="px-6 py-3 font-medium">Customer Number</th>
              <th className="px-6 py-3 font-medium">Duration</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Client Cost</th>
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
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-sm text-danger text-center">
                  {error}
                </td>
              </tr>
            ) : calls.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-sm text-muted text-center">
                  No calls found.
                </td>
              </tr>
            ) : (
              calls.map((call) => (
                <tr
                  key={call.callId}
                  onClick={() => setSelected(call)}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <td className="px-6 py-4 text-muted tabular-nums">
                    {formatTimestamp(call.timestamp)}
                  </td>
                  <td className="px-6 py-4 text-foreground">{call.agentName}</td>
                  <td className="px-6 py-4 text-muted tabular-nums">{call.customerNumber}</td>
                  <td className="px-6 py-4 text-foreground tabular-nums">{call.durationFormatted}</td>
                  <td className="px-6 py-4">
                    <CallStatusBadge status={call.status} />
                  </td>
                  <td className="px-6 py-4 text-right text-foreground tabular-nums">
                    ${call.calculatedCost.toFixed(2)}
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
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : error ? (
            <li className="px-6 py-10 text-sm text-danger text-center">{error}</li>
          ) : calls.length === 0 ? (
            <li className="px-6 py-10 text-sm text-muted text-center">No calls found.</li>
          ) : (
            calls.map((call) => (
              <li
                key={call.callId}
                onClick={() => setSelected(call)}
                className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-hover transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">{call.agentName}</p>
                  <p className="text-xs text-muted tabular-nums">{formatTimestamp(call.timestamp)} · {call.durationFormatted}</p>
                  <p className="text-xs text-muted tabular-nums">{call.customerNumber}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <CallStatusBadge status={call.status} />
                  <span className="text-foreground text-sm tabular-nums">${call.calculatedCost.toFixed(2)}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="text-sm text-muted">
          Page {pagination.page} of {pagination.totalPages} · {pagination.totalCalls} total calls
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pagination.limit}
            onChange={(e) => handleLimitChange(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          >
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
          </select>
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-foreground hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-foreground hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <CallDetailDrawer call={selected} onClose={() => setSelected(null)} />
    </div>
  );
}