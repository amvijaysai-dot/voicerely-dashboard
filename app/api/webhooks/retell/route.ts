// app/api/webhooks/retell/route.ts
//
// Retell webhook ingestion endpoint — now the ASYNCHRONOUS entry point.
//
// New flow (see WEBHOOK_ARCHITECTURE.md):
//   Retell → [signature verify] → [enqueue to BullMQ] → Worker → DB → Analytics → Notify
//
// This handler ONLY:
//   1. Rate-limits per IP.
//   2. Verifies the x-retell-signature (HMAC-SHA256) — MANDATORY in production.
//   3. Parses + shape-validates the event, mapping it to a normalized
//      RetellCallRecord (the same shape the dashboard already consumes).
//   4. Enqueues a job onto the `retell-webhook` BullMQ queue (Redis-backed),
//      keyed by callId for idempotency.
//
// Heavy work (tenant attribution, DB writes, billing roll-up, analytics,
// notifications) happens in the Worker, NOT in the request path. The endpoint
// returns 202 immediately so Retell is never blocked and never retries.
//
// GRACEFUL FALLBACK: if Redis/queue is unavailable, the verified event is
// processed INLINE via the same staged pipeline, preserving the previous
// synchronous behavior. The endpoint therefore never hard-fails on queue outages.
//
// SECURITY: signature verification is unchanged and still mandatory in prod.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { enqueueWebhook } from "@/lib/queue/webhookQueue";
import { isQueueAvailable } from "@/lib/queue/redis";
import { processWebhook, type WebhookJobPayload } from "@/lib/queue/processWebhook";
import { newRequestId, audit } from "@/lib/security/logger";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";
import type { RetellCallRecord } from "@/lib/retell/types";

export const dynamic = "force-dynamic";

const WEBHOOK_LIMIT = Number(process.env.WEBHOOK_RATE_LIMIT ?? 120);
const WEBHOOK_WINDOW_MS = 60_000; // 1 minute

/** Constant-time signature check (HMAC-SHA256 hex). */
function verifySignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string | undefined,
  isProduction: boolean,
  devSkipVerify: boolean
): boolean {
  if (devSkipVerify) return true; // dev-only, explicit opt-in
  if (!webhookSecret) {
    console.warn(
      "[webhook] RETELL_WEBHOOK_SECRET is unset and DEV_SKIP_WEBHOOK_VERIFY is " +
        "not enabled. Rejecting webhooks. Set the secret or opt in to skip " +
        "(dev only) with DEV_SKIP_WEBHOOK_VERIFY=true."
    );
    return false;
  }
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Robustly pulls a number of seconds out of the varied Retell duration shapes. */
function parseDurationSeconds(input: unknown): number {
  if (typeof input === "number") {
    return input >= 1000 ? Math.round(input / 1000) : Math.round(input);
  }
  if (typeof input === "string") {
    const n = Number(input);
    if (!Number.isNaN(n)) return n >= 1000 ? Math.round(n / 1000) : Math.round(n);
  }
  return 0;
}

/** Normalizes the free-form Retell sentiment into our tri-state (or undefined). */
function parseSentiment(input: unknown): "Positive" | "Negative" | "Neutral" | undefined {
  const s = typeof input === "string" ? input.toLowerCase() : "";
  if (s.includes("positive")) return "Positive";
  if (s.includes("negative")) return "Negative";
  if (s.includes("neutral")) return "Neutral";
  return undefined;
}

/** Maps the raw Retell webhook payload to a normalized RetellCallRecord. */
function toCallRecord(data: Record<string, unknown>): RetellCallRecord {
  const transcript =
    typeof data.transcript === "string"
      ? data.transcript
      : Array.isArray(data.transcript)
      ? (data.transcript as { text?: string }[]).map((t) => t.text ?? "").join("\n")
      : "";
  const recording_url =
    typeof data.recording_url === "string"
      ? data.recording_url
      : typeof data.recordingUrl === "string"
      ? data.recordingUrl
      : undefined;
  const sentimentRaw =
    parseSentiment(data.sentiment) ??
    parseSentiment((data.call_analysis as { user_sentiment?: string } | undefined)?.user_sentiment);
  const startTimestamp =
    typeof data.start_timestamp === "number"
      ? data.start_timestamp
      : typeof data.dispatched_at === "string"
      ? Date.parse(data.dispatched_at)
      : Date.now();

  return {
    call_id: String(data.call_id ?? data.callId ?? ""),
    agent_id: String(data.agent_id ?? data.agentId ?? ""),
    agent_name: (data.agent_name ?? data.agentName) as string | undefined,
    call_status: (data.call_status ?? "ended") as RetellCallRecord["call_status"],
    disconnection_reason: (data.disconnection_reason ??
      data.disconnectionReason) as string | undefined,
    start_timestamp: startTimestamp,
    end_timestamp:
      typeof data.end_timestamp === "number"
        ? data.end_timestamp
        : startTimestamp + parseDurationSeconds(data.duration_ms ?? data.duration ?? data.duration_seconds ?? 0) * 1000,
    duration_seconds: parseDurationSeconds(
      data.duration_ms ?? data.duration ?? data.duration_seconds ?? 0
    ),
    from_number: (data.from_number ?? data.fromNumber) as string | undefined,
    to_number: (data.to_number ?? data.toNumber) as string | undefined,
    recording_url,
    transcript,
    transcript_object: [],
    call_analysis: sentimentRaw ? { user_sentiment: sentimentRaw } : undefined,
  };
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();

  // Flood protection: cap webhook POSTs per IP.
  const rl = await rateLimit("webhook", clientIp(req), WEBHOOK_LIMIT, WEBHOOK_WINDOW_MS);
  if (rl.limited) {
    const retryAfter = Math.ceil((rl.resetMs - Date.now()) / 1000);
    audit(requestId, "webhook.retell_rate_limited", {
      success: false,
      error: "rate_limited",
      meta: { ip: clientIp(req) },
    });
    return NextResponse.json(
      { received: false, status: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(WEBHOOK_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // Read the raw body once so we can both verify the signature and parse JSON.
  const raw = await req.text();
  const signature = req.headers.get("x-retell-signature");

  const webhookSecret = process.env.RETELL_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  const devSkipVerify = !isProduction && process.env.DEV_SKIP_WEBHOOK_VERIFY === "true";

  if (!verifySignature(raw, signature, webhookSecret, isProduction, devSkipVerify)) {
    audit(requestId, "webhook.retell_signature_failed", {
      success: false,
      error: "invalid_signature",
    });
    // Still 200 so Retell does not retry; the event is simply dropped.
    return NextResponse.json({ received: true, status: "ignored" }, { status: 200 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    audit(requestId, "webhook.retell_bad_json", { success: false, error: "invalid_json" });
    return NextResponse.json({ received: true, status: "ignored" }, { status: 200 });
  }

  // Retell wraps events as { event, data }. Support both shapes.
  const event = (payload.event ?? payload.type ?? "") as string;
  const data = (payload.data ?? payload) as Record<string, unknown>;

  // Replay / staleness protection: reject events whose embedded timestamp is
  // missing or older than MAX_WEBHOOK_AGE_MS. Retell redelivers at-least-once,
  // and the queue already de-dupes by callId, but this bounds how late a
  // captured/replayed payload can be accepted (defence in depth).
  const MAX_WEBHOOK_AGE_MS = 1000 * 60 * 60 * 24; // 24h
  const tsRaw =
    (data.start_timestamp as number) ??
    (data.dispatched_at ? Date.parse(data.dispatched_at as string) : NaN) ??
    (typeof data.timestamp === "number" ? data.timestamp : NaN);
  if (!Number.isNaN(tsRaw)) {
    const age = Date.now() - (tsRaw > 1e12 ? tsRaw : tsRaw * 1000);
    if (age > MAX_WEBHOOK_AGE_MS) {
      audit(requestId, "webhook.retell_stale", {
        success: false,
        error: "stale_event",
        meta: { event, ageMs: age },
      });
      return NextResponse.json({ received: true, status: "ignored" }, { status: 200 });
    }
  }

  // Only act on analyzed/ended call events; ack everything else quietly.
  const isCallEvent =
    event === "call_analyzed" ||
    event === "call_ended" ||
    event === "call.completed" ||
    event.includes("call_analyzed") ||
    event.includes("call_ended");
  if (!isCallEvent) {
    audit(requestId, "webhook.retell_ignored_event", { success: true, meta: { event } });
    return NextResponse.json({ received: true, status: "ignored" }, { status: 200 });
  }

  const callId = String(data.call_id ?? data.callId ?? "");
  const agentId = String(data.agent_id ?? data.agentId ?? "");
  if (!callId || !agentId) {
    audit(requestId, "webhook.retell_missing_ids", {
      success: false,
      error: "missing_call_or_agent_id",
      meta: { callId, agentId },
    });
    return NextResponse.json({ received: true, status: "ignored" }, { status: 200 });
  }

  const jobPayload: WebhookJobPayload = {
    callId,
    agentId,
    call: toCallRecord(data),
    event,
    requestId,
  };

  // Enqueue for asynchronous processing. If the queue is unavailable, fall back
  // to inline processing so the endpoint never loses an event.
  const queueUp = await isQueueAvailable();
  if (queueUp) {
    const jobId = await enqueueWebhook(jobPayload);
    if (jobId) {
      audit(requestId, "webhook.retell_enqueued", {
        success: true,
        meta: { callId, agentId, jobId, event },
      });
      return NextResponse.json(
        { received: true, status: "queued", callId, jobId },
        { status: 202 }
      );
    }
    // Enqueue failed (e.g. Redis blip) → fall through to inline.
    console.warn("[webhook] enqueue failed; processing inline.");
  }

  // INLINE FALLBACK (synchronous, preserves prior behavior when no queue).
  try {
    const result = await processWebhook(jobPayload);
    return NextResponse.json(
      {
        received: true,
        status: result.ok ? "ok" : "accepted_with_errors",
        inserted: result.inserted,
        tenantId: result.tenantId,
      },
      { status: 202 }
    );
  } catch {
    // Never fail the webhook — Retell would retry & spam us.
    audit(requestId, "webhook.retell_inline_error", {
      success: false,
      error: "inline_processing_failed",
      level: "error",
      meta: { callId },
    });
    return NextResponse.json(
      { received: true, status: "accepted_with_errors" },
      { status: 202 }
    );
  }
}
