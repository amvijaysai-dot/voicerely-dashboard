// proxy.ts
//
// Edge-level security boundary (Next.js 16 active middleware). Runs before
// (admin)/*, (dashboard)/*, and private /api/* routes are handled.
//
// Responsibilities (defence-in-depth, layered on top of per-route checks):
//   1. Strict Content-Security-Policy with a per-request nonce (Helmet-style).
//   2. Hardened security headers (HSTS, X-Frame-Options, nosniff, Referrer-
//      Policy, Permissions-Policy, Cross-Origin-Opener-Policy).
//   3. CSRF origin validation on all state-mutating requests (EXACT match).
//   4. Authentication/authorization fast-reject for protected routes.
//   5. Lightweight per-IP global API rate limit with standard headers.
//   6. Structured audit logging of security-relevant rejections.

import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/security/session";
import { newRequestId, audit } from "@/lib/security/logger";

/** Builds a strict, nonce-based CSP. `nonce` is unique per request. */
function buildCsp(nonce: string, isDev: boolean): string {
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""} https://cdn.paddle.com https://*.paddle.com;
    style-src 'self' 'nonce-${nonce}' ${isDev ? "'unsafe-inline'" : ""};
    style-src-attr 'unsafe-inline';
    img-src 'self' blob: data: https://*.paddle.com;
    font-src 'self' data:;
    connect-src 'self' https://api.paddle.com https://*.paddle.com https://cdn.paddle.com;
    media-src 'self' blob: data:;
    frame-src 'self' https://*.paddle.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `;
  return csp.replace(/\s{2,}/g, " ").trim();
}

/** Hardened security headers applied to every HTML/document response. */
function securityHeaders(nonce: string, isDev: boolean): Record<string, string> {
  return {
    "Content-Security-Policy": buildCsp(nonce, isDev),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...(isDev
      ? {}
      : {
          // HSTS only in production (assumes HTTPS termination).
          "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
        }),
  };
}

/** Validates the Origin header on state-mutating requests (CSRF defence).
 *  Uses EXACT host matching — a substring check would let
 *  `https://evil.com/http://localhost:3000` bypass the guard. */
function isSafeOrigin(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const origin = req.headers.get("origin");

  // No Origin on same-origin form posts / server-to-server is acceptable.
  if (!origin) return true;
  if (!appUrl) {
    // Can't validate without a configured app URL — allow but flag.
    console.warn("[proxy] NEXT_PUBLIC_APP_URL unset; CSRF origin check relaxed.");
    return true;
  }

  const allowed = new Set<string>([appUrl]);
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000").add("http://localhost:3001");
  }
  // Exact match only — never a prefix/substring match.
  return allowed.has(origin);
}

// ---- Lightweight per-IP global API rate limiter (in-process, Edge-safe) ----
const API_LIMIT = Number(process.env.PROXY_API_LIMIT ?? 1000);
const API_WINDOW_MS = 60_000;
const apiHits = new Map<string, { count: number; start: number }>();

function globalApiRateLimit(ip: string): { limited: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const bucket = apiHits.get(ip);
  if (!bucket || now - bucket.start >= API_WINDOW_MS) {
    apiHits.set(ip, { count: 1, start: now });
    return { limited: false, remaining: API_LIMIT - 1, resetMs: now + API_WINDOW_MS };
  }
  if (bucket.count >= API_LIMIT) {
    return { limited: true, remaining: 0, resetMs: bucket.start + API_WINDOW_MS };
  }
  bucket.count += 1;
  return { limited: false, remaining: API_LIMIT - bucket.count, resetMs: bucket.start + API_WINDOW_MS };
}

export const config = {
  // Public surfaces excluded from auth/CSRF enforcement.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|signup|set-password|api/auth).*)",
  ],
};

export async function proxy(req: NextRequest) {
  const requestId = newRequestId();
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = crypto.randomUUID();

  // --- CSRF: reject state-mutating requests from untrusted origins. ---
  if (!isSafeOrigin(req)) {
    audit(requestId, "proxy.csrf_blocked", {
      success: false,
      error: "invalid_origin",
      level: "warn",
      meta: { origin: req.headers.get("origin") ?? null, path: req.nextUrl.pathname },
    });
    return NextResponse.json({ error: "Forbidden: Invalid origin" }, { status: 403 });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const { pathname } = req.nextUrl;
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isBillingRoute = pathname === "/billing" || pathname.startsWith("/billing/");
  const isDashboardApiRoute =
    pathname.startsWith("/api/dashboard/") ||
    pathname.startsWith("/api/billing/") ||
    pathname.startsWith("/api/calls") ||
    pathname.startsWith("/api/agents") ||
    pathname.startsWith("/api/config/") ||
    pathname.startsWith("/api/settings/") ||
    pathname.startsWith("/api/admin/");
  const isDashboardRoot =
    pathname === "/" ||
    pathname.startsWith("/calls") ||
    pathname.startsWith("/agents") ||
    pathname.startsWith("/metrics") ||
    pathname.startsWith("/settings");

  // --- Global per-IP API rate limit (defence against abuse/scanning). ---
  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = globalApiRateLimit(ip);
    if (rl.limited) {
      audit(requestId, "proxy.api_rate_limited", {
        success: false,
        error: "rate_limited",
        meta: { ip, path: pathname },
      });
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetMs - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(API_LIMIT),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }
  }

  const redirectToLogin = (next: string) => {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  // --- Admin routes ---
  if (isAdminRoute) {
    if (!session) return redirectToLogin(pathname);
    if (!session.isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return applyHeaders(NextResponse.next(), nonce, isDev);
  }

  // --- Billing routes ---
  if (isBillingRoute) {
    if (!session) return redirectToLogin(pathname);
    return applyHeaders(NextResponse.next(), nonce, isDev);
  }

  // --- Protected API routes ---
  if (isDashboardApiRoute) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return applyHeaders(NextResponse.next(), nonce, isDev);
  }

  // --- Main dashboard routes ---
  if (isDashboardRoot) {
    if (!session) return redirectToLogin(pathname);
    return applyHeaders(NextResponse.next(), nonce, isDev);
  }

  // Public assets / other routes: still apply security headers.
  return applyHeaders(NextResponse.next(), nonce, isDev);
}

/** Attaches the nonce + security headers to a response (and forwards the nonce
 *  to the renderer via x-nonce so Next.js / inline scripts can use it). */
function applyHeaders(
  res: NextResponse,
  nonce: string,
  isDev: boolean
): NextResponse {
  const headers = securityHeaders(nonce, isDev);
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  // Forward the nonce so Server Components / inline scripts can opt in.
  res.headers.set("x-nonce", nonce);
  return res;
}
