// app/(admin)/admin/page.tsx
//
// Super-Admin Portal. Server component loads the tenant list from the
// repository factory layer and builds the Agent Health analytics report from
// the live call-log history (ingested via the webhook pipeline). The client
// AdminPortal handles the live list rendering + onboarding form.

import { listClientTenants, listCallLogs } from "@/lib/repositories/tenantRepository";
import type { CallLog } from "@/lib/db";
import type { RetellCallRecord } from "@/lib/retell/types";
import { buildAgentHealthReport, type AgentHealthReport } from "@/lib/analytics/agentHealth";
import AdminPortal from "../AdminPortal";

export const dynamic = "force-dynamic";

/** Maps a stored CallLog (live ingested record) into the Retell shape the
 *  analytics module consumes. call_successful is derived from the absence of
 *  a disconnection reason; sentiment is carried through verbatim. */
function callLogToRetellRecord(log: CallLog): RetellCallRecord {
  const failed = Boolean(log.disconnectionReason);
  return {
    call_id: log.callId,
    agent_id: log.agentId,
    call_status: failed ? "error" : "ended",
    disconnection_reason: log.disconnectionReason ?? undefined,
    start_timestamp: new Date(log.createdAt).getTime(),
    end_timestamp: new Date(log.createdAt).getTime() + log.totalDurationSeconds * 1000,
    duration_seconds: log.totalDurationSeconds,
    transcript: log.transcript,
    call_analysis: {
      call_successful: !failed,
      user_sentiment: (log.sentiment as "Positive" | "Neutral" | "Negative" | undefined) ?? undefined,
    },
  };
}

export default async function AdminPage() {
  // 1. ADMIN DATA LAYER — read active client records from the repository factory.
  const tenants = (await listClientTenants()).map((t) => ({
    id: t.id,
    clientName: t.clientName,
    username: t.username,
    allowedMinutes: t.allowedMinutes,
    usedMinutes: t.usedMinutes,
    perMinuteRate: t.perMinuteRate,
    status: t.status,
    hasRetellKey: Boolean(t.retellApiKey),
    agentId: t.agentIds?.[0] ?? "",
  }));

  // 2. SYSTEM ANALYSIS PIPELINE — read live call-log history for the primary
  //    tenant and aggregate health indicators from the backend arrays.
  const primaryTenant = tenants[0];
  const logs: CallLog[] = primaryTenant ? await listCallLogs(primaryTenant.id) : [];
  const records: RetellCallRecord[] = logs.map(callLogToRetellRecord);
  const healthReport: AgentHealthReport = buildAgentHealthReport(records, {
    agentId: primaryTenant?.agentId || "agent_demo",
    agentName: primaryTenant?.clientName ?? "Primary Agent",
    isDemo: false,
  });

  // 3. CLIENT DIAGNOSTIC LEDGER — load each tenant's full call-log history so
  //    the admin can drill into a single client's anomaly markers.
  const callLogsByTenant: Record<string, CallLog[]> = {};
  await Promise.all(
    tenants.map(async (t) => {
      callLogsByTenant[t.id] = await listCallLogs(t.id);
    })
  );

  return (
    <AdminPortal
      initialTenants={tenants}
      healthReport={healthReport}
      callLogsByTenant={callLogsByTenant}
    />
  );
}
