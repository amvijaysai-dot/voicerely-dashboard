// lib/repositories/tenantPostgresRepository.ts
//
// PostgreSQL (Prisma) implementation of the tenant repository — the production
// data driver. Exposes the EXACT same public interface as
// tenantJsonRepository.ts so the active driver can be swapped via the
// DATA_DRIVER env flag in lib/repositories/tenantRepository.ts.
//
// The Retell API key is stored encrypted (AES-256-GCM via lib/security/crypto)
// in the dedicated RetellApiKey table; the Tenant row references it 1:1. All
// mutating operations emit the same structured audit logs as the JSON driver.

import { prisma } from "@/lib/prisma";
import type { Tenant, CallLog } from "@/lib/db";
import type { RetellCallRecord } from "@/lib/retell/types";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { newRequestId, audit } from "@/lib/security/logger";

type TenantRow = {
  id: string;
  clientName: string;
  username: string;
  passwordHash: string;
  allowedMinutes: number;
  usedMinutes: number;
  perMinuteRate: number;
  avgBookingValue?: number; // Optional to handle Prisma type caching
  status: string;
  isAdmin: boolean;
  createdAt: Date;
  agentIds: string[];
  retellApiKey: { encrypted: string } | null;
  billingModel: string | null;
  baseMonthlyFee: number | null;
  includedMinutes: number | null;
  passwordSetupTokenHash: string | null;
  passwordSetupExpiresAt: Date | null;
  billingCycleStart: Date | null;
  billingCycleEnd: Date | null;
};

function toTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row.id as string,
    clientName: row.clientName as string,
    username: row.username as string,
    passwordHash: row.passwordHash as string,
    allowedMinutes: row.allowedMinutes as number,
    usedMinutes: row.usedMinutes as number,
    perMinuteRate: row.perMinuteRate as number,
    avgBookingValue: (row.avgBookingValue as number) ?? 210,
    retellApiKey: row.retellApiKey ? decryptSecret((row.retellApiKey as { encrypted: string }).encrypted) : "",
    status: (row.status as Tenant["status"]) ?? "active",
    isAdmin: row.isAdmin as boolean,
    createdAt: (row.createdAt as Date).toISOString(),
    agentIds: (row.agentIds as string[]) ?? [],
    billingModel: row.billingModel as Tenant["billingModel"] | undefined,
    baseMonthlyFee: row.baseMonthlyFee as number | undefined,
    includedMinutes: row.includedMinutes as number | undefined,
    email: row.email as string | undefined,
    passwordSetupTokenHash: (row.passwordSetupTokenHash as string | null) ?? null,
    passwordSetupExpiresAt: row.passwordSetupExpiresAt
      ? (row.passwordSetupExpiresAt as Date).toISOString()
      : null,
    billingCycleStart: row.billingCycleStart
      ? (row.billingCycleStart as Date).toISOString()
      : null,
    billingCycleEnd: row.billingCycleEnd
      ? (row.billingCycleEnd as Date).toISOString()
      : null,
  };
}

export async function listTenants(): Promise<Tenant[]> {
  const rows = await prisma.tenant.findMany({ include: { retellApiKey: true } });
  return rows.map(toTenant);
}

export async function listClientTenants(): Promise<Tenant[]> {
  const rows = await prisma.tenant.findMany({
    where: { isAdmin: false },
    include: { retellApiKey: true },
  });
  return rows.map(toTenant);
}

export async function getTenantById(id: string): Promise<Tenant | undefined> {
  const row = await prisma.tenant.findUnique({
    where: { id },
    include: { retellApiKey: true },
  });
  return row ? toTenant(row) : undefined;
}

export async function getTenantByUsername(
  username: string
): Promise<Tenant | undefined> {
  const row = await prisma.tenant.findUnique({
    where: { username },
    include: { retellApiKey: true },
  });
  return row ? toTenant(row) : undefined;
}

/** Resolves a tenant by their contact email (case-insensitive). Lets clients
 *  sign in with the email captured at onboarding. */
export async function getTenantByEmail(
  email: string
): Promise<Tenant | undefined> {
  const e = email.toLowerCase().trim();
  if (!e) return undefined;
  const row = await prisma.tenant.findFirst({
    where: { email: { equals: e } },
    include: { retellApiKey: true },
  });
  return row ? toTenant(row) : undefined;
}

export async function createTenant(
  tenant: Tenant,
  actorId?: string
): Promise<Tenant> {
  const requestId = newRequestId();
  const existing = await prisma.tenant.findUnique({
    where: { username: tenant.username },
  });
  if (existing) {
    audit(requestId, "tenant.create_failed", {
      success: false,
      tenantId: tenant.id,
      userId: actorId,
      error: "username_taken",
    });
    throw new Error("USERNAME_TAKEN");
  }

  // Ensure no other tenant owns any of these agentIds.
  if (tenant.agentIds && tenant.agentIds.length > 0) {
    const conflict = await prisma.tenant.findFirst({
      where: {
        agentIds: { hasSome: tenant.agentIds },
        id: { not: tenant.id },
      },
    });
    if (conflict) throw new Error(`AGENT_ID_CONFLICT:${conflict.id}`);
  }

  const created = await prisma.tenant.create({
    data: {
      id: tenant.id,
      clientName: tenant.clientName,
      username: tenant.username,
      passwordHash: tenant.passwordHash,
      allowedMinutes: tenant.allowedMinutes,
      usedMinutes: tenant.usedMinutes,
      perMinuteRate: tenant.perMinuteRate,
      avgBookingValue: tenant.avgBookingValue ?? 210,
      status: tenant.status,
      isAdmin: tenant.isAdmin ?? false,
      createdAt: new Date(tenant.createdAt),
      billingModel: tenant.billingModel,
      baseMonthlyFee: tenant.baseMonthlyFee,
      includedMinutes: tenant.includedMinutes,
      email: tenant.email,
      passwordSetupTokenHash: tenant.passwordSetupTokenHash ?? null,
      passwordSetupExpiresAt: tenant.passwordSetupExpiresAt
        ? new Date(tenant.passwordSetupExpiresAt)
        : null,
      billingCycleStart: tenant.billingCycleStart
        ? new Date(tenant.billingCycleStart)
        : null,
      billingCycleEnd: tenant.billingCycleEnd
        ? new Date(tenant.billingCycleEnd)
        : null,
      retellApiKey: tenant.retellApiKey
        ? { create: { encrypted: encryptSecret(tenant.retellApiKey) } }
        : undefined,
    },
    include: { retellApiKey: true },
  });

  audit(requestId, "tenant.create", {
    success: true,
    tenantId: created.id,
    userId: actorId,
    meta: { username: created.username, clientName: created.clientName },
  });
  return toTenant(created as TenantRow);
}

export async function updateTenant(
  id: string,
  patch: Partial<Tenant>,
  actorId?: string
): Promise<Tenant | undefined> {
  const requestId = newRequestId();
  const current = await prisma.tenant.findUnique({
    where: { id },
    include: { retellApiKey: true },
  });
  if (!current) {
    audit(requestId, "tenant.update_failed", {
      success: false,
      tenantId: id,
      userId: actorId,
      error: "not_found",
    });
    return undefined;
  }

  const data: Record<string, unknown> = {};
  if (patch.clientName !== undefined) data.clientName = patch.clientName;
  if (patch.allowedMinutes !== undefined) data.allowedMinutes = patch.allowedMinutes;
  if (patch.usedMinutes !== undefined) data.usedMinutes = patch.usedMinutes;
  if (patch.perMinuteRate !== undefined) data.perMinuteRate = patch.perMinuteRate;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.agentIds !== undefined) data.agentIds = patch.agentIds;
  if (patch.billingModel !== undefined) data.billingModel = patch.billingModel;
  if (patch.baseMonthlyFee !== undefined) data.baseMonthlyFee = patch.baseMonthlyFee;
  if (patch.includedMinutes !== undefined) data.includedMinutes = patch.includedMinutes;
  if (patch.passwordSetupTokenHash !== undefined)
    data.passwordSetupTokenHash = patch.passwordSetupTokenHash ?? null;
  if (patch.passwordSetupExpiresAt !== undefined)
    data.passwordSetupExpiresAt = patch.passwordSetupExpiresAt
      ? new Date(patch.passwordSetupExpiresAt)
      : null;
  if (patch.billingCycleStart !== undefined)
    data.billingCycleStart = patch.billingCycleStart
      ? new Date(patch.billingCycleStart)
      : null;
  if (patch.billingCycleEnd !== undefined)
    data.billingCycleEnd = patch.billingCycleEnd
      ? new Date(patch.billingCycleEnd)
      : null;

  // passwordHash is intentionally excluded — use updateTenantPassword instead.

  if (patch.retellApiKey !== undefined) {
    const encrypted = encryptSecret(patch.retellApiKey);
    if (current.retellApiKey) {
      data.retellApiKey = { update: { encrypted } };
    } else {
      data.retellApiKey = { create: { encrypted } };
    }
  }

  // Ensure updated agentIds don't conflict with other tenants.
  if (patch.agentIds && patch.agentIds.length > 0) {
    const conflict = await prisma.tenant.findFirst({
      where: {
        agentIds: { hasSome: patch.agentIds },
        id: { not: id },
      },
    });
    if (conflict) throw new Error(`AGENT_ID_CONFLICT:${conflict.id}`);
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data,
    include: { retellApiKey: true },
  });

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
  return toTenant(updated);
}

export async function deleteTenant(
  id: string,
  actorId?: string
): Promise<boolean> {
  const requestId = newRequestId();
  const target = await prisma.tenant.findUnique({
    where: { id },
    select: { username: true, clientName: true },
  });
  if (!target) {
    audit(requestId, "tenant.delete_failed", {
      success: false,
      tenantId: id,
      userId: actorId,
      error: "not_found",
    });
    return false;
  }
  await prisma.tenant.delete({ where: { id } });
  audit(requestId, "tenant.delete", {
    success: true,
    tenantId: id,
    userId: actorId,
    meta: { username: target.username, clientName: target.clientName },
  });
  return true;
}

/** Resolves the tenant that owns a given Retell agent id (webhook routing). */
export async function getTenantByAgentId(agentId: string): Promise<Tenant | undefined> {
  const row = await prisma.tenant.findFirst({
    where: { agentIds: { has: agentId } },
    include: { retellApiKey: true },
  });
  return row ? toTenant(row) : undefined;
}

/** Appends a call record to the tenant's call-log history (idempotent by callId). */
export async function appendCallLog(
  log: CallLog,
  actorId?: string
): Promise<{ log: CallLog; inserted: boolean }> {
  const requestId = newRequestId();
  const existing = await prisma.callLog.findUnique({
    where: { tenantId_callId: { tenantId: log.tenantId, callId: log.callId } },
  });
  if (existing) {
    audit(requestId, "calllog.append_skipped", {
      success: true,
      tenantId: log.tenantId,
      userId: actorId,
      meta: { callId: log.callId, reason: "duplicate" },
    });
    return { log: existing, inserted: false };
  }
  const created = await prisma.callLog.create({ data: log });
  audit(requestId, "calllog.append", {
    success: true,
    tenantId: log.tenantId,
    userId: actorId,
    meta: { callId: log.callId, agentId: log.agentId, duration: log.totalDurationSeconds },
  });
  return { log: created, inserted: true };
}

/** Adds call minutes to a tenant's locally tracked used-minute balance. */
export async function incrementUsedMinutes(
  tenantId: string,
  minutes: number,
  actorId?: string
): Promise<void> {
  const requestId = newRequestId();
  const current = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, usedMinutes: true },
  });
  if (!current) {
    audit(requestId, "tenant.minutes_failed", {
      success: false,
      tenantId,
      userId: actorId,
      error: "not_found",
    });
    return;
  }
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { usedMinutes: { increment: minutes } },
  });
  audit(requestId, "tenant.minutes_increment", {
    success: true,
    tenantId,
    userId: actorId,
    meta: { addedMinutes: minutes, usedMinutes: updated.usedMinutes },
  });
}

/** Converts a stored CallLog to a RetellCallRecord shape for unified processing. */
function callLogToRetellRecord(log: CallLog): RetellCallRecord {
  const failed = Boolean(log.disconnectionReason);
  return {
    call_id: log.callId,
    agent_id: log.agentId,
    call_status: failed ? "error" : "ended",
    disconnection_reason: log.disconnectionReason ?? undefined,
    start_timestamp: new Date(log.createdAt).getTime(),
    end_timestamp: new Date(log.createdAt).getTime() + log.totalDurationSeconds * 1000,
    duration_seconds: log.totalDurationSeconds,
    from_number: undefined,
    to_number: undefined,
    recording_url: log.audioUrl || undefined,
    transcript: log.transcript,
    transcript_object: [],
    call_analysis: {
      call_successful: !failed,
      user_sentiment: log.sentiment as "Positive" | "Neutral" | "Negative" | undefined,
    },
  };
}

/** Reads a tenant's full call-log history (live ingested records). */
export async function listCallLogs(tenantId: string): Promise<CallLog[]> {
  return prisma.callLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

/** Reads a tenant's call history as RetellCallRecord shapes (for dashboard/metrics). */
export async function listCallRecords(tenantId: string): Promise<RetellCallRecord[]> {
  const logs = await listCallLogs(tenantId);
  return logs.map(callLogToRetellRecord);
}

/** Safely updates ONLY the password hash for a tenant. The hash must already
 *  be bcrypt-hashed by the caller (lib/auth.ts hashPassword). This function
 *  deliberately does NOT accept raw passwords — only pre-hashed values. */
export async function updateTenantPassword(
  id: string,
  bcryptHash: string,
  actorId?: string
): Promise<boolean> {
  const requestId = newRequestId();
  try {
    await prisma.tenant.update({
      where: { id },
      data: { passwordHash: bcryptHash },
    });
    audit(requestId, "tenant.password_updated", {
      success: true,
      tenantId: id,
      userId: actorId,
    });
    return true;
  } catch (e) {
    audit(requestId, "tenant.password_update_failed", {
      success: false,
      tenantId: id,
      userId: actorId,
      error: String(e),
    });
    return false;
  }
}
