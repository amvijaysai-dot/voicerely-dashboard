// app/api/webhooks/retell/route.ts
//
// Retell webhook ingestion endpoint. Decouples dashboard performance from
// blocking Retell API calls: instead of polling, Retell pushes call events
// here, we attribute them to a tenant by agent_id, persist an immutable call
// log to the local ledger (data/calls.json), and roll the minutes into the
// tenant's used-minute balance (data/tenants.json).
//
// SECURITY: verifies the x-retell-signature header (HMAC-SHA256) against
// RETELL_WEBHOOK_SECRET. Verification is MANDATORY in production: if the secret
// is missing there, the module throws at load time and the app refuses to boot,
// so unsigned webhooks can never be silently accepted. In development, an
// explicit opt-in flag (DEV_SKIP_WEBHOOK_VERIFY=true) disables verification for
// local testing — it is NEVER on by default and is rejected in production.
//
// RESILIENCE: any internal failure is logged but answered with 200/202 so
// Retell never retries/spams the endpoint with duplicate payloads.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  getTenantByAgentId,
  appendCallLog,
  incrementUsedMinutes,
} from "@/lib/repositories/tenantRepository";
import { newRequestId, audit } from "@/lib/security/logger";
import { safeError } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";
import type { CallLog } from "@/lib/db";

export const dynamic = "force-dynamic";

const WEBHOOK_LIMIT = Number(process.env.WEBHOOK_RATE_LIMIT ?? 120);
const WEBHOOK_WINDOW_MS = 60_000; // 1 minute

const WEBHOOK_SECRET = process.env.RETELL_WEBHOOK_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// In development, allow an EXPLICIT opt-in to skip signature verification for
// local testing. This is never enabled by default and is rejected in prod.
const DEV_SKIP_VERIFY =
  !IS_PRODUCTION && process.env.DEV_SKIP_WEBHOOK_VERIFY === "true";

// Fail fast in production if no webhook secret is configured: we must never
// silently accept unsigned webhooks. The throw happens at module load, so the
// app refuses to boot rather than running insecurely.
if (IS_PRODUCTION && !WEBHOOK_SECRET) {
  throw new Error(
    "FATAL: RETELL_WEBHOOK_SECRET is not set. Refusing to start in production " +
      "with webhook signature verification disabled. Set RETELL_WEBHOOK_SECRET " +
      "(the signing secret from your Retell webhook configuration)."
  );
}

/** Constant-time signature check (HMAC-SHA256 hex). */
function verifySignature(rawBody: string, signature: string | null): boolean {
  if (DEV_SKIP_VERIFY) return true; // dev-only, explicit opt-in
  if (!WEBHOOK_SECRET) {
    // Only reachable in development without the explicit skip flag — guard the
    // pipeline but warn loudly so the gap is visible.
    console.warn(
      "[webhook] RETELL_WEBHOOK_SECRET is unset and DEV_SKIP_WEBHOOK_VERIFY is " +
        "not enabled. Rejecting webhooks. Set the secret or opt in to skip " +
        "(dev only) with DEV_SKIP_WEBHOOK_VERIFY=true."
    );
    return false;
  }
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Robustly pulls a number of seconds out of the varied Retell duration shapes. */
function parseDurationSeconds(input: unknown): number {
  if (typeof input === "number") {
    // Treat values >= 1000 as milliseconds, otherwise seconds.
    return input >= 1000 ? Math.round(input / 1000) : Math.round(input);
  }
  if (typeof input === "string") {
    const n = Number(input);
    if (!Number.isNaN(n)) return n >= 1000 ? Math.round(n / 1000) : Math.round(n);
  }
  return 0;
}

/** Normalizes the free-form Retell sentiment into our tri-state (or undefined). */
function parseSentiment(input: unknown): CallLog["sentiment"] {
  const s = typeof input === "string" ? input.toLowerCase() : "";
  if (s.includes("positive")) return "Positive";
  if (s.includes("negative")) return "Negative";
  if (s.includes("neutral")) return "Neutral";
  return undefined;
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId();

  // Flood protection: cap webhook POSTs per IP (generous for real call
  // volume, but blocks payload flooding). Exceeding the limit returns 429.
  const rl = rateLimit("webhook", clientIp(req), WEBHOOK_LIMIT, WEBHOOK_WINDOW_MS);
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

  if (!verifySignature(raw, signature)) {
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

  // Only act on analyzed/ended call events; ack everything else quietly.
  const isCallEvent =
    event === "call_analyzed" ||
    event === "call_ended" ||
    event === "call.completed" ||
    event.includes("call_analyzed") ||
    event.includes("call_ended");
  if (!isCallEvent) {
    audit(requestId, "webhook.retell_ignored_event", {
      success: true,
      meta: { event },
    });
    return NextResponse.json({ received: true, status: "ignored" }, { status: 200 });
  }

  try {
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

    // 1. Attribute the call to a tenant via the agent_id mapping.
    const tenant = await getTenantByAgentId(agentId);
    if (!tenant) {
      audit(requestId, "webhook.retell_unknown_agent", {
        success: false,
        error: "no_tenant_for_agent",
        meta: { agentId },
      });
      return NextResponse.json({ received: true, status: "ignored" }, { status: 200 });
    }

    // 2. Map Retell payload -> our client-view CallLog shape.
    const durationSeconds = parseDurationSeconds(
      data.duration_ms ?? data.duration ?? data.duration_seconds ?? 0
    );
    const sentiment =
      parseSentiment(data.sentiment) ??
      parseSentiment((data.call_analysis as { user_sentiment?: string })?.user_sentiment);
    const transcript =
      typeof data.transcript === "string"
        ? data.transcript
        : Array.isArray(data.transcript)
        ? (data.transcript as { text?: string }[]).map((t) => t.text ?? "").join("\n")
        : "";
    const audioUrl =
      typeof data.recording_url === "string"
        ? data.recording_url
        : typeof data.recordingUrl === "string"
        ? data.recordingUrl
        : "";
    const createdAtRaw =
      (data.dispatched_at as string) ??
      (data.start_timestamp as string) ??
      (typeof data.start_timestamp === "number"
        ? new Date(data.start_timestamp).toISOString()
        : new Date().toISOString());

    const log: CallLog = {
      callId,
      tenantId: tenant.id,
      agentId,
      totalDurationSeconds: durationSeconds,
      transcript,
      audioUrl,
      disconnectionReason: data.disconnection_reason
        ? String(data.disconnection_reason)
        : null,
      sentiment,
      createdAt: createdAtRaw,
    };

    const { inserted } = await appendCallLog(log, tenant.id);

    // 3. Roll the consumed minutes into the tenant's used-minute balance
    //    (only when this is a brand-new log, to avoid double counting).
    if (inserted) {
      const minutes = durationSeconds / 60;
      await incrementUsedMinutes(tenant.id, minutes, tenant.id);
    }

    audit(requestId, "webhook.retell_ingested", {
      success: true,
      tenantId: tenant.id,
      meta: {
        callId,
        agentId,
        durationSeconds,
        inserted,
        event,
      },
    });

    return NextResponse.json(
      { received: true, status: "ok", inserted, tenantId: tenant.id },
      { status: 202 }
    );
  } catch (err) {
    // Log clearly, but NEVER fail the webhook — Retell would retry & spam us.
    const { error } = safeError(err);
    audit(requestId, "webhook.retell_processing_error", {
      success: false,
      error,
      level: "error",
    });
    return NextResponse.json({ received: true, status: "accepted_with_errors" }, { status: 202 });
  }
}
