// lib/repositories/tenantJsonRepository.ts
//
// JSON flat-file implementation of the tenant repository (legacy / dev driver).
// Mirrors the exact same public interface as tenantPostgresRepository.ts so
// the active driver can be swapped via the DATA_DRIVER env flag in
// lib/repositories/tenantRepository.ts. All encryption + audit logging lives
// here, identical to the Postgres variant. Functions are async to keep the
// interface identical to the Postgres driver (callers always `await`).

import {
  readTenantsRaw,
  writeTenantsRaw,
  readCallsRaw,
  writeCallsRaw,
  type Tenant,
  type CallLog,
} from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { newRequestId, audit } from "@/lib/security/logger";

function encryptTenant(t: Tenant): Tenant {
  return { ...t, retellApiKey: encryptSecret(t.retellApiKey) };
}

function decryptTenant(t: Tenant): Tenant {
  return { ...t, retellApiKey: decryptSecret(t.retellApiKey) };
}

export async function listTenants(): Promise<Tenant[]> {
  return readTenantsRaw().map(decryptTenant);
}

export async function listClientTenants(): Promise<Tenant[]> {
  const all = readTenantsRaw().map(decryptTenant);
  return all.filter((t) => !t.isAdmin);
}

export async function getTenantById(id: string): Promise<Tenant | undefined> {
  const t = readTenantsRaw().find((x) => x.id === id);
  return t ? decryptTenant(t) : undefined;
}

export async function getTenantByUsername(
  username: string
): Promise<Tenant | undefined> {
  const u = username.toLowerCase();
  const t = readTenantsRaw().find((x) => x.username.toLowerCase() === u);
  return t ? decryptTenant(t) : undefined;
}

/** Resolves a tenant by their contact email (case-insensitive). Used so clients
 *  can sign in with the email address captured at onboarding. */
export async function getTenantByEmail(
  email: string
): Promise<Tenant | undefined> {
  const e = email.toLowerCase().trim();
  if (!e) return undefined;
  const t = readTenantsRaw().find(
    (x) => x.email?.toLowerCase() === e
  );
  return t ? decryptTenant(t) : undefined;
}

export async function createTenant(
  tenant: Tenant,
  actorId?: string
): Promise<Tenant> {
  const requestId = newRequestId();
  const all = readTenantsRaw();
  if (all.some((t) => t.username.toLowerCase() === tenant.username.toLowerCase())) {
    audit(requestId, "tenant.create_failed", {
      success: false,
      tenantId: tenant.id,
      userId: actorId,
      error: "username_taken",
    });
    throw new Error("USERNAME_TAKEN");
  }
  const encrypted = encryptTenant(tenant);
  all.push(encrypted);
  writeTenantsRaw(all);
  audit(requestId, "tenant.create", {
    success: true,
    tenantId: tenant.id,
    userId: actorId,
    meta: { username: tenant.username, clientName: tenant.clientName },
  });
  return tenant;
}

export async function updateTenant(
  id: string,
  patch: Partial<Tenant>,
  actorId?: string
): Promise<Tenant | undefined> {
  const requestId = newRequestId();
  const all = readTenantsRaw();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) {
    audit(requestId, "tenant.update_failed", {
      success: false,
      tenantId: id,
      userId: actorId,
      error: "not_found",
    });
    return undefined;
  }
  const merged: Tenant = { ...all[idx], ...patch };
  all[idx] = encryptTenant(merged);
  writeTenantsRaw(all);
  const meta: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (k === "retellApiKey") meta.retellApiKey = "rotated";
    else meta[k] = (patch as Record<string, unknown>)[k];
  }
  audit(requestId, "tenant.update", {
    success: true,
    tenantId: id,
    userId: actorId,
    meta,
  });
  return decryptTenant(merged);
}

export async function deleteTenant(
  id: string,
  actorId?: string
): Promise<boolean> {
  const requestId = newRequestId();
  const all = readTenantsRaw();
  const target = all.find((t) => t.id === id);
  const next = all.filter((t) => t.id !== id);
  if (next.length === all.length) {
    audit(requestId, "tenant.delete_failed", {
      success: false,
      tenantId: id,
      userId: actorId,
      error: "not_found",
    });
    return false;
  }
  writeTenantsRaw(next);
  audit(requestId, "tenant.delete", {
    success: true,
    tenantId: id,
    userId: actorId,
    meta: { username: target?.username, clientName: target?.clientName },
  });
  return true;
}

/** Resolves the tenant that owns a given Retell agent id (webhook routing). */
export async function getTenantByAgentId(agentId: string): Promise<Tenant | undefined> {
  const t = readTenantsRaw().find((x) => (x.agentIds ?? []).includes(agentId));
  return t ? decryptTenant(t) : undefined;
}

/** Appends a call record to the tenant's call-log history (idempotent by callId). */
export async function appendCallLog(
  log: CallLog,
  actorId?: string
): Promise<{ log: CallLog; inserted: boolean }> {
  const requestId = newRequestId();
  const map = readCallsRaw();
  const existing = map[log.tenantId] ?? [];
  const dup = existing.find((c) => c.callId === log.callId);
  if (dup) {
    audit(requestId, "calllog.append_skipped", {
      success: true,
      tenantId: log.tenantId,
      userId: actorId,
      meta: { callId: log.callId, reason: "duplicate" },
    });
    return { log: dup, inserted: false };
  }
  const next = [...existing, log];
  map[log.tenantId] = next;
  writeCallsRaw(map);
  audit(requestId, "calllog.append", {
    success: true,
    tenantId: log.tenantId,
    userId: actorId,
    meta: { callId: log.callId, agentId: log.agentId, duration: log.totalDurationSeconds },
  });
  return { log, inserted: true };
}

/** Adds call minutes to a tenant's locally tracked used-minute balance. */
export async function incrementUsedMinutes(
  tenantId: string,
  minutes: number,
  actorId?: string
): Promise<void> {
  const requestId = newRequestId();
  const all = readTenantsRaw();
  const idx = all.findIndex((t) => t.id === tenantId);
  if (idx === -1) {
    audit(requestId, "tenant.minutes_failed", {
      success: false,
      tenantId,
      userId: actorId,
      error: "not_found",
    });
    return;
  }
  const updated: Tenant = {
    ...all[idx],
    usedMinutes: all[idx].usedMinutes + minutes,
  };
  all[idx] = encryptTenant(updated);
  writeTenantsRaw(all);
  audit(requestId, "tenant.minutes_increment", {
    success: true,
    tenantId,
    userId: actorId,
    meta: { addedMinutes: minutes, usedMinutes: updated.usedMinutes },
  });
}

/** Reads a tenant's full call-log history (live ingested records). */
export async function listCallLogs(tenantId: string): Promise<CallLog[]> {
  const map = readCallsRaw();
  return map[tenantId] ?? [];
}
