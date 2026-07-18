// scripts/backfill-billing-cycle.mjs
//
// One-off backfill for the JSON (dev) driver: establishes the billing-cycle
// window for every tenant from their signup anniversary (day-of-month of
// createdAt) and resets the in-cycle usedMinutes to 0 for the new cycle.
//
// Mirrors lib/billing/cycle.ts currentCycle(). Run: node scripts/backfill-billing-cycle.mjs
import fs from "node:fs";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "data", "tenants.json");

function currentCycle(anchorDay, now) {
  const day = Math.min(anchorDay, 28);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let start = Date.UTC(y, m, day);
  if (start > now.getTime()) start = Date.UTC(y, m - 1, day);
  const end = Date.UTC(y, m + 1, day);
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}

const tenants = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const now = new Date();

let changed = 0;
for (const t of tenants) {
  if (t.isAdmin) continue;
  const anchor = new Date(t.createdAt).getUTCDate() || 1;
  const cyc = currentCycle(anchor, now);
  t.billingCycleStart = cyc.start;
  t.billingCycleEnd = cyc.end;
  t.usedMinutes = 0;
  // Drop any stale one-time setup token from earlier local testing.
  delete t.passwordSetupTokenHash;
  delete t.passwordSetupExpiresAt;
  changed++;
  console.log(`  ${t.username}: cycle ${cyc.start.slice(0, 10)} -> ${cyc.end.slice(0, 10)}, usedMinutes=0`);
}

fs.writeFileSync(DATA_FILE, JSON.stringify(tenants, null, 2) + "\n");
console.log(`Backfill complete: ${changed} tenant(s) updated.`);
