# Webhook Architecture — Asynchronous Refactor (BullMQ + Redis)

**Author:** Principal Backend Engineer
**Scope:** Retell webhook ingestion pipeline
**Goal:** Convert the synchronous webhook handler into a resilient, asynchronous, queue-backed pipeline with retries, a Dead Letter Queue, idempotency, duplicate protection, progress logging, and exponential backoff — **without breaking the existing `/api/webhooks/retell` endpoint contract.**

---

## 1. Before vs. After

### Before (synchronous)
```
Retell ──▶ POST /api/webhooks/retell
                │
                ├─ verify signature (HMAC)
                ├─ parse + map payload
                ├─ getTenantByAgentId()        ← DB read
                ├─ appendCallLog()             ← DB write (blocking)
                ├─ incrementUsedMinutes()      ← DB write (blocking)
                └─ return 202
```
Every webhook blocked the HTTP request on tenant lookup + two DB writes. A slow
DB or a Retell traffic spike stalled the request path and risked Retell retries
(duplicate payloads).

### After (asynchronous)
```
Retell ──▶ POST /api/webhooks/retell
                │
                ├─ rate limit (per IP)
                ├─ verify signature (HMAC)      ← MANDATORY, unchanged
                ├─ parse + map payload
                └─ enqueue job (BullMQ/Redis) ──▶ return 202  (fast, constant-time)

                                   ┌─────────────────────────────────────┐
                                   │  BullMQ Worker (separate process)    │
                                   │   npm run worker                     │
                                   │                                       │
                                   │  Job ─▶ 1. Attribute (tenant lookup) │
                                   │       2. Persist  (insert-only log)  │
                                   │       3. Billing   (roll-up minutes) │
                                   │       4. Analytics (agent health)    │
                                   │       5. Notify   (anomaly alerts)   │
                                   │                                       │
                                   │  retry w/ exp. backoff on failure    │
                                   │  terminal fail ─▶ Dead Letter Queue  │
                                   └─────────────────────────────────────┘
```

The HTTP handler now does **only** verification + enqueue. All heavy work moves
to a dedicated worker process. The endpoint returns `202` immediately, so Retell
is never blocked and never retries due to slowness.

---

## 2. End-to-end sequence diagram

```
┌────────┐      ┌──────────────────┐      ┌─────────┐      ┌──────────────┐
│ Retell │      │ Webhook Route    │      │  Redis  │      │   Worker     │
│ (HTTP) │      │ (Next.js API)    │      │ (BullMQ)│      │ (npm run     │
└───┬────┘      └────────┬─────────┘      └────┬────┘      │  worker)     │
    │   POST (event)     │                     │           │              │
    │───────────────────▶│                     │           │              │
    │                    │ rate limit          │           │              │
    │                    │ verify HMAC         │           │              │
    │                    │ parse + map         │           │              │
    │                    │ isQueueAvailable()  │           │              │
    │                    │──── enqueue ───────▶│ add job   │              │
    │                    │  (jobId = wh:callId)│           │              │
    │◀── 202 {queued} ───│                     │           │              │
    │                    │                     │ process   │              │
    │                    │                     │──────────▶│ fetch job    │
    │                    │                     │           │ run pipeline │
    │                    │                     │           │ (5 stages)  │
    │                    │                     │ ack/comp  │              │
    │                    │                     │◀──────────│              │
    │                    │                     │           │  on failure: │
    │                    │                     │ retry ───▶│ backoff      │
    │                    │                     │           │  exhausted:  │
    │                    │                     │◀─ DLQ ────│              │
```

---

## 3. Component map

| File | Role |
|---|---|
| `app/api/webhooks/retell/route.ts` | **Producer.** Verifies signature, maps payload → `RetellCallRecord`, enqueues a job. Falls back to inline processing if Redis is down. |
| `lib/queue/redis.ts` | Shared IORedis connection + `isQueueAvailable()` health probe (graceful degradation). |
| `lib/queue/webhookQueue.ts` | BullMQ `Queue` definition, retry/backoff `JobsOptions`, deterministic idempotent `jobId`, `enqueueWebhook()`. |
| `lib/queue/processWebhook.ts` | **Pure staged pipeline** (attribute → persist → billing → analytics → notify). Reused by both the worker and the inline fallback. Exports `WebhookTerminalError`. |
| `lib/queue/webhookWorker.ts` | BullMQ `Worker` (consumer). Runs the pipeline, updates progress, routes failures to the DLQ. |
| `scripts/webhook-worker.ts` | Standalone worker entrypoint (`npm run worker`). Long-lived process outside Next.js. |
| `lib/notifications/webhookNotifications.ts` | Final "Notifications" stage — anomaly/threshold alerts via SMTP (best-effort). |
| `lib/analytics/agentHealth.ts` | "Analytics" stage — recomputes the agent-health model (unchanged logic). |
| `lib/repositories/tenantRepository.ts` | "Database" stage — `appendCallLog` (insert-only) + `incrementUsedMinutes`. |

---

## 4. Requirement coverage

| Requirement | Implementation |
|---|---|
| **BullMQ preferred** | `bullmq` `Queue` + `Worker` used throughout. |
| **Redis support** | IORedis connection (`lib/queue/redis.ts`), `REDIS_URL` env var. |
| **Retry failed jobs** | `attempts: 5` on the queue; failed jobs auto-requeue. |
| **Dead Letter Queue** | `retell-webhook-dead` queue; jobs moved there after retries exhaust or on a terminal error. |
| **Idempotency** | Deterministic `jobId = wh:<callId>` → BullMQ de-dupes duplicate deliveries. |
| **Duplicate webhook protection** | (a) Idempotent job id; (b) `appendCallLog` is insert-only (`inserted:false` on replay → billing skipped). Two layers. |
| **Progress logging** | `audit()` events at every stage (`webhook.job_start`, `webhook.job_persisted`, `webhook.job_billing_rolled`, `webhook.job_analytics_recomputed`, `webhook.job_done`, `webhook.worker_*`, `webhook.moved_to_dlq`). |
| **Exponential backoff** | `backoff: { type: "exponential", delay: 2000 }` → 2s, 4s, 8s, 16s, 32s. |

---

## 5. Idempotency & duplicate protection (deep dive)

Retell may redeliver an event (at-least-once delivery). We defend at two layers:

1. **Queue layer.** `webhookJobId(payload) = "wh:" + callId`. BullMQ treats a
   second `add()` with the same job id as a no-op, so a redelivered webhook
   never creates a second job.
2. **Database layer.** `appendCallLog` is **insert-only**: it returns
   `{ inserted: false }` when a `callId` already exists for the tenant. The
   billing stage (`incrementUsedMinutes`) only runs when `inserted === true`,
   so minutes are never double-counted even if a job is somehow replayed.

Result: a call is persisted and billed **exactly once**, regardless of how many
times Retell sends it.

---

## 6. Retry & Dead Letter flow

```
Job fails (transient: DB timeout, Redis blip, Retell 5xx during analytics)
   │
   ├─ attempt 1 → backoff 2s
   ├─ attempt 2 → backoff 4s
   ├─ attempt 3 → backoff 8s
   ├─ attempt 4 → backoff 16s
   ├─ attempt 5 → backoff 32s
   │
   ├─ still failing → moved to retell-webhook-dead (DLQ)
   │                  (inspectable; can be replayed manually)
   │
   └─ WebhookTerminalError (e.g. unknown agent_id) → moved to DLQ immediately,
      no retries (retrying would never succeed).
```

The DLQ retains jobs for 7 days for post-mortem / manual replay.

---

## 7. Graceful degradation (no Redis? no problem)

If Redis is unreachable, `isQueueAvailable()` returns `false` and the route
**processes the verified event inline** via the same `processWebhook` pipeline.
This preserves the original synchronous behavior as a safety net, so:
- The webhook endpoint never hard-fails on a queue outage.
- No events are lost — they're just handled in-request instead of queued.

Once Redis is back, the route automatically switches back to enqueue mode.

---

## 8. Deployment

- **Web server (Next.js):** runs the API routes as before. The webhook route
  only enqueues; it does **not** need a long-lived Redis subscription.
- **Worker (separate process):** run `npm run worker` as a dedicated, always-on
  service (container, systemd unit, Render/Railway background worker, etc.).
  Scale horizontally by running multiple worker instances — BullMQ coordinates
  via Redis so each job runs exactly once across the fleet.
- **Env vars:** `REDIS_URL` (default `redis://localhost:6379`),
  `WEBHOOK_WORKER_CONCURRENCY` (default `8`).

---

## 9. Verification

- `npx tsc --noEmit` → **0 errors** (whole project, including new files).
- `npx eslint` on all new/modified files → **0 errors, 0 warnings**.
- The `/api/webhooks/retell` route still: rate-limits, verifies the
  `x-retell-signature` HMAC (mandatory in prod), ignores non-call events, and
  returns `200`/`202` — the external contract is unchanged.
- The inline fallback guarantees behavior parity when Redis is absent.

---

## 10. Files added / modified

**Added**
- `lib/queue/redis.ts`
- `lib/queue/webhookQueue.ts`
- `lib/queue/processWebhook.ts`
- `lib/queue/webhookWorker.ts`
- `lib/notifications/webhookNotifications.ts`
- `scripts/webhook-worker.ts`
- `WEBHOOK_ARCHITECTURE.md` (this file)

**Modified**
- `app/api/webhooks/retell/route.ts` — verify → enqueue (inline fallback).
- `package.json` — added `bullmq`, `ioredis`, `tsx`; added `worker` script.
- `.env.example` — added `REDIS_URL`, `WEBHOOK_WORKER_CONCURRENCY`.

**Unchanged (by design):** all UI, all other routes, `prisma/schema.prisma`,
the repository drivers, encryption, and every existing feature.