// app/api/auth/login/route.ts
//
// Credentials login. Validates input with Zod, verifies the tenant's bcrypt
// password against the repository, and sets a signed session cookie (jose).
// The cookie carries only the tenant id + admin flag — never the key/password.
// All auth outcomes are emitted as structured audit logs (brute-force signal).

import { NextRequest, NextResponse } from "next/server";
import {
  getTenantByUsername,
  getTenantByEmail,
} from "@/lib/repositories/tenantRepository";
import { verifyPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { loginSchema, parseBody } from "@/lib/validation";
import { newRequestId, audit } from "@/lib/security/logger";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60_000; // 1 minute

export async function POST(req: NextRequest) {
  const requestId = newRequestId();

  // Brute-force protection: cap login attempts per IP.
  const rl = await rateLimit("login", clientIp(req), LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (rl.limited) {
    const retryAfter = Math.ceil((rl.resetMs - Date.now()) / 1000);
    audit(requestId, "auth.login_rate_limited", {
      success: false,
      error: "rate_limited",
      meta: { ip: clientIp(req) },
    });
    return NextResponse.json(
      { error: "Too many login attempts. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(LOGIN_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const parsed = parseBody(loginSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) {
    audit(requestId, "auth.login_validation_failed", {
      success: false,
      error: "invalid_request_body",
      meta: parsed.error.fields,
    });
    return NextResponse.json(parsed.error, { status: parsed.status });
  }
  const { username, password } = parsed.data;

  // Accept either a plain username (e.g. "admin") or the client's email address.
  let tenant = await getTenantByUsername(username);
  if (!tenant) tenant = await getTenantByEmail(username);

  if (!tenant || !(await verifyPassword(password, tenant.passwordHash))) {
    audit(requestId, "auth.login_failed", {
      success: false,
      tenantId: tenant?.id,
      userId: tenant?.id,
      error: "invalid_credentials",
      meta: { username },
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSession({
    id: tenant.id,
    username: tenant.username,
    clientName: tenant.clientName,
    email: tenant.email,
    isAdmin: !!tenant.isAdmin,
  });

  audit(requestId, "auth.login", {
    success: true,
    tenantId: tenant.id,
    userId: tenant.id,
    meta: { isAdmin: !!tenant.isAdmin },
  });

  const res = NextResponse.json({
    id: tenant.id,
    username: tenant.username,
    clientName: tenant.clientName,
    email: tenant.email,
    isAdmin: !!tenant.isAdmin,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}