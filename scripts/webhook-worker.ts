// scripts/webhook-worker.ts
//
// Standalone BullMQ worker process for the Retell webhook pipeline.
// Run with:  npm run worker   (tsx scripts/webhook-worker.ts)
//
// This process is intentionally OUTSIDE Next.js so it can hold a long-lived
// Redis connection and process jobs independently of the web server. In
// serverless/edge deployments, run this as a separate worker service
// (e.g. a dedicated container, Render background worker, or Railway service).

import { getWebhookWorker, closeWebhookWorker } from "@/lib/queue/webhookWorker";

console.log("[worker] Starting Retell webhook worker…");

const worker = getWebhookWorker();

// Keep the event loop alive and surface lifecycle events.
worker
  .waitUntilReady()
  .then(() => console.log("[worker] Connected to Redis; consuming 'retell-webhook'."))
  .catch((err: unknown) => {
    console.error("[worker] Failed to connect to Redis:", err);
    process.exit(1);
  });

// Graceful shutdown: drain in-flight jobs before exiting.
async function shutdown(signal: string) {
  console.log(`[worker] Received ${signal} — draining in-flight jobs…`);
  try {
    await closeWebhookWorker();
  } catch (err) {
    console.warn("[worker] error during shutdown:", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));