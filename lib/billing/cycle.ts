// lib/billing/cycle.ts
//
// Billing-cycle math, shared by the repository layer, the client-config
// builder, and the billing-summary route so every caller agrees on what
// "the current cycle" means.
//
// POLICY (per product decision): a tenant's cycle resets on the
// day-of-month of their signup anniversary (derived from `createdAt`).
// Example: signed up on the 14th -> every cycle runs 14th -> 13th.
// Months without that day (e.g. Feb 30) clamp to month-end.
//
// `billingCycleStart` / `billingCycleEnd` are persisted on the tenant row
// (see lib/db.ts Tenant + prisma/schema.prisma). When a read finds
// `billingCycleEnd` already in the past, the cycle is rolled forward
// (see rollCycleIfNeeded) and usedMinutes is reset for the new cycle —
// historical CallLog rows are preserved for reporting.

import type { Tenant } from "../db";

export interface BillingCycle {
  start: string; // ISO date (start of day)
  end: string; // ISO date (start of day AFTER the last day)
}

/** Anchor day-of-month (1-31) from a signup date. */
export function cycleAnchorDay(createdAt: string): number {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? 1 : d.getUTCDate();
}

/**
 * Computes the [start, end) window that contains `now`, anchored on
 * `anchorDay`. The window always starts on anchorDay and runs until the
 * day before anchorDay in the following month.
 */
export function currentCycle(anchorDay: number, now: Date = new Date()): BillingCycle {
  const day = Math.min(anchorDay, 28); // clamp; months < anchorDay clamp below
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  // First candidate start: anchorDay in the current UTC month.
  let start = Date.UTC(y, m, day);
  // If that start is still in the future relative to `now`, step back a month.
  if (start > now.getTime()) {
    start = Date.UTC(y, m - 1, day);
  }
  // End = anchorDay of the next month (exclusive).
  const end = Date.UTC(y, m + 1, day);
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}

/**
 * Rolls the persisted cycle forward if `cycleEnd` has passed, resetting the
 * in-cycle used-minute balance. Returns the (possibly advanced) tenant with
 * the new cycle + zeroed usedMinutes. Callers persist the returned tenant.
 *
 * Pure helper: it does NOT touch storage. The repository layer decides
 * how/where to persist.
 */
export function rollCycleIfNeeded(
  tenant: Tenant,
  now: Date = new Date()
): { tenant: Tenant; rolled: boolean } {
  const start = tenant.billingCycleStart;
  const end = tenant.billingCycleEnd;

  // No cycle established yet (legacy/migrated tenant): bootstrap from signup.
  if (!start || !end) {
    const cyc = currentCycle(cycleAnchorDay(tenant.createdAt), now);
    return {
      tenant: {
        ...tenant,
        billingCycleStart: cyc.start,
        billingCycleEnd: cyc.end,
        usedMinutes: 0,
      },
      rolled: true,
    };
  }

  if (now.getTime() < new Date(end).getTime()) {
    return { tenant, rolled: false };
  }

  // Advance one month at a time until the window covers `now`.
  let anchor = cycleAnchorDay(tenant.createdAt);
  let cyc = currentCycle(anchor, now);
  // Defensive: if end already >= now this branch is unreachable, but guard anyway.
  while (new Date(cyc.end).getTime() <= now.getTime()) {
    anchor = cycleAnchorDay(tenant.createdAt);
    cyc = currentCycle(anchor, new Date(new Date(cyc.end).getTime() + 1));
  }

  return {
    tenant: {
      ...tenant,
      billingCycleStart: cyc.start,
      billingCycleEnd: cyc.end,
      usedMinutes: 0,
    },
    rolled: true,
  };
}

/** True when a call timestamp falls inside [start, end). */
export function isInCycle(
  callTimestampIso: string,
  cycle: BillingCycle
): boolean {
  const t = new Date(callTimestampIso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(cycle.start).getTime() && t < new Date(cycle.end).getTime();
}
