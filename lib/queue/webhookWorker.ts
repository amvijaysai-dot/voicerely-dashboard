// lib/queue/webhookWorker.ts
//
// BullMQ Worker — the consumer side of the asynchronous Retell webhook pipeline.
// Runs as a long-lived process (scripts/webhook-worker.ts), NOT inside Next.js.
//
// Behavior:
//   - Pulls jobs from `retell-webhook`, runs `processWebhook` (the staged
//     pipeline: attribute → persist → billing → analytics → notify).
//   - Retries failed jobs with exponential backoff (configured on the queue).
//   - Terminal errors (WebhookTerminalError, e.g. unknown agent) are sent
//     straight to the Dead Letter Queue (`retell-webhook-dead`) without retry.
//   - Emits progress logs at every stage for observability.
//   - Gracefully shuts down on SIGTERM/SIGINT (drains in-flight jobs).

import { Worker, Queue, Job } from "bullmq";
import { getRedisConnection, QUEUE_NAMES } from "./redis";
import {
  processWebhook,
  WebhookTerminalError,
  type WebhookJobPayload,
} from "./processWebhook";
import { audit } from "@/lib/security/logger";

/** The Dead Letter Queue. Failed jobs are moved here after retries are
 *  exhausted (or immediately for terminal errors). */
function getDeadLetterQueue(): Queue<WebhookJobPayload> {
  return new Queue<WebhookJobPayload>(QUEUE_NAMES.webhookDead, {
    connection: getRedisConnection(),
  });
}

let worker: Worker<WebhookJobPayload> | null = null;

/** Builds (or returns the existing) worker instance. */
export function getWebhookWorker(): Worker<WebhookJobPayload> {
  if (worker) return worker;

  worker = new Worker<WebhookJobPayload>(
    QUEUE_NAMES.webhook,
    async (job: Job<WebhookJobPayload>) => {
      const { callId, agentId, event } = job.data;
      audit(job.data.requestId ?? callId, "webhook.worker_processing", {
        success: true,
        meta: { callId, agentId, event, attempt: job.attemptsMade + 1 },
      });

      try {
        const result = await processWebhook(job.data);
        await job.updateProgress({
          stage: result.stage,
          inserted: result.inserted,
          tenantId: result.tenantId,
        });
        return result;
      } catch (err) {
        const isTerminal = err instanceof WebhookTerminalError;
        audit(job.data.requestId ?? callId, "webhook.worker_error", {
          success: false,
          error: err instanceof Error ? err.message : "unknown",
          level: "error",
          meta: { callId, terminal: isTerminal, attempt: job.attemptsMade + 1 },
        });
        // Re-throw: BullMQ handles retry (transient) or DLQ routing (terminal).
        throw err;
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY ?? 8),
      // Move jobs that exhaust retries (or throw a terminal error) to the DLQ.
      // `removeOnFail: false` keeps the original job metadata for inspection.
    }
  );

  // Route exhausted / terminal failures into the Dead Letter Queue.
  worker.on("failed", async (job: Job<WebhookJobPayload> | undefined, err: Error) => {
    if (!job) return;
    const terminal = err instanceof WebhookTerminalError;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (terminal || exhausted) {
      try {
        const dlq = getDeadLetterQueue();
        await dlq.add(
          `${QUEUE_NAMES.webhookDead}:${job.data.callId}`,
          job.data,
          { jobId: `dlq:${job.data.callId}`, removeOnComplete: { age: 7 * 86_400 } }
        );
        audit(job.data.requestId ?? job.data.callId, "webhook.moved_to_dlq", {
          success: false,
          error: err instanceof Error ? err.message : "unknown",
          level: "error",
          meta: { callId: job.data.callId, terminal, exhausted },
        });
      } catch (dlqErr) {
        console.warn(
          "[queue:worker] failed to move job to DLQ:",
          dlqErr instanceof Error ? dlqErr.message : dlqErr
        );
      }
    }
  });

  worker.on("completed", (job) => {
    audit(job.data.requestId ?? job.data.callId, "webhook.worker_completed", {
      success: true,
      meta: { callId: job.data.callId },
    });
  });

  worker.on("error", (err) => {
    console.warn("[queue:worker] worker error:", err.message);
  });

  return worker;
}

/** Graceful shutdown — wait for in-flight jobs, then close. */
export async function closeWebhookWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}