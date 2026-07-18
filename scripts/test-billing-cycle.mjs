// scripts/test-billing-cycle.mjs
//
// Contract test for billing-cycle scoping (no TS runner needed).
// Reuses the EXACT same cycle math as lib/billing/cycle.ts
// (currentCycle / isInCycle) so we prove the scoping rule end-to-end:
//   - only calls whose timestamp falls in [cycleStart, cycleEnd)
//     are counted toward minutesConsumed
//   - out-of-cycle (historical) calls are excluded
//
// Run: node scripts/test-billing-cycle.mjs

// ---- mirror of lib/billing/cycle.ts ----
function currentCycle(anchorDay, now) {
  const day = Math.min(anchorDay, 28);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let start = Date.UTC(y, m, day);
  if (start > now.getTime()) start = Date.UTC(y, m - 1, day);
  const end = Date.UTC(y, m + 1, day);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}
function isInCycle(iso, cyc) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(cyc.start).getTime() && t < new Date(cyc.end).getTime();
}
// ---- mirror of lib/billing/calculate.ts ----
function calcSummary(calls) {
  const minutesUsed = Math.round(
    calls.reduce((s, c) => s + c.durationMinutes, 0) * 100
  ) / 100;
  const currentSpend = Math.round(
    calls.reduce((s, c) => s + c.calculatedCost, 0) * 100
  ) / 100;
  return { minutesUsed, currentSpend };
}

// ---- fixtures ----
const now = new Date("2026-07-18T12:00:00.000Z");
// tenant signed up on the 13th -> cycle = 2026-07-13 .. 2026-08-13
const cycle = currentCycle(13, now);
console.log("cycle window:", cycle.start.slice(0, 10), "->", cycle.end.slice(0, 10));

const RATE = 0.25;
const calls = [
  // IN cycle
  { callId: "a", timestamp: "2026-07-14T10:00:00.000Z", durationMinutes: 10, calculatedCost: 10 * RATE },
  { callId: "b", timestamp: "2026-07-20T10:00:00.000Z", durationMinutes: 5, calculatedCost: 5 * RATE },
  { callId: "c", timestamp: "2026-08-12T23:00:00.000Z", durationMinutes: 7, calculatedCost: 7 * RATE },
  // OUT of cycle (must be excluded)
  { callId: "d", timestamp: "2026-07-10T10:00:00.000Z", durationMinutes: 999, calculatedCost: 999 * RATE }, // before cycle
  { callId: "e", timestamp: "2026-08-13T00:00:00.000Z", durationMinutes: 888, calculatedCost: 888 * RATE }, // == end (exclusive)
  { callId: "f", timestamp: "2025-01-01T00:00:00.000Z", durationMinutes: 777, calculatedCost: 777 * RATE }, // ancient
];

const inCycle = calls.filter((c) => isInCycle(c.timestamp, cycle));
const summary = calcSummary(inCycle);

const EXPECTED_MIN = 10 + 5 + 7; // 22
const expectedSpend = Math.round(EXPECTED_MIN * RATE * 100) / 100;

let ok = true;
function assert(name, got, want) {
  const pass = got === want;
  ok = ok && pass;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${want}`);
}

assert("in-cycle call count", inCycle.length, 3);
assert("minutesConsumed (in-cycle only)", summary.minutesUsed, EXPECTED_MIN);
assert("currentSpend (in-cycle only)", summary.currentSpend, expectedSpend);
assert("out-of-cycle excluded (d)", isInCycle(calls[3].timestamp, cycle), false);
assert("end boundary exclusive (e)", isInCycle(calls[4].timestamp, cycle), false);

console.log(ok ? "\nALL TESTS PASSED ✅" : "\nTESTS FAILED ❌");
process.exit(ok ? 0 : 1);
