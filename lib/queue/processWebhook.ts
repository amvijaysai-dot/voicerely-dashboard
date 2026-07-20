// lib/queue/processWebhook.ts
//
// The asynchronous webhook processing pipeline — implemented as PURE, staged
// functions so they can be run by the BullMQ Worker (webhookWorker.ts) AND by
// the inline fallback in the API route when Redis is unavailable.
//
// Pipeline stages (each logged with progress + the job/request id):
//   1. attribute   — resolve the tenant that owns the Retell agent_id.
//   2. persist     — append an immutable, insert-only CallLog to the ledger.
//   3. billing     — roll consumed minutes into the tenant's used-minute balance
//                    (only when the log was newly inserted → no double counting).
//   4. analytics   — recompute the agent-health model for the tenant's agent.
//   5. notify      — send a notification on anomalies / threshold breaches.
//
// Idempotency is guaranteed at two layers:
//   - The queue uses a deterministic job id (callId) so duplicates are de-duped.
//   - `appendCallLog` is insert-only (returns { inserted: false } on replay),
//     so even a replayed job cannot double-count minutes.

import { getTenantByAgentId, invalidateTenant } from "@/lib/tenantService";
import { appendCallLog, incrementUsedMinutes } from "@/lib/repositories/tenantRepository";
import { buildAgentHealthReport } from "@/lib/analytics/agentHealth";
import { sendWebhookNotification } from "@/lib/notifications/webhookNotifications";
import { newRequestId, audit } from "@/lib/security/logger";
import type { CallLog } from "@/lib/db";
import type { RetellCallRecord } from "@/lib/retell/types";

/** The unit of work carried on the queue (and the inline fallback). */
export interface WebhookJobPayload {
  /** Stable id used for idempotent job dedup (== callId). */
  callId: string;
  agentId: string;
  /** The normalized Retell call record (already mapped from the raw payload). */
  call: RetellCallRecord;
  /** Original Retell event name (call_analyzed / call_ended / ...). */
  event: string;
  /** Correlation id from the HTTP request (for end-to-end tracing). */
  requestId?: string;
}

export interface WebhookProcessResult {
  ok: boolean;
  tenantId?: string;
  inserted: boolean;
  stage: "attribute" | "persist" | "billing" | "analytics" | "notify" | "done";
  error?: string;
}

/** Stage 1 — attribute the call to a tenant via the agent_id mapping. */
async function attribute(
  agentId: string,
  requestId: string
): Promise<{ tenantId: string } | { error: string }> {
  const tenant = await getTenantByAgentId(agentId);
  if (!tenant) {
    audit(requestId, "webhook.job_unknown_agent", {
      success: false,
      error: "no_tenant_for_agent",
      meta: { agentId },
    });
    return { error: "no_tenant_for_agent" };
  }
  return { tenantId: tenant.id };
}

/** Stage 2 — persist an immutable, insert-only call log. */
async function persist(
  tenantId: string,
  log: CallLog,
  requestId: string
): Promise<{ inserted: boolean }> {
  const { inserted } = await appendCallLog(log, tenantId);
  audit(requestId, "webhook.job_persisted", {
    success: true,
    tenantId,
    meta: { callId: log.callId, inserted },
  });
  return { inserted };
}

/** Stage 3 — roll consumed minutes into the tenant's used-minute balance. */
async function billing(
  tenantId: string,
  minutes: number,
  inserted: boolean,
  requestId: string
): Promise<void> {
  if (!inserted) {
    audit(requestId, "webhook.job_billing_skipped", {
      success: true,
      tenantId,
      meta: { reason: "duplicate_log" },
    });
    return;
  }
  await incrementUsedMinutes(tenantId, minutes, tenantId);
  invalidateTenant(tenantId);
  audit(requestId, "webhook.job_billing_rolled", {
    success: true,
    tenantId,
    meta: { minutes },
  });
}

/** Stage 4 — recompute the agent-health analytics model. */
async function analytics(
  tenantId: string,
  agentId: string,
  requestId: string
): Promise<void> {
  try {
    // Pull the tenant's recent calls to refresh the health model. The Retell
    // client transparently serves demo data when no key is configured, so this
    // works in every environment without branching.
    const { listCalls, getClientConfig } = await import("@/lib/retell/client");
    const tenant = await getTenantByAgentId(agentId);
    if (!tenant) return;
    const config = await getClientConfig(tenant);
    const raw = await listCalls(tenant, { limit: 200 });
    const report = buildAgentHealthReport(raw, {
      agentId,
      agentName: config.displayName,
    });
    audit(requestId, "webhook.job_analytics_recomputed", {
      success: true,
      tenantId,
      meta: { score: report.health.score, tier: report.health.tier },
    });
  } catch (err) {
    // Analytics is best-effort: never fail the whole job because of it.
    audit(requestId, "webhook.job_analytics_error", {
      success: false,
      tenantId,
      error: err instanceof Error ? err.message : "analytics_failed",
      level: "error",
    });
  }
}

/** Stage 5 — notify on anomalies / threshold breaches. */
async function notify(
  tenantId: string,
  log: CallLog,
  requestId: string
): Promise<void> {
  try {
    await sendWebhookNotification({ tenantId, log, requestId });
  } catch (err) {
    audit(requestId, "webhook.job_notify_error", {
      success: false,
      tenantId,
      error: err instanceof Error ? err.message : "notify_failed",
      level: "error",
    });
  }
}

/**
 * Runs the full staged pipeline for one webhook event. Throws on unrecoverable
 * errors (so BullMQ retries with backoff); swallows only best-effort stages.
 */
export async function processWebhook(
  payload: WebhookJobPayload
): Promise<WebhookProcessResult> {
  const requestId = payload.requestId ?? newRequestId();
  const { callId, agentId, call, event } = payload;

  audit(requestId, "webhook.job_start", {
    success: true,
    meta: { callId, agentId, event, stage: "attribute" },
  });

  // Stage 1: attribute
  const attr = await attribute(agentId, requestId);
  if ("error" in attr) {
    // Unknown agent → not retryable; surface as a terminal (DLQ) failure.
    throw new WebhookTerminalError(attr.error, "attribute");
  }
  const tenantId = attr.tenantId;

  // Build the normalized CallLog from the already-mapped Retell record.
  const durationSeconds = call.duration_seconds ?? 0;
  const log: CallLog = {
    callId,
    tenantId,
    agentId,
    totalDurationSeconds: durationSeconds,
    transcript: call.transcript ?? "",
    audioUrl: call.recording_url ?? "",
    disconnectionReason: call.disconnection_reason ?? null,
    sentiment: call.call_analysis?.user_sentiment ?? undefined,
    createdAt:
      typeof call.start_timestamp === "number"
        ? new Date(call.start_timestamp).toISOString()
        : new Date().toISOString(),
  };

  // Stage 2: persist (insert-only)
  const { inserted } = await persist(tenantId, log, requestId);

  // Stage 3: billing (only on first insert)
  await billing(tenantId, durationSeconds / 60, inserted, requestId);

  // Stage 4: analytics (best-effort)
  await analytics(tenantId, agentId, requestId);

  // Stage 5: notify (best-effort)
  await notify(tenantId, log, requestId);

  audit(requestId, "webhook.job_done", {
    success: true,
    tenantId,
    meta: { callId, inserted },
  });

  return { ok: true, tenantId, inserted, stage: "done" };
}

/**
 * Error type that signals a non-retryable (terminal) failure. The worker moves
 * these straight to the Dead Letter Queue instead of retrying.
 */
export class WebhookTerminalError extends Error {
  constructor(
    message: string,
    public readonly stage: WebhookProcessResult["stage"]
  ) {
    super(message);
    this.name = "WebhookTerminalError";
  }
}