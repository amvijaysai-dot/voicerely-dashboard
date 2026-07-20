// lib/security/passwordSetup.ts
//
// One-time, expiring password-setup tokens for tenant onboarding and resets.
// The token is a high-entropy random string sent ONLY inside a setup link.
// What we persist is a SHA-256 hash of the token (never the raw token), so a
// data leak of the store cannot be used to set a password. The token is
// single-use and expires after PASSWORD_SETUP_TTL_MS (default 24h).
//
// The raw token is shown to the user exactly once (in the emailed link). After
// use (or expiry) the hash is cleared so the link cannot be replayed.

import crypto from "node:crypto";
import { getTenant, invalidateTenant } from "@/lib/tenantService";
import { updateTenant } from "@/lib/repositories/tenantRepository";
import { hashPassword } from "@/lib/auth";

const PASSWORD_SETUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SetupToken {
  raw: string; // sent in the link, shown once
  hash: string; // persisted
  expiresAt: string; // ISO
}

/** Mints a new setup token (raw + hash + expiry). Persists the hash on the tenant. */
export async function issuePasswordSetupToken(
  tenantId: string,
  actorId?: string
): Promise<SetupToken> {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_SETUP_TTL_MS).toISOString();
  await updateTenant(
    tenantId,
    { passwordSetupTokenHash: hash, passwordSetupExpiresAt: expiresAt },
    actorId
  );
  return { raw, hash, expiresAt };
}

export interface ConsumeResult {
  ok: boolean;
  error?: string;
}

/**
 * Validates a raw token against the stored hash, checks expiry, and — if valid —
 * sets the new password and immediately invalidates the token (single use).
 */
export async function consumePasswordSetupToken(
  tenantId: string,
  rawToken: string,
  newPassword: string
): Promise<ConsumeResult> {
  const tenant = await getTenant(tenantId);
  if (!tenant) return { ok: false, error: "Tenant not found" };

  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
  if (!tenant.passwordSetupTokenHash || tenant.passwordSetupTokenHash !== hash) {
    return { ok: false, error: "Invalid or already-used setup link" };
  }
  if (!tenant.passwordSetupExpiresAt || Date.now() > Date.parse(tenant.passwordSetupExpiresAt)) {
    // Clear the stale token so it can't be reused later.
    await updateTenant(tenantId, {
      passwordSetupTokenHash: null,
      passwordSetupExpiresAt: null,
    });
    invalidateTenant(tenantId);
    return { ok: false, error: "This setup link has expired" };
  }

  const passwordHash = await hashPassword(newPassword);
  await updateTenant(tenantId, {
    passwordHash,
    passwordSetupTokenHash: null, // single-use: invalidate immediately
    passwordSetupExpiresAt: null,
  });
  invalidateTenant(tenantId);
  return { ok: true };
}
