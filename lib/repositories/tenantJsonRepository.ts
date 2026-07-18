// lib/repositories/tenantJsonRepository.ts
//
// JSON flat-file implementation of the tenant repository (legacy / dev driver).
// Mirrors the exact same public interface as tenantPostgresRepository.ts so
// the active driver can be swapped via the DATA_DRIVER env flag in
// lib/repositories/tenantRepository.ts. All encryption + audit logging lives
// here, identical to the Postgres variant. Functions are async to keep the
// interface identical to the Postgres driver (callers always `await`).
//
// ⚠️  DEV-ONLY DRIVER WARNING
// This file implements a flat-file JSON storage driver intended ONLY for
// local development and demos. It is NOT safe for concurrent writes: two
// simultaneous webhook calls will produce a read-modify-write race that
// silently corrupts usedMinutes and call logs.
//
// PRODUCTION: set DATA_DRIVER=postgres in your environment. The Postgres
// driver (lib/repositories/tenantPostgresRepository.ts) uses Prisma with
// proper transaction support and is safe for concurrent access.
//
// DO NOT use this driver with real client data or live Retell webhooks.

import {
  readTenantsRaw,
  readCallsRaw,
  mutateTenantsRaw,
  mutateCallsRaw,
  type Tenant,
  type CallLog,
} from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { newRequestId, audit } from "@/lib/security/logger";

// Async write queue — serializes all mutating operations in the JSON driver
// so concurrent webhook calls don't produce a read-modify-write race.
// This is a best-effort safety net for the dev driver only; use Postgres in production.
type QueuedTask = () => Promise<void>;
const writeQueue: QueuedTask[] = [];
let queueRunning = false;

async function enqueue<T>(task: () => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    writeQueue.push(async () => {
      try { resolve(await task()); } catch (e) { reject(e); }
    });
    if (!queueRunning) drainQueue();
  });
}

async function drainQueue() {
  queueRunning = true;
  while (writeQueue.length > 0) {
    const task = writeQueue.shift()!;
    await task();
  }
  queueRunning = false;
}

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
  return enqueue(async () => {
    const requestId = newRequestId();
    let taken = false;
    mutateTenantsRaw((all) => {
      if (all.some((t) => t.username.toLowerCase() === tenant.username.toLowerCase())) {
        taken = true;
        return all;
      }
      // Ensure no other tenant already owns any of the provided agentIds.
      const newIds = tenant.agentIds ?? [];
      if (newIds.length > 0) {
        const conflict = all.find((t) =>
          (t.agentIds ?? []).some((id) => newIds.includes(id))
        );
        if (conflict) {
          throw new Error(`AGENT_ID_CONFLICT:${conflict.id}`);
        }
      }
      return [...all, encryptTenant(tenant)];
    });
    if (taken) {
      audit(requestId, "tenant.create_failed", {
        success: false,
        tenantId: tenant.id,
        userId: actorId,
        error: "username_taken",
      });
      throw new Error("USERNAME_TAKEN");
    }
    audit(requestId, "tenant.create", {
      success: true,
      tenantId: tenant.id,
      userId: actorId,
      meta: { username: tenant.username, clientName: tenant.clientName },
    });
    return tenant;
  });
}

export async function updateTenant(
  id: string,
  patch: Partial<Tenant>,
  actorId?: string
): Promise<Tenant | undefined> {
  return enqueue(async () => {
    const requestId = newRequestId();
    let result: Tenant | undefined;
    mutateTenantsRaw((all) => {
      const idx = all.findIndex((t) => t.id === id);
      if (idx === -1) {
        audit(requestId, "tenant.update_failed", {
          success: false,
          tenantId: id,
          userId: actorId,
          error: "not_found",
        });
        return all;
      }
      const merged: Tenant = { ...all[idx], ...patch };
      // Ensure no other tenant already owns any of the new agentIds.
      const newIds = merged.agentIds ?? [];
      if (newIds.length > 0) {
        const conflict = all.find(
          (t, i) => i !== idx && (t.agentIds ?? []).some((aid) => newIds.includes(aid))
        );
        if (conflict) {
          throw new Error(`AGENT_ID_CONFLICT:${conflict.id}`);
        }
      }
      const encrypted = encryptTenant(merged);
      result = decryptTenant(merged);
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
      const next = [...all];
      next[idx] = encrypted;
      return next;
    });
    return result;
  });
}

export async function deleteTenant(
  id: string,
  actorId?: string
): Promise<boolean> {
  return enqueue(async () => {
    const requestId = newRequestId();
    let deleted = false;
    let target: Tenant | undefined;
    mutateTenantsRaw((all) => {
      target = all.find((t) => t.id === id);
      const next = all.filter((t) => t.id !== id);
      deleted = next.length !== all.length;
      return next;
    });
    if (!deleted) {
      audit(requestId, "tenant.delete_failed", {
        success: false,
        tenantId: id,
        userId: actorId,
        error: "not_found",
      });
      return false;
    }
    audit(requestId, "tenant.delete", {
      success: true,
      tenantId: id,
      userId: actorId,
      meta: { username: target?.username, clientName: target?.clientName },
    });
    return true;
  });
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
  return enqueue(async () => {
    const requestId = newRequestId();
    let outcome: { log: CallLog; inserted: boolean } = { log, inserted: true };
    mutateCallsRaw((map) => {
      const existing = map[log.tenantId] ?? [];
      const dup = existing.find((c) => c.callId === log.callId);
      if (dup) {
        audit(requestId, "calllog.append_skipped", {
          success: true,
          tenantId: log.tenantId,
          userId: actorId,
          meta: { callId: log.callId, reason: "duplicate" },
        });
        outcome = { log: dup, inserted: false };
        return map;
      }
      const next = { ...map, [log.tenantId]: [...existing, log] };
      audit(requestId, "calllog.append", {
        success: true,
        tenantId: log.tenantId,
        userId: actorId,
        meta: { callId: log.callId, agentId: log.agentId, duration: log.totalDurationSeconds },
      });
      return next;
    });
    return outcome;
  });
}

/** Adds call minutes to a tenant's locally tracked used-minute balance. */
export async function incrementUsedMinutes(
  tenantId: string,
  minutes: number,
  actorId?: string
): Promise<void> {
  return enqueue(async () => {
    const requestId = newRequestId();
    let found = true;
    mutateTenantsRaw((all) => {
      const idx = all.findIndex((t) => t.id === tenantId);
      if (idx === -1) {
        found = false;
        return all;
      }
      const updated: Tenant = {
        ...all[idx],
        usedMinutes: all[idx].usedMinutes + minutes,
      };
      audit(requestId, "tenant.minutes_increment", {
        success: true,
        tenantId,
        userId: actorId,
        meta: { addedMinutes: minutes, usedMinutes: updated.usedMinutes },
      });
      const next = [...all];
      next[idx] = encryptTenant(updated);
      return next;
    });
    if (!found) {
      audit(requestId, "tenant.minutes_failed", {
        success: false,
        tenantId,
        userId: actorId,
        error: "not_found",
      });
    }
  });
}

/** Reads a tenant's full call-log history (live ingested records). */
export async function listCallLogs(tenantId: string): Promise<CallLog[]> {
  const map = readCallsRaw();
  return map[tenantId] ?? [];
}
