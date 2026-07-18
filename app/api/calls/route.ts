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

    // Transform ALL records to client-visible shape first so search/filter
    // operates on the fields the user can actually see (agentName, customerNumber)
    // rather than internal Retell IDs.
    const allViews = rawCalls.map((c) => transformCallToClientView(c, config));

    // Apply search filter on client-visible fields.
    let filtered = allViews;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.agentName.toLowerCase().includes(q) ||
          c.customerNumber.toLowerCase().includes(q) ||
          c.callId.toLowerCase().includes(q)
      );
    }

    // Apply status filter.
    if (status) {
      const statusLower = status.toLowerCase();
      filtered = filtered.filter((c) =>
        statusLower === "completed" ? c.status === "Completed" : c.status === "Failed"
      );
    }

    // Sort by timestamp descending (newest first).
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Server-side pagination.
    const totalCalls = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCalls / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;
    const calls = filtered.slice(skip, skip + limit);

    return NextResponse.json({
      calls,
      pagination: { page: safePage, limit, totalCalls, totalPages },
    });
  } catch (err) {
    const { error, status } = safeError(err);
    return NextResponse.json({ error }, { status });
  }
}
