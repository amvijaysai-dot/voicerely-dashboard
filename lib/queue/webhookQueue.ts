// lib/queue/webhookQueue.ts
//
// BullMQ queue definition for the asynchronous Retell webhook pipeline.
//
// Responsibilities of THIS module (the producer side):
//   - Define the `retell-webhook` queue and its `retell-webhook-dead` DLQ.
//   - Configure retries with exponential backoff + jitter.
//   - Enforce idempotency via a deterministic job id (callId) so a duplicate
//     webhook (Retell redelivery, or our own inline fallback) can never create
//     two jobs for the same call.
//   - Provide `enqueueWebhook(payload)` used by the API route.
//
// The actual processing lives in `processWebhook.ts` (pure logic) and is run by
// the Worker in `webhookWorker.ts`. Keeping the queue definition separate means
// the Next.js route bundle only imports the producer, never the Worker.

import { Queue, JobsOptions } from "bullmq";
import { getRedisConnection, QUEUE_NAMES } from "./redis";
import type { WebhookJobPayload } from "./processWebhook";

/** Retry policy: exponential backoff with jitter, capped at ~2 minutes. */
const RETRY_BACKOFF: JobsOptions = {
  // BullMQ applies exponential backoff: delay = backoffFactor * 2^(attempt-1).
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 2000, // 2s, 4s, 8s, 16s, 32s (+ jitter)
  },
  // Remove successful jobs after 24h; keep failed (pre-DLQ) for inspection.
  removeOnComplete: { age: 86_400 },
  removeOnFail: false,
};

let webhookQueue: Queue<WebhookJobPayload> | null = null;

/** Lazily-created singleton queue (producer side). */
export function getWebhookQueue(): Queue<WebhookJobPayload> {
  if (!webhookQueue) {
    webhookQueue = new Queue<WebhookJobPayload>(QUEUE_NAMES.webhook, {
      connection: getRedisConnection(),
      defaultJobOptions: RETRY_BACKOFF,
    });
  }
  return webhookQueue;
}

/**
 * Builds a deterministic, idempotent job id from the webhook payload.
 * Two deliveries of the same Retell call event produce the same job id, so
 * BullMQ de-duplicates them — the second enqueue is a no-op. This is the first
 * line of defense against duplicate webhook processing (the worker also guards
 * at the database level via `appendCallLog`'s insert-only semantics).
 */
export function webhookJobId(payload: WebhookJobPayload): string {
  return `wh:${payload.callId}`;
}

/**
 * Enqueues a verified webhook event for asynchronous processing.
 * Returns the job id (or null if enqueue failed — caller should fall back to
 * inline processing). Idempotent: re-enqueueing the same callId is a no-op.
 */
export async function enqueueWebhook(
  payload: WebhookJobPayload
): Promise<string | null> {
  try {
    const queue = getWebhookQueue();
    const job = await queue.add(QUEUE_NAMES.webhook, payload, {
      jobId: webhookJobId(payload),
      ...RETRY_BACKOFF,
    });
    return job.id ?? webhookJobId(payload);
  } catch (err) {
    console.warn(
      "[queue:webhook] enqueue failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/** Gracefully close the producer queue (used on shutdown). */
export async function closeWebhookQueue(): Promise<void> {
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
  }
}