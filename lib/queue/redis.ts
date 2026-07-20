// lib/queue/redis.ts
//
// Shared Redis connection for the BullMQ webhook pipeline. Centralized so the
// API route (producer) and the worker (consumer) reuse the same IORedis
// instance and connection settings.
//
// GRACEFUL DEGRADATION: if Redis is unreachable (e.g. local dev without a
// Redis server, or a transient outage), `isQueueAvailable()` returns false and
// callers fall back to inline processing. This guarantees the webhook endpoint
// never hard-fails just because the queue backend is down — the existing
// synchronous behavior is preserved as a safety net.

import { Redis } from "ioredis";

export const REDIS_URL =
  process.env.REDIS_URL ?? "redis://localhost:6379";

/** BullMQ queue / worker names. Kept in one place to avoid drift. */
export const QUEUE_NAMES = {
  webhook: "retell-webhook",
  webhookDead: "retell-webhook-dead",
} as const;

let sharedConnection: Redis | null = null;
let availabilityChecked = false;
let available = false;

/**
 * Returns a lazily-created, shared IORedis connection. The connection is
 * configured with a bounded retry so a dead Redis doesn't spin forever, and
 * `maxRetriesPerRequest` is set to null (required by BullMQ blocking commands).
 */
export function getRedisConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      // Don't crash the process if Redis is down; we detect & degrade instead.
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });

    // Surface connection problems as warnings, not fatal crashes.
    sharedConnection.on("error", (err: Error) => {
      console.warn("[queue:redis] connection error:", err.message);
    });
  }
  return sharedConnection;
}

/**
 * Probes Redis once (cached) to decide whether the async pipeline is usable.
 * Returns true only when a PING succeeds. Safe to call repeatedly.
 */
export async function isQueueAvailable(): Promise<boolean> {
  if (availabilityChecked) return available;
  availabilityChecked = true;
  try {
    const redis = getRedisConnection();
    await redis.ping();
    available = true;
  } catch {
    available = false;
    console.warn(
      "[queue:redis] Redis unavailable — webhook pipeline will run inline " +
        "(synchronous fallback). Set REDIS_URL to enable the async queue."
    );
  }
  return available;
}

/** Resets the cached availability flag (used by tests / reconnects). */
export function resetQueueAvailability(): void {
  availabilityChecked = false;
  available = false;
}