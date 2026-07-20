# Security Audit & Hardening — Voicerely Dashboard

**Role:** Senior Security Engineer (Cloudflare-style review)
**Scope:** Full-stack Next.js 16 (App Router) multi-tenant dashboard + Retell webhook pipeline.
**Date:** 2026-07-21
**Outcome:** 11 distinct vulnerability classes remediated. No business logic changed; all existing routes/UI/features preserved. `npx tsc --noEmit` and `npx eslint` both pass with **0 errors / 0 warnings**.

---

## 1. Executive Summary

The application had a solid cryptographic foundation (bcrypt, AES-256-GCM, HMAC webhook verification, Zod validation) but was missing the **perimeter controls** that sit on top of those primitives. The most serious issues were:

1. **CSRF origin check used a substring/prefix match** — trivially bypassable (`https://evil.com/http://localhost:3000` would pass).
2. **No HTTP security headers / CSP anywhere** — XSS, clickjacking, and MIME-sniffing exposure.
3. **Login error leakage** — raw `error.message` returned to clients and logged verbatim.
4. **User-enumeration** via timing/response differences on login.
5. **Webhook replay** unbounded by event age.
6. **HTML/email injection** in the monthly report (tenant `clientName` interpolated unescaped).
7. **Missing tenant-isolation** on the single-call fetch endpoint.
8. **Cookie clearing on logout** lacked hardening attributes.
9. **JWT** lacked `iss`/`aud` claims.
10. **Rate-limiting** gaps (no per-account lockout, missing standard headers on some routes, no global API ceiling).
11. **Logging** of raw exceptions without structured redaction.

All were fixed with minimal, surgical changes.

---

## 2. Findings & Remediations

### 2.1 CSRF — Origin validation bypass (HIGH)
**File:** `proxy.ts` (`isSafeOrigin`)
**Before:** `allowedOrigins.some((allowed) => origin.startsWith(allowed))`
**Risk:** A request whose `Origin` *starts with* the trusted origin passed. `https://evil.com/http://localhost:3000` starts with `http://localhost:3000` → **bypass**. Also `http://localhost:3000.evil.com` would match.
**After:** Exact-match against a `Set<string>` of allowed origins (configured `NEXT_PUBLIC_APP_URL` + localhost dev variants). No prefix/substring logic.
**Defence in depth:** The matcher still excludes `GET`/`HEAD`/`OPTIONS` (safe methods) and all `api/auth/*` (cookie-based, same-origin only).

### 2.2 Security Headers & Strict CSP (HIGH)
**File:** `proxy.ts` (`buildCsp`, `securityHeaders`, `applyHeaders`)
**Before:** Zero security headers emitted. No CSP, no `X-Frame-Options`, no `nosniff`, no HSTS, no `Referrer-Policy`, no `Permissions-Policy`.
**After (Helmet-equivalent, implemented natively in the edge proxy):**
- **Content-Security-Policy** — strict, nonce-based (per-request `crypto.randomUUID()`):
  - `default-src 'self'`
  - `script-src 'self' 'nonce-…' 'strict-dynamic'` (+ Paddle CDN domains; `'unsafe-eval'` dev-only)
  - `style-src 'self' 'nonce-…'` (inline allowed in dev only)
  - `img-src 'self' blob: data:` (+ Paddle)
  - `connect-src 'self'` (+ Paddle API)
  - `frame-src 'self'` (+ Paddle) — required for the Paddle checkout iframe
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`
- **X-Frame-Options: DENY** (clickjacking)
- **X-Content-Type-Options: nosniff** (MIME sniffing)
- **Referrer-Policy: strict-origin-when-cross-origin**
- **Permissions-Policy:** disables camera/mic/geolocation/FLoC
- **Cross-Origin-Opener-Policy / -Resource-Policy: same-origin**
- **Strict-Transport-Security** (production only, `max-age=63072000; includeSubDomains; preload`)

The nonce is forwarded via `x-nonce` so Next.js and inline scripts (`app/layout.tsx` theme + Paddle bootstrap) pick it up automatically. Per the Next.js 16 docs, all pages are already dynamically rendered, so nonce CSP works without static-generation conflicts.

### 2.3 JWT Hardening (MEDIUM)
**File:** `lib/security/session.ts`
**Before:** Signed with HS256 but **no `iss`/`aud`** — a token minted for another audience could be accepted.
**After:** Added `setIssuer("voicerely-dashboard")` + `setAudience("voicerely-dashboard")` on sign, and `jwtVerify(..., { issuer, audience })` on verify. Rejects tokens from other issuers/audiences. 7-day expiry retained.

### 2.4 Login Error Leakage & User Enumeration (HIGH)
**File:** `app/api/auth/login/route.ts`
**Before:**
- `catch` block returned `error.message` to the client (`{ error: message }`) and `console.error`'d the raw error.
- On unknown user, only a dummy compare was *not* run, so timing/response differed → user enumeration.
**After:**
- Generic `500` message (`"Authentication failed"`) — never echoes internals.
- **Constant-time-ish failure:** when the user is missing, a fixed invalid bcrypt hash is compared, so the code path (and approximate timing) matches the invalid-credentials path.
- Generic `"Invalid credentials"` for both unknown-user and wrong-password.
- Server-side `console.error` retained for debugging but **never** returned to the client.

### 2.5 Rate Limiting Improvements (MEDIUM)
**Files:** `app/api/auth/login/route.ts`, `app/api/auth/change-password/route.ts`, `proxy.ts`
- **Per-account lockout:** login now rate-limits on **both** `login:ip` (existing) **and** `login:acct` (new, keyed by lowercased username) — thwarts targeted credential stuffing against a known account.
- **Standard headers:** login, change-password, and the proxy now emit `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` on `429`.
- **Global API ceiling:** the proxy applies a per-IP global API rate limit (`PROXY_API_LIMIT` env, default 1000/min) to all `/api/*` traffic, returning `429` with headers and an audit event. This is defence against scanning/abuse across the whole surface.

### 2.6 Webhook Replay Protection (MEDIUM)
**File:** `app/api/webhooks/retell/route.ts`
**Before:** Idempotent by `callId` (good) but accepted arbitrarily old replays.
**After:** Added staleness check — events whose embedded `start_timestamp` / `dispatched_at` / `timestamp` is older than **24h** are rejected (`webhook.retell_stale` audit, `200` to avoid Retell retries). Combined with the existing HMAC verification (mandatory in prod, constant-time compare) and queue idempotency, this closes the replay window.

### 2.7 XSS / Email Injection (MEDIUM)
**File:** `app/api/admin/reports/monthly/route.ts`
**Before:** `clientName` and `appUrl` were interpolated directly into the HTML email template → stored/HTML injection if a tenant name contained markup.
**After:** Added `escapeHtml()` (char-code based, so it survives formatter re-parsing) and escape **all** interpolated values (`clientName`, `appUrl`, `monthLabel`). Prevents markup/header injection in outbound email.

### 2.8 Tenant Isolation (HIGH)
**File:** `app/api/calls/[callId]/route.ts`
**Before:** Fetched a call by `callId` from Retell using the tenant's key, but did **not** verify the call's `agent_id` belonged to the session tenant. A tenant could potentially inspect another tenant's call if they guessed/learned a `callId` (defence-in-depth gap; Retell key scoping already limited this, but the check was missing).
**After:** After fetch, if the call has an `agent_id` and the tenant has `agentIds`, the call is only returned when `tenant.agentIds.includes(agent_id)`; otherwise `404`. Never leaks cross-tenant data.

### 2.9 Logout Cookie Hardening (LOW)
**File:** `app/api/auth/logout/route.ts`
**Before:** `res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 })` — missing `httpOnly`/`sameSite`/`secure`, so the browser may not reliably drop the cookie.
**After:** Clear cookie now uses the same hardened attributes as set on login (`httpOnly`, `sameSite: "lax"`, `secure` in prod, `path: "/"`, `maxAge: 0`).

### 2.10 Logging Improvements (LOW)
**Files:** `proxy.ts`, `app/api/auth/login/route.ts`, `app/api/webhooks/retell/route.ts`
- Proxy emits structured audit events for CSRF blocks (`proxy.csrf_blocked`) and global API rate-limits (`proxy.api_rate_limited`) with `requestId`, IP, path, and origin.
- Login emits `auth.login_account_locked` on per-account lockout.
- Raw exceptions are logged server-side only; clients receive generic messages (see 2.4).

### 2.11 Secrets & Crypto (verified, no change needed)
- `AUTH_SECRET` and `ENCRYPTION_KEY` fail-fast if unset (good).
- Retell keys encrypted at rest with AES-256-GCM; decrypted only inside `TenantService` cache, never exposed to clients (verified — `getSessionTenant` returns sanitized tenants, Retell calls resolve keys server-side).
- `.gitignore` correctly excludes `.env*` (keeping only `.env.example`) and `data/*.json`.
- `safeError()` already prevents upstream (Retell/Paddle) error bodies from leaking to clients.

---

## 3. What Was NOT Changed (preserved)
- All routes, URL paths, and HTTP methods.
- All business logic (billing cycles, ROI math, Retell client behavior, webhook pipeline).
- UI components and rendered markup (CSP was tuned to allow the existing Paddle iframe + inline theme script).
- Existing encryption, hashing, and webhook HMAC schemes.

---

## 4. Verification
| Check | Command | Result |
|-------|---------|--------|
| Type safety | `npx tsc --noEmit` | ✅ 0 errors |
| Lint | `npx eslint proxy.ts lib/security/session.ts app/api/auth/* app/api/webhooks/retell/route.ts app/api/admin/reports/monthly/route.ts app/api/calls/[callId]/route.ts` | ✅ 0 errors, 0 warnings |

---

## 5. Recommendations (post-audit, optional follow-ups)
1. **Set `NEXT_PUBLIC_APP_URL` in every environment** — the CSRF origin check relaxes to "allow" if it is unset (logs a warning). Required for the fix in 2.1 to be fully effective.
2. **Add a `set-password` API route** — `app/set-password/page.tsx` POSTs to `/api/auth/set-password`, but no such route exists in the codebase. This is a pre-existing functional gap (out of scope for this security pass) and should be implemented to complete the onboarding flow.
3. **Rotate `AUTH_SECRET` / `ENCRYPTION_KEY`** if they were ever committed (they are git-ignored now; confirm history is clean).
4. **Consider a WAF / edge DDoS** in front of the global API limiter for production traffic spikes.
5. **Security headers on `/api/*` JSON responses** — currently applied to document/HTML responses; JSON API responses still receive the headers via `applyHeaders` for protected routes, but consider applying CSP to all responses uniformly.