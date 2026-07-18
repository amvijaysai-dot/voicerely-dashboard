// app/api/calls/route.ts
//
// Paginated call list for the logged-in tenant. Scoped via getSessionTenant()
// (401 if unauthenticated). Retell key stays server-side; only the client-safe
// view is returned. Failures emit structured JSON (no raw error leakage).
//
// Supports server-side pagination, search, and status filtering.

import { NextRequest, NextResponse } from "next/server";
import { getClientConfig, listCalls } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { getSessionTenant } from "@/lib/auth";
import { safeError } from "@/lib/validation";
import type { RetellCallRecord } from "@/lib/retell/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse pagination & filter params
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "20")));
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const status = req.nextUrl.searchParams.get("status") ?? "";

  try {
    // Unified pipeline: pull the tenant's active call list through the same
    // listCalls wrapper the metrics route uses (Retell live, or demo synthetic
    // when no real key is configured). This keeps the call history, trend chart,
    // and KPI cards on a single source of truth instead of the stale local
    // calls.json ledger.
    const config = await getClientConfig(tenant);
    let rawCalls: Awaited<ReturnType<typeof listCalls>> = [];
    try {
      rawCalls = await listCalls(tenant, { limit: 1000 });
    } catch {
      // Invalid/placeholder Retell key or network failure must not 5xx the
      // list. Degrade gracefully to an empty list (200) so the UI shows its
      // empty state instead of crashing.
      rawCalls = [];
    }

    // Apply search filter (case-insensitive on agent ID, call ID)
    let filtered = rawCalls;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          (c.agent_id ?? "").toLowerCase().includes(q) ||
          (c.call_id ?? "").toLowerCase().includes(q)
      );
    }

    // Apply status filter (map "Completed"/"Failed" to Retell call_status)
    if (status) {
      const statusLower = status.toLowerCase();
      filtered = filtered.filter((c) => {
        const isCompleted = c.call_status !== "error";
        return statusLower === "completed" ? isCompleted : !isCompleted;
      });
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.start_timestamp - a.start_timestamp);

    // Pagination
    const totalCalls = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCalls / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;
    const paginatedLogs = filtered.slice(skip, skip + limit);

    // Transform to client view
    const calls = paginatedLogs.map((c) => transformCallToClientView(c, config));

    return NextResponse.json({
      calls,
      pagination: {
        page: safePage,
        limit,
        totalCalls,
        totalPages,
      },
    });
  } catch (err) {
    const { error, status } = safeError(err);
    return NextResponse.json({ error }, { status });
  }
}
