// scripts/backfill-billing-cycle-pg.mjs
//
// Postgres backfill for the billing-cycle columns. Mirrors the JSON
// backfill (scripts/backfill-billing-cycle.mjs) and lib/billing/cycle.ts
// currentCycle(): each tenant's cycle resets on the day-of-month of
// their signup (createdAt), and the in-cycle usedMinutes is reset
// to 0 for the new current cycle. Historical CallLog rows are
// preserved.
//
// Requires DATABASE_URL to point at the live Postgres. Run AFTER the
// ADD_billing_cycle.sql migration has been applied:
//   node scripts/backfill-billing-cycle-pg.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function currentCycle(anchorDay, now) {
  const day = Math.min(anchorDay, 28);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let start = Date.UTC(y, m, day);
  if (start > now.getTime()) start = Date.UTC(y, m - 1, day);
  const end = Date.UTC(y, m + 1, day);
  return { start: new Date(start), end: new Date(end) };
}

async function main() {
  const now = new Date();
  const tenants = await prisma.tenant.findMany({
    where: { isAdmin: false },
    select: { id: true, createdAt: true, billingCycleStart: true, billingCycleEnd: true },
  });

  let updated = 0;
  for (const t of tenants) {
    const anchor = t.createdAt.getUTCDate() || 1;
    const cyc = currentCycle(anchor, now);
    await prisma.tenant.update({
      where: { id: t.id },
      data: {
        billingCycleStart: cyc.start,
        billingCycleEnd: cyc.end,
        usedMinutes: 0,
      },
    });
    updated++;
    console.log(`  ${t.id}: cycle ${cyc.start.toISOString().slice(0, 10)} -> ${cyc.end.toISOString().slice(0, 10)}, usedMinutes=0`);
  }
  console.log(`Postgres backfill complete: ${updated} tenant(s) updated.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
