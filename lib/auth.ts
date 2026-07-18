// lib/auth.ts
//
// Multi-tenant auth: bcrypt password hashing + signed JWT session cookies.
// The session carries only the tenant id + admin flag — never the Retell key
// or password. Route handlers call getSession() to resolve the logged-in
// tenant and scope all data to it.
//
// JWT signing/verification lives in lib/security/session.ts (edge-safe, with
// a fail-fast AUTH_SECRET check). Tenant lookups go through the repository
// (lib/repositories/tenantRepository.ts), which handles encryption at rest.

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getTenantById } from "@/lib/repositories/tenantRepository";
import type { Tenant } from "@/lib/db";
import { SESSION_COOKIE, createSession, verifySession } from "@/lib/security/session";

export interface SessionUser {
  id: string;
  username: string;
  clientName: string;
  email?: string;
  isAdmin: boolean;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export { createSession, verifySession, SESSION_COOKIE };

/** Reads + verifies the session from the request cookies (server-side). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Loads the full tenant row for the logged-in session (incl. retellApiKey). */
export async function getSessionTenant(): Promise<Tenant | null> {
  const session = await getSession();
  if (!session) return null;
  return (await getTenantById(session.id)) ?? null;
}