// lib/security/session.ts
//
// Edge-safe session crypto. Imports ONLY jose + the secret — no next/headers,
// no fs — so it can be used from middleware.ts (Edge runtime) and route
// handlers alike. The AUTH_SECRET is required at module load: a missing or
// empty value throws a fatal error so the app fails fast instead of signing
// tokens with an insecure default.

import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@/lib/auth";

const COOKIE_NAME = "voicerely_session";

const rawSecret = process.env.AUTH_SECRET;
if (!rawSecret) {
  throw new Error(
    "FATAL: AUTH_SECRET is not set. Generate a 32-byte secret (crypto.randomBytes(32).toString('hex')) and add it to .env.local. The app refuses to boot with an insecure signing key."
  );
}
const SECRET = new TextEncoder().encode(rawSecret);

export const SESSION_COOKIE = COOKIE_NAME;

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    id: user.id,
    username: user.username,
    clientName: user.clientName,
    email: user.email ?? "",
    isAdmin: !!user.isAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      id: String(payload.id),
      username: String(payload.username),
      clientName: String(payload.clientName),
      email: payload.email ? String(payload.email) : undefined,
      isAdmin: Boolean(payload.isAdmin),
    };
  } catch {
    return null;
  }
}