// lib/security/rateLimit.ts
//
// Sliding-window rate limiter with two backends:
// 1. In-process Map store (fast, dev/single-instance)
// 2. Postgres-backed store via a RateLimit table (serverless-safe)
//
// The Postgres backend is used automatically when DATA_DRIVER=postgres.
// For serverless deployments (Vercel), this ensures limits are enforced
// globally across all function instances.

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetMs: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

// ---- In-process store (dev / single-instance) ----------------------------
const stores = new Map<string, Map<string, Bucket>>();

function inProcessLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let ns = stores.get(namespace);
  if (!ns) { ns = new Map(); stores.set(namespace, ns); }
  const bucket = ns.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    ns.set(key, { count: 1, windowStart: now });
    return { limited: false, remaining: limit - 1, resetMs: now + windowMs };
  }
  if (bucket.count >= limit) {
    return { limited: true, remaining: 0, resetMs: bucket.windowStart + windowMs };
  }
  bucket.count += 1;
  return { limited: false, remaining: Math.max(0, limit - bucket.count), resetMs: bucket.windowStart + windowMs };
}

// ---- Postgres store (serverless-safe) ------------------------------------
// Uses an upsert on a lightweight rate_limit_buckets table.
// Falls back to in-process if Prisma is unavailable.
async function postgresLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const now = BigInt(Date.now());
    const windowStart = now - BigInt(windowMs);
    const bucketKey = `${namespace}:${key}`;

    // Use a raw query for atomic increment — avoids a read-modify-write race.
    const result = await prisma.$queryRaw<{ count: number; window_start: bigint }[]>`
      INSERT INTO rate_limit_buckets (bucket_key, count, window_start)
      VALUES (${bucketKey}, 1, ${now})
      ON CONFLICT (bucket_key) DO UPDATE SET
        count = CASE
          WHEN rate_limit_buckets.window_start < ${windowStart}
          THEN 1
          ELSE rate_limit_buckets.count + 1
        END,
        window_start = CASE
          WHEN rate_limit_buckets.window_start < ${windowStart}
          THEN ${now}
          ELSE rate_limit_buckets.window_start
        END
      RETURNING count, window_start
    `;

    const row = result[0];
    if (!row) return inProcessLimit(namespace, key, limit, windowMs);
    const resetMs = Number(row.window_start) + windowMs;
    if (row.count >= limit) {
      return { limited: true, remaining: 0, resetMs };
    }
    return { limited: false, remaining: Math.max(0, limit - row.count), resetMs };
  } catch {
    // If Postgres rate limiting fails, fall back to in-process.
    return inProcessLimit(namespace, key, limit, windowMs);
  }
}

/** Checks and increments the rate limit for a given key. */
export async function rateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const usePostgres = process.env.DATA_DRIVER === 'postgres';
  if (usePostgres) return postgresLimit(namespace, key, limit, windowMs);
  return inProcessLimit(namespace, key, limit, windowMs);
}

/** Best-effort client IP extraction from a Next.js request. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}