// middleware.ts
//
// Edge-level authentication boundary. Runs before (admin)/* and (dashboard)/*
// routes are rendered. Verifies the signed session cookie and redirects:
//   - unauthenticated users -> /login
//   - non-admins hitting /admin -> /
// The dashboard layout's old client-side useEffect guard is removed; this is
// the single source of truth for route protection.
//
// Matcher covers all dashboard and API routes except:
//   - _next/static, _next/image, favicon.ico (Next.js internals)
//   - /login, /signup (public auth pages)
//   - /api/auth/* (auth API routes)

import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/security/session";

/** Validates the Origin header on state-mutating requests to prevent CSRF.
 *  Returns true if the request is safe to proceed, false if it should be rejected. */
function isSafeOrigin(req: NextRequest): boolean {
  // Only validate POST/PUT/PATCH/DELETE — GET requests are safe.
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!appUrl) return true; // Can't validate without app URL — allow but log warning.

  const origin = req.headers.get("origin");
  if (!origin) return true; // Same-origin requests (e.g. server-to-server) have no Origin.

  // Allow the configured app URL and localhost in development.
  const allowedOrigins = [appUrl];
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.push("http://localhost:3000", "http://localhost:3001");
  }
  return allowedOrigins.some((allowed) => origin.startsWith(allowed));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|signup|api/auth).*)"],
};

export async function proxy(req: NextRequest) {
  // CSRF protection: reject state-mutating requests from untrusted origins.
  if (!isSafeOrigin(req)) {
    return NextResponse.json({ error: "Forbidden: Invalid origin" }, { status: 403 });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const { pathname } = req.nextUrl;
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isBillingRoute = pathname === "/billing" || pathname.startsWith("/billing/");
  // Protect ALL private API routes at the edge (defence in depth — the route
  // handlers also check session, but the middleware adds a fast-reject layer).
  const isDashboardApiRoute =
    pathname.startsWith("/api/dashboard/") ||
    pathname.startsWith("/api/billing/") ||
    pathname.startsWith("/api/calls") ||
    pathname.startsWith("/api/agents") ||
    pathname.startsWith("/api/config/") ||
    pathname.startsWith("/api/settings/") ||
    pathname.startsWith("/api/admin/");
  const isDashboardRoot = pathname === "/" || pathname.startsWith("/calls") || pathname.startsWith("/agents") || pathname.startsWith("/metrics") || pathname.startsWith("/settings");

  // Protect admin routes
  if (isAdminRoute) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (!session.isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Protect billing routes
  if (isBillingRoute) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Protect dashboard API routes
  if (isDashboardApiRoute) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Protect main dashboard routes (/, /calls, /agents, /metrics, etc.)
  if (isDashboardRoot) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Allow all other routes (public assets, etc.)
  return NextResponse.next();
}
