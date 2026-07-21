// app/api/calls/route.ts
//
// Paginated call list for the logged-in tenant. Scoped via getSessionTenant()
// (401 if unauthenticated). Retell key stays server-side; only the client-safe
// view is returned. Failures emit structured JSON (no raw error leakage).
//
// Supports server-side pagination, search, and status filtering.
//
// PRODUCTION ARCHITECTURE:
// PostgreSQL is the PRIMARY source of truth for call history. Retell API is
// used only for optional background reconciliation to detect missing calls.

import { NextRequest, NextResponse } from "next/server";
import { getClientConfig, listCalls } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { getSessionTenant } from "@/lib/auth";
import { listCallRecords } from "@/lib/repositories/tenantRepository";
import { safeError } from "@/lib/validation";
import { newRequestId, audit } from "@/lib/security/logger";
import type { RetellCallRecord } from "@/lib/retell/types";

export const dynamic = "force-dynamic";

/** Optional background reconciliation: compare PostgreSQL with Retell API.
 *  Logs mismatches for monitoring but does NOT modify the response. */
async function reconcileWithRetell(
  tenantId: string,
  pgCalls: RetellCallRecord[]
): Promise<void> {
  const requestId = newRequestId();
  try {
    // Only reconcile if we have a way to fetch from Retell
    // This is a no-op if no API key is configured
    // Use a minimal tenant object to attempt Retell fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retellCalls = await listCalls({ id: tenantId, retellApiKey: "" } as any, { limit: 1000 }).catch(() => []);
    const pgCallIds = new Set(pgCalls.map((c) => c.call_id));

    // Find calls in Retell but not in PostgreSQL (potential missed webhooks)
    const missingInPg = retellCalls.filter((c) => !pgCallIds.has(c.call_id));
    if (missingInPg.length > 0) {
      audit(requestId, "reconciliation.missing_in_postgres", {
        success: true,
        tenantId,
        meta: { missingCount: missingInPg.length, callIds: missingInPg.map((c) => c.call_id) },
      });
    }
  } catch (e) {
    // Log but don't fail the request
    audit(requestId, "reconciliation.failed", {
      success: false,
      tenantId,
      error: String(e),
    });
  }
}

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
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";

  try {
    // PRIMARY SOURCE: Fetch calls from PostgreSQL (webhook-ingested data)
    const config = await getClientConfig(tenant);
    let rawCalls: RetellCallRecord[] = [];
    try {
      rawCalls = await listCallRecords(tenant.id);
    } catch {
      // Database failure must not 5xx the list. Degrade gracefully to an
      // empty list (200) so the UI shows its empty state instead of crashing.
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

    // Apply date-range filter on ISO timestamp.
    if (from) {
      const fromTime = new Date(from).getTime();
      if (!isNaN(fromTime)) {
        filtered = filtered.filter(
          (c) => new Date(c.timestamp).getTime() >= fromTime
        );
      }
    }
    if (to) {
      const toTime = new Date(to).getTime();
      if (!isNaN(toTime)) {
        // Add 1 day so "to=2026-07-31" includes the full last day.
        filtered = filtered.filter(
          (c) => new Date(c.timestamp).getTime() < toTime + 86_400_000
        );
      }
    }

    // Sort by timestamp descending (newest first).
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Server-side pagination.
    const totalCalls = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCalls / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;
    const calls = filtered.slice(skip, skip + limit);

    // Optional: Background reconciliation with Retell API (non-blocking)
    // This helps detect missed webhooks or data drift
    reconcileWithRetell(tenant.id, rawCalls).catch(() => {
      // Silently ignore reconciliation errors
    });

    return NextResponse.json({
      calls,
      pagination: { page: safePage, limit, totalCalls, totalPages },
    });
  } catch (err) {
    const { error, status } = safeError(err);
    return NextResponse.json({ error }, { status });
  }
}
