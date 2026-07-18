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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|signup|api/auth).*)"],
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const { pathname } = req.nextUrl;
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isBillingRoute = pathname === "/billing" || pathname.startsWith("/billing/");
  const isDashboardApiRoute = pathname.startsWith("/api/dashboard/");
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
