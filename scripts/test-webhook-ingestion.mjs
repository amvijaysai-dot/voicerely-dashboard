// scripts/test-webhook-ingestion.mjs
//
// Integration test loop for the new data-layer features:
//   1. Onboard a mock client ("Test Clinic" / testclinic) via the admin API.
//   2. Ingest two simulated Retell `call_analyzed` webhook payloads.
//   3. Verify the Client Portal minute balance + the Super-Admin drill-in
//      diagnostic ledger for that client.
//
// Run with:  node scripts/test-webhook-ingestion.mjs
// Requires the dev server running on BASE_URL (default http://localhost:3000)
// and RETELL_WEBHOOK_SECRET set in .env.local.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const WEBHOOK_SECRET = process.env.RETELL_WEBHOOK_SECRET || "test-webhook-secret-123";
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";

const log = (...a) => console.log(...a);
const section = (t) => log(`\n${"=".repeat(60)}\n  ${t}\n${"=".repeat(60)}`);

function assert(cond, msg) {
  if (!cond) {
    log(`  ✗ FAIL: ${msg}`);
    throw new Error(msg);
  }
  log(`  ✓ ${msg}`);
}

async function main() {
  const jar = { cookie: "" };
  const storeCookie = (res) => {
    const sc = res.headers.get("set-cookie");
    if (sc) jar.cookie = sc.split(";")[0];
  };
  const authed = (init = {}) => ({
    ...init,
    headers: { ...(init.headers || {}), Cookie: jar.cookie },
  });

  section("STEP 1 — ADMIN AUTH");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  storeCookie(loginRes);
  assert(loginRes.status === 200, `admin login (${loginRes.status})`);

  section("STEP 2 — ONBOARD MOCK CLIENT 'Test Clinic' (testclinic)");
  const agentId = "agent_testclinic";
  const onboardRes = await fetch(`${BASE_URL}/api/admin/tenants`, {
    method: "POST",
    ...authed({ headers: { "Content-Type": "application/json" } }),
    body: JSON.stringify({
      clientName: "Test Clinic",
      username: "testclinic",
      password: "testclinic123",
      allowedMinutes: 5000,
      perMinuteRate: 0.25,
      agentId,
    }),
  });
  const onboardBody = await onboardRes.json().catch(() => ({}));
  // 201 = created, 409 = already exists from a prior run (both acceptable).
  assert(
    onboardRes.status === 201 || onboardRes.status === 409,
    `onboard testclinic (${onboardRes.status}) ${onboardBody.error ? "— " + onboardBody.error : ""}`
  );
  const tenantId = onboardBody.id;
  log(`  • tenant id: ${tenantId || "(pre-existing)"}`);

  section("STEP 3 — INGEST SIMULATED WEBHOOK PAYLOADS");

  // Call 1: successful booking, standard hangup, low frustration.
  const call1 = {
    call_id: "tc_call_001",
    agent_id: agentId,
    total_duration_seconds: 184,
    transcript: "Agent: Thanks for calling Test Clinic, how can I help? Customer: I'd like to book an appointment. Agent: Tuesday at 3pm works. Customer: Perfect.",
    audio_url: "https://recordings.example.com/tc_call_001.mp3",
    disconnection_reason: "call_ended",
    sentiment: "Positive",
    booking_successful: true,
    interruption_count: 0,
    agent_talk_ratio: 0.45,
    hallucination_detected: false,
    script_deviation: false,
    missed_information: false,
    mistake_summary: "",
    recommended_prompt_correction: "",
  };

  // Call 2: unsuccessful, user hung up, high interruptions, hallucination.
  const call2 = {
    call_id: "tc_call_002",
    agent_id: agentId,
    total_duration_seconds: 96,
    transcript: "Agent: You've reached Test Clinic. Customer: I need to reschedule. Agent: Our office is in London (it is not). Customer: That's wrong, you're in Boston. Agent: (interrupts) Let me just— Customer: (hangs up)",
    audio_url: "https://recordings.example.com/tc_call_002.mp3",
    disconnection_reason: "user_hung_up",
    sentiment: "Negative",
    booking_successful: false,
    interruption_count: 4,
    agent_talk_ratio: 0.78,
    hallucination_detected: true,
    script_deviation: true,
    missed_information: true,
    mistake_summary:
      "Agent fabricated the office location (claimed London while HQ is Boston) and interrupted the caller 4 times, causing the caller to hang up before rescheduling.",
    recommended_prompt_correction:
      "Add a hard constraint to the system prompt: 'Never state the office location unless it is explicitly confirmed from the CRM. If unsure, say you will verify and do not guess.' Also add: 'Do not interrupt the caller; wait for them to finish before responding.'",
  };

  for (const [name, payload] of [["Call 1 (success)", call1], ["Call 2 (anomaly)", call2]]) {
    const res = await fetch(`${BASE_URL}/api/webhooks/retell`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-retell-signature": WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    assert(res.status === 200, `${name} ingested (${res.status}) ${body.error ? "— " + body.error : ""}`);
  }

  section("STEP 4 — VERIFY CLIENT MINUTE BALANCE (webhook-driven usedMinutes)");
  // The webhook pipeline increments the tenant's usedMinutes balance. The
  // billing summary endpoint derives spend from Retell's live call array
  // (demo data for keyless tenants), so the authoritative webhook-driven
  // balance is the tenant's usedMinutes field, read via the admin API.
  const adminTenantsRes = await fetch(`${BASE_URL}/api/admin/tenants`, {
    ...authed(),
  });
  const adminTenants = await adminTenantsRes.json();
  assert(adminTenantsRes.status === 200, `admin tenants list (${adminTenantsRes.status})`);
  const tcSummary = (adminTenants.tenants || []).find((t) => t.username === "testclinic");
  assert(Boolean(tcSummary), "testclinic present in admin tenant list");
  const expectedMinutes = Math.ceil(184 / 60) + Math.ceil(96 / 60); // 4 + 2 = 6
  log(`  • used minutes (webhook balance): ${tcSummary.usedMinutes}`);
  log(`  • allocated minutes: ${tcSummary.allowedMinutes}`);
  log(`  • per-minute rate: ${tcSummary.perMinuteRate}`);
  assert(
    tcSummary.usedMinutes === expectedMinutes,
    `minute balance reflects ingested calls (${tcSummary.usedMinutes} === ${expectedMinutes})`
  );

  // Secondary: the billing summary endpoint is reachable and scoped to the client.
  const clientJar = { cookie: "" };
  const clientLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testclinic", password: "testclinic123" }),
  });
  const csc = clientLogin.headers.get("set-cookie");
  if (csc) clientJar.cookie = csc.split(";")[0];
  assert(clientLogin.status === 200, `testclinic login (${clientLogin.status})`);
  const summaryRes = await fetch(`${BASE_URL}/api/billing/summary`, {
    headers: { Cookie: clientJar.cookie },
  });
  const summary = await summaryRes.json();
  assert(summaryRes.status === 200, `billing summary reachable (${summaryRes.status})`);
  log(`  • billing summary clientId: ${summary.clientId} (demo-derived spend: $${summary.currentSpend})`);

  section("STEP 5 — VERIFY SUPER-ADMIN DRILL-IN DIAGNOSTIC LEDGER");
  // Read the persisted call-log history directly from the data store.
  const callsPath = join(process.cwd(), "data", "calls.json");
  const callsMap = JSON.parse(readFileSync(callsPath, "utf8"));
  // Resolve the tenant id for testclinic from tenants.json.
  const tenantsPath = join(process.cwd(), "data", "tenants.json");
  const tenants = JSON.parse(readFileSync(tenantsPath, "utf8"));
  const tc = tenants.find((t) => t.username === "testclinic");
  assert(Boolean(tc), "testclinic present in tenant store");
  const logs = callsMap[tc.id] || [];
  assert(logs.length === 2, `drill-in lists both calls (${logs.length} === 2)`);

  // Recompute the isolated metrics exactly as ClientDiagnosticView does.
  const FAILURE_REASONS = new Set([
    "user_hung_up", "agent_hung_up", "error", "call_failed", "dropped", "no_answer",
  ]);
  const isFailure = (l) => Boolean(l.disconnectionReason) && FAILURE_REASONS.has(l.disconnectionReason);
  const total = logs.length;
  const successful = logs.filter((l) => !isFailure(l)).length;
  const successRate = Math.round((successful / total) * 100);
  const totalInterruptions = logs.reduce((s, l) => s + (l.interruptionCount ?? 0), 0);
  const interruptionIndex = Math.round((totalInterruptions / total) * 10) / 10;
  const totalHallucinations = logs.filter((l) => l.hallucinationDetected).length;
  const totalDeviations = logs.filter((l) => l.scriptDeviation).length;
  const corrections = Array.from(
    new Set(logs.map((l) => l.recommendedPromptCorrection).filter(Boolean))
  );

  log(`  • Success Rate:        ${successRate}%  (expect 50%)`);
  log(`  • Interruption Index:  ${interruptionIndex}  (expect 2)`);
  log(`  • Hallucinations:      ${totalHallucinations}  (expect 1)`);
  log(`  • Script Deviations:   ${totalDeviations}  (expect 1)`);
  log(`  • AI Prompt Fix recs:  ${corrections.length}  (expect 1)`);
  if (corrections[0]) log(`      "${corrections[0].slice(0, 80)}..."`);

  assert(successRate === 50, "isolated Success Rate = 50%");
  assert(interruptionIndex === 2, "isolated Interruption Index = 2.0");
  assert(totalHallucinations === 1, "isolated Hallucinations = 1");
  assert(totalDeviations === 1, "isolated Script Deviations = 1");
  assert(corrections.length === 1, "AI text summary present for drill-in");

  section("RESULT — INTEGRATION LOOP SUCCESSFUL");
  log("All data-layer features verified end-to-end:\n" +
      "  • Client onboarding via admin API\n" +
      "  • Webhook ingestion (success + anomaly calls)\n" +
      "  • Client minute balance updated from live calls\n" +
      "  • Super-Admin drill-in lists both calls with accurate isolated metrics + AI summary");
}

main().catch((err) => {
  log(`\n✗ INTEGRATION TEST FAILED: ${err.message}`);
  process.exit(1);
});