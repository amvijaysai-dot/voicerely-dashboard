// lib/security/rateLimit.ts
//
// Lightweight in-memory sliding-window rate limiter for Next.js route handlers.
//
// NOTE: This store is per-process. It works correctly for a single server
// instance (dev, and single-instance production). It does NOT share state
// across multiple instances, serverless function replicas, or hot-reloaded
// module boundaries in every case — for multi-instance production, swap the
// backing store for Redis (e.g. @upstash/ratelimit) so limits are enforced
// globally. The limiter is intentionally dependency-free to keep the bundle
// small and avoid a new infra requirement for the common case.

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetMs: number; // epoch ms when the window resets
}

interface Bucket {
  count: number;
  windowStart: number;
}

const stores = new Map<string, Map<string, Bucket>>();

/**
 * Checks and (if allowed) increments the rate limit for a given key.
 *
 * @param namespace  Logical group, e.g. "login" or "webhook".
 * @param key        Identity within the namespace, usually the client IP.
 * @param limit      Max requests allowed per window.
 * @param windowMs   Window length in milliseconds.
 */
export function rateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let ns = stores.get(namespace);
  if (!ns) {
    ns = new Map<string, Bucket>();
    stores.set(namespace, ns);
  }

  const bucket = ns.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    ns.set(key, { count: 1, windowStart: now });
    return { limited: false, remaining: limit - 1, resetMs: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { limited: true, remaining: 0, resetMs: bucket.windowStart + windowMs };
  }

  bucket.count += 1;
  return {
    limited: false,
    remaining: limit - bucket.count,
    resetMs: bucket.windowStart + windowMs,
  };
}

/** Best-effort client IP extraction from a Next.js request. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
