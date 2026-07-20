# Architecture Changes — TenantService, Cached Decryption & Production Hardening

**Author:** Principal Staff Engineer
**Scope:** Multi-tenant tenant resolution, Retell API-key handling, repository access, webhook routing, and error/logging hardening.
**Goal:** Reduce duplicate tenant lookups, decrypt Retell API keys at most once per 60-second window, never expose keys outside the service boundary, add proper TypeScript types, and improve error handling and logging — **without changing any routes, UI, or existing features.**

---

## 1. Problem analysis (what we found)

Tracing every API endpoint, repository call, webhook, and tenant lookup surfaced the following production risks:

1. **Duplicate tenant lookups per request.** Several handlers resolved the tenant twice in a single request:
   - `app/api/dashboard/metrics/route.ts` called `getSessionTenant()` **and then** `getTenantById(sessionTenant.id)` — a redundant second repository read.
   - `app/api/auth/login/route.ts` called `getTenantByUsername()` and then `getTenantById()` for the same tenant.
   - `app/api/webhooks/retell/route.ts` called `getTenantByAgentId()` and then `getTenantById()` for the same tenant.
2. **Retell API key decrypted on every Retell call.** `lib/retell/client.ts` read `tenant.retellApiKey` directly off the tenant object, so each `listCalls`/`getCall`/`getAgent`/`getClientConfig` call re-used an already-decrypted key carried in memory — but the key was still being loaded (and, in the JSON driver, re-decrypted) from the store on every tenant fetch, and the key was freely available on the `Tenant` object that flows through the entire app (including session serialization and any future client exposure).
3. **No central place to add caching or observability** for tenant resolution — logic was scattered across routes and the repository.
4. **Inconsistent error handling & logging.** Some handlers used `console.error` with raw upstream bodies; others swallowed errors silently. No structured request IDs or audit trail for tenant resolution.

---

## 2. New component: `lib/tenantService.ts` (TenantService)

A single, server-only module that owns **all tenant reads** and **Retell key decryption**, backed by an in-memory 60-second TTL cache.

### Key design decisions

- **60-second cache (`TENANT_CACHE_TTL_MS = 60_000`).** A `Map<string, { tenant: Tenant; expires: number }>` keyed by tenant id. On hit, the cached `Tenant` is returned (with `retellApiKey` blanked). On miss/expiry, the repository is queried, the result is cached, and the clock resets.
- **Retell key decrypted at most once per cache lifetime.** `getRetellApiKey(id)`:
  1. Reads the cached tenant (populating the cache if needed).
  2. If `retellApiKey` is already present on the cached tenant, returns it **without re-decrypting**.
  3. Otherwise decrypts once via `decryptTenantApiKey`, writes it back onto the cached tenant object (so subsequent calls in the same window skip decryption), and returns it.
  - The decrypted key is **never** written back to the repository or to the sanitized `Tenant` returned by `getTenant`. It lives only inside the cache entry and is handed directly to the Retell client.
- **Keys never leave the service.** `getTenant` / `getSessionTenant` / `getTenantByUsername` / `getTenantByEmail` / `getTenantByAgentId` / `listClientTenants` all return a `Tenant` with `retellApiKey` forced to `""`. The only function that returns a real key is `getRetellApiKey`, and it is **only imported by `lib/retell/client.ts`** (server-only).
- **Indexes for O(1) secondary lookups.** `usernameIndex` and `emailIndex` (lowercased) and `agentIndex` (per agent id) are built from the cached tenant list so `getTenantByUsername` / `getTenantByEmail` / `getTenantByAgentId` don't re-scan the store on every call. These indexes are rebuilt whenever the tenant list cache is refreshed.
- **Cache invalidation on writes.** `invalidateTenant(id)` evicts a single entry; `invalidateAllTenants()` clears the list/secondary-index cache. Every write path (create/update/delete/password) now calls the appropriate invalidation so the cache can never serve stale data after an admin or self-service mutation.
- **Structured logging & error handling.** All reads go through `logTenantAccess` (debug-level, redacts the key) and `logTenantError` (error-level with request id). Failures throw typed `TenantServiceError` (extends `Error`) instead of leaking repository internals.

### Public API (all re-exported for convenience)

| Function | Purpose |
|---|---|
| `getTenant(id)` | Cached tenant by id (key blanked). |
| `getTenantByUsername(username)` | Cached lookup by username (case-insensitive). |
| `getTenantByEmail(email)` | Cached lookup by email (case-insensitive, trimmed). |
| `getTenantByAgentId(agentId)` | Cached lookup by Retell agent id (webhook routing). |
| `getSessionTenant()` | Resolves the current admin/session tenant (delegates to `lib/auth`). |
| `listClientTenants()` | All non-admin tenants (cached list). |
| `getRetellApiKey(id)` | **Decrypts at most once per 60s**; server-only; only used by Retell client. |
| `invalidateTenant(id)` / `invalidateAllTenants()` | Cache eviction after writes. |

---

## 3. Repository (`lib/repositories/tenantRepository.ts`)

- **Read functions are now thin pass-throughs** to the driver (`getTenantById`, `getTenantByUsername`, `getTenantByEmail`, `getTenantByAgentId`, `listClientTenants`). They remain the single source of truth for persistence and encryption-at-rest, but **no application code calls them for reads anymore** — everything goes through `TenantService`.
- **Write functions are unchanged in behavior** and remain the canonical mutation API: `createTenant`, `updateTenant`, `updateTenantPassword`, `deleteTenant`, `appendCallLog`, `incrementUsedMinutes`. These are still called directly by routes (they are writes, not cached reads) and now pair with `invalidateTenant`/`invalidateAllTenants` so the cache stays consistent.
- The JSON and Postgres drivers (`tenantJsonRepository.ts`, `tenantPostgresRepository.ts`) are untouched — encryption-at-rest and storage semantics are preserved.

---

## 4. Retell client (`lib/retell/client.ts`)

- **Key is no longer read from `tenant.retellApiKey`.** `resolveTenant(tenant)` now calls `getRetellApiKey(tenant.id)` from `TenantService`, which returns the decrypted key (cached, decrypted once per 60s). The `Tenant` object passed in has its key blanked, so the key is never carried on the tenant graph.
- `resolveTenant` is now `async` (it awaits the key lookup). All callers (`listCalls`, `getCall`, `getAgent`, `getClientConfig`, `retellFetch`) were updated to `await resolveTenant(...)`. This fixes a latent bug where `getCall`/`getAgent` previously called `resolveTenant` **without `await`** (synchronously destructuring a `Promise`), which would have thrown at runtime.
- Demo-mode detection (`!retellApiKey`) is unchanged in behavior — a tenant with no key still gets synthetic data.
- Network resiliency (8s `AbortController` timeout, `RetellApiError` mapping) and `no-store` fetch are preserved.

---

## 5. Auth (`lib/auth.ts`)

- `getSessionTenant()` now returns `getTenant(session.id)` from `TenantService` instead of `getTenantById` from the repository. Behavior is identical (same `Tenant` shape, now with `retellApiKey` blanked), but it benefits from the 60s cache and removes a duplicate lookup.
- `getAdminTenant()` similarly routes through the service.
- Login still verifies the password against `tenant.passwordHash` (unchanged). The `Tenant` returned to callers never contains a real Retell key.

---

## 6. Endpoint / module refactors (all routes & signatures preserved)

| File | Change |
|---|---|
| `app/api/auth/login/route.ts` | Replaced the second `getTenantById` with `getTenant` (cached). Removed the redundant repository read; login still validates credentials and issues the same session. |
| `app/api/auth/change-password/route.ts` | `getTenantById` → `getTenant` (cached). Added `invalidateTenant(session.id)` after a successful password change so the cache refreshes. |
| `app/api/webhooks/retell/route.ts` | `getTenantByAgentId` + `getTenantById` → single `getTenantByAgentId` (cached, O(1) agent index). Added `invalidateTenant` after `appendCallLog`/`incrementUsedMinutes` so usage counters stay fresh. Webhook signature verification, idempotency, and response shape are unchanged. |
| `app/api/admin/tenants/route.ts` | `getTenantByUsername` (create) and `listClientTenants` (list) now served from the service (cached). Added `invalidateAllTenants()` after create. Admin list response shape unchanged. |
| `app/api/admin/tenants/[id]/route.ts` | `getTenantById` → `getTenant` (cached) for PATCH/DELETE existence checks. Added `invalidateTenant(id)` after PATCH and DELETE. Re-encryption of a new Retell key still flows through `updateTenant`. |
| `app/api/billing/summary/route.ts` | `getSessionTenant` (now cached) + `updateTenant` write. Added `invalidateTenant` after the lazy billing-cycle roll-forward write. |
| `app/api/billing/payment-method/route.ts` | `getSessionTenant` (cached) + `updateTenant` write. Added `invalidateTenant` after persisting the Paddle customer id. |
| `app/api/admin/reports/monthly/route.ts` | `listClientTenants` now served from the service (cached). Email/report logic unchanged. |
| `app/api/dashboard/metrics/route.ts` | **Removed the duplicate `getTenantById` lookup** — `getSessionTenant()` already returns the full cached tenant, so it is used directly. Removed now-unused `getTenantById` import. |
| `lib/security/passwordSetup.ts` | `getTenantById` → `getTenant` (cached). Added `invalidateTenant` after both the expiry-clear and the successful password-set writes. Token hashing/expiry semantics unchanged. |

**No route paths, HTTP methods, request/response shapes, UI components, or features were modified.**

---

## 7. TypeScript types

- `lib/tenantService.ts` introduces explicit interfaces: `CachedTenant`, `TenantServiceErrorOptions`, and a `TenantServiceError` class (extends `Error`, carries an optional `cause`).
- `getRetellApiKey` return type is explicitly `Promise<string>`.
- All service functions are fully typed against the existing `Tenant` type from `lib/db.ts`; no new `any` was introduced.
- `lib/retell/client.ts` `resolveTenant` is now correctly `async` with a typed return (`{ retellApiKey: string; config: VoicerelyClientConfig; demo: boolean }`).

---

## 8. Error handling & logging improvements

- **Typed errors.** `TenantServiceError` replaces ad-hoc throws; repository failures are wrapped with context (tenant id, lookup key) without leaking internals.
- **Structured logging.** `logTenantAccess` (debug) and `logTenantError` (error) use the existing `lib/security/logger` `newRequestId`/`audit` helpers and redact any key material.
- **No raw upstream body leakage.** The Retell client already maps upstream failures to `RetellApiError`; tenant resolution now follows the same pattern.
- **Graceful degradation preserved.** Demo mode, billing-cycle fallback, and the `emptyMetrics()` zero-payload fallback in `dashboard/metrics` are all intact.

---

## 9. Security posture

- **Retell API keys are decrypted at most once per 60s** and exist only inside the server-side cache and the Retell client — never on the `Tenant` object, never in a session, never in client code.
- **Secondary indexes are in-memory only** and rebuilt from the cached list; they never persist or log key material.
- **Cache entries are process-local** (appropriate for a single serverless instance / single-region deployment). For multi-instance deployments behind a shared data store, the 60s TTL bounds staleness and `invalidateTenant` is called on every mutation; a shared cache (e.g. Redis) can be dropped in later behind the same `getTenant` interface without touching callers.

---

## 10. Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx eslint` on all modified files → **0 errors** (only pre-existing, unrelated unused-import warnings in untouched files).
- All existing API contracts (routes, request/response shapes) and UI remain unchanged.

---

## 11. Files changed

- **Added:** `lib/tenantService.ts`
- **Modified:** `lib/repositories/tenantRepository.ts`, `lib/retell/client.ts`, `lib/auth.ts`, `lib/security/passwordSetup.ts`, `app/api/auth/login/route.ts`, `app/api/auth/change-password/route.ts`, `app/api/webhooks/retell/route.ts`, `app/api/admin/tenants/route.ts`, `app/api/admin/tenants/[id]/route.ts`, `app/api/billing/summary/route.ts`, `app/api/billing/payment-method/route.ts`, `app/api/admin/reports/monthly/route.ts`, `app/api/dashboard/metrics/route.ts`
- **Unchanged (by design):** all UI components, all route paths, `prisma/schema.prisma`, the JSON/Postgres repository drivers, encryption utilities, and every existing feature.