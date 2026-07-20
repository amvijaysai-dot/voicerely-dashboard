// lib/notifications/webhookNotifications.ts
//
// The final stage of the webhook pipeline: notifications. Triggered after a call
// is persisted + billed. Sends alerts on anomalies / threshold breaches using
// the existing SMTP transport (lib/email.ts). Best-effort: a mail failure must
// never fail the webhook job.
//
// Notification triggers (configurable thresholds):
//   - Negative sentiment on a completed call.
//   - Call ended in error / disconnection (interruption).
//   - Duration anomaly (unusually long or short).
//
// In dev / preview (no SMTP configured) the notification is logged instead of
// sent, so the pipeline stays observable without a mail server.

import { transporter, FROM_ADDRESS } from "@/lib/email";
import { getTenant } from "@/lib/tenantService";
import type { CallLog } from "@/lib/db";

export interface WebhookNotificationInput {
  tenantId: string;
  log: CallLog;
  requestId: string;
}

/** Thresholds for what counts as "worth notifying about". */
const NEGATIVE_SENTIMENT = "Negative";
const ERROR_DISCONNECTION = ["agent_error", "customer_error", "call_ended_unexpectedly"];
const LONG_CALL_SECONDS = 20 * 60; // > 20 min
const SHORT_CALL_SECONDS = 5; // < 5 s (likely a misroute / drop)

/** Decides whether a call warrants a notification and returns the reason. */
function shouldNotify(log: CallLog): string | null {
  if (log.sentiment === NEGATIVE_SENTIMENT) {
    return `Negative caller sentiment detected on call ${log.callId}.`;
  }
  if (log.disconnectionReason && ERROR_DISCONNECTION.includes(log.disconnectionReason)) {
    return `Call ${log.callId} terminated with error: ${log.disconnectionReason}.`;
  }
  const d = log.totalDurationSeconds;
  if (d > LONG_CALL_SECONDS) {
    return `Unusually long call ${log.callId} (${Math.round(d / 60)} min).`;
  }
  if (d > 0 && d < SHORT_CALL_SECONDS) {
    return `Very short call ${log.callId} (${d}s) — possible misroute or drop.`;
  }
  return null;
}

function buildMessage(tenantId: string, reason: string, log: CallLog): string {
  return [
    `Voicerely Call Alert`,
    `Tenant: ${tenantId}`,
    `Call:   ${log.callId} (agent ${log.agentId})`,
    ``,
    reason,
    ``,
    `Duration: ${log.totalDurationSeconds}s`,
    `Sentiment: ${log.sentiment ?? "n/a"}`,
    `Disconnection: ${log.disconnectionReason ?? "n/a"}`,
  ].join("\n");
}

/**
 * Sends (or logs) a notification for an ingested call. Resolves even when no
 * notification is warranted or when delivery fails — it never throws to the
 * caller (the webhook worker treats notifications as best-effort).
 */
export async function sendWebhookNotification(
  input: WebhookNotificationInput
): Promise<void> {
  const { tenantId, log, requestId } = input;
  const reason = shouldNotify(log);
  if (!reason) return; // nothing notable → no notification.

  const tenant = await getTenant(tenantId);
  const to = tenant?.email ?? tenant?.username ?? null;
  const subject = `Voicerely Alert — call ${log.callId}`;
  const text = buildMessage(tenantId, reason, log);

  if (!transporter || !to || !to.includes("@")) {
    // Dev / preview mode: surface the would-be alert in the server logs.
    console.info(`[notify:preview] (req ${requestId}) To ${to ?? "n/a"}\n  ${text}`);
    return;
  }

  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, text });
  } catch (err) {
    // Best-effort: log and move on.
    console.warn(
      `[notify] failed to send for ${log.callId}:`,
      err instanceof Error ? err.message : err
    );
  }
}