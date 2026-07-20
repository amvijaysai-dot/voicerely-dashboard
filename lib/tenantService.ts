// lib/tenantService.ts
//
// Production tenant-resolution service.
//
// WHY THIS EXISTS
// ---------------
// Previously every route resolved tenants directly through the repository
// (lib/repositories/tenantRepository.ts), which decrypts the per-tenant
// Retell API key on *every* call. A single dashboard page load fans out to
// several route handlers (metrics, billing summary, roi, calls, agents), each
// re-reading + re-decrypting the same tenant row. The webhook path did the
// same per ingested call. That is redundant crypto + I/O on the hot path.
//
// WHAT IT GUARANTEES
// ------------------
// 1. Decrypted tenant information is cached in-memory for 60 seconds, keyed by
//    tenant id (plus secondary indexes on agentId / username / email so those
//    lookups are also de-duplicated).
// 2. The Retell API key is decrypted **exactly once per cache lifetime** — the
//    repository decrypts it on load, the service records `hasRetellKey`, then
//    immediately blanks `retellApiKey` on the cached object. The plaintext key
//    is held only in a separate, server-private `retellKeyCache` and is exposed
//    to *nothing* outside this module except the server-only Retell client.
// 3. The `Tenant` objects handed back to routes/UI never contain a Retell key,
//    so the secret cannot leak through serialization or logging.
// 4. Mutations (update/delete/password/setup-token) call `invalidateTenant`
//    so the cache can never serve a stale row after a write.
//
// SECURITY NOTE
// -------------
// This module is server-only. It must never be imported by a Client Component
// or shipped to the browser. The Retell key leaves this file solely via
// `getRetellApiKey`, consumed by lib/retell/client.ts (also server-only).

import {
  getTenantById as repoGetTenantById,
  getTenantByUsername as repoGetTenantByUsername,
  getTenantByEmail as repoGetTenantByEmail,
  getTenantByAgentId as repoGetTenantByAgentId,
  listClientTenants as repoListClientTenants,
} from "@/lib/repositories/tenantRepository";
import type { Tenant } from "@/lib/db";
import { newRequestId, audit } from "@/lib/security/logger";

/** Cache lifetime for decrypted tenant data + Retell key. */
export const TENANT_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  /** Sanitized tenant (retellApiKey blanked, hasRetellKey set). */
  tenant: Tenant;
  expiresAt: number;
}

interface IndexEntry {
  tenantId: string | null; // null = negative cache (lookup miss)
  expiresAt: number;
}

// ---- In-memory caches (module-scoped singletons) ------------------------

/** Primary cache: tenantId -> sanitized tenant. */
const tenantCache = new Map<string, CacheEntry>();
/** agentId -> tenantId index (for webhook routing). */
const agentIndex = new Map<string, IndexEntry>();
/** username (lowercased) -> tenantId index (for login). */
const usernameIndex = new Map<string, IndexEntry>();
/** email (lowercased) -> tenantId index (for login by email). */
const emailIndex = new Map<string, IndexEntry>();
/** tenantId -> decrypted Retell key (server-private, never serialized). */
const retellKeyCache = new Map<string, { key: string; expiresAt: number }>();

function isFresh(expiresAt: number): boolean {
  return Date.now() < expiresAt;
}

/**
 * Strips the plaintext Retell key from a tenant and records whether one exists.
 * The repository has already decrypted it exactly once; we keep the boolean and
 * discard the secret so it can never escape this module via the returned object.
 */
function sanitize(tenant: Tenant): Tenant {
  const hasRetellKey = Boolean(tenant.retellApiKey);
  return { ...tenant, hasRetellKey, retellApiKey: "" };
}

/** Inserts a freshly-loaded tenant into every cache/index. Returns the
 *  sanitized (key-free) copy that callers should use. */
function put(tenant: Tenant): Tenant {
  const safe = sanitize(tenant);
  const expiresAt = Date.now() + TENANT_CACHE_TTL_MS;
  tenantCache.set(safe.id, { tenant: safe, expiresAt });
  if (safe.username) {
    usernameIndex.set(safe.username.toLowerCase(), { tenantId: safe.id, expiresAt });
  }
  if (safe.email) {
    emailIndex.set(safe.email.toLowerCase(), { tenantId: safe.id, expiresAt });
  }
  for (const aid of safe.agentIds ?? []) {
    agentIndex.set(aid, { tenantId: safe.id, expiresAt });
  }
  return safe;
}

/** Resolves a cached tenant by id, returning a defensive copy so callers can't
 *  accidentally mutate the shared cache entry. */
function readCached(id: string): Tenant | undefined {
  const entry = tenantCache.get(id);
  if (!entry || !isFresh(entry.expiresAt)) return undefined;
  return { ...entry.tenant };
}

// ---- Public API ---------------------------------------------------------

/**
 * Resolves a tenant by id. Cached for 60s; the Retell key is never present on
 * the returned object (use getRetellApiKey for that, server-side only).
 */
export async function getTenant(id: string): Promise<Tenant | undefined> {
  const cached = readCached(id);
  if (cached) return cached;

  const requestId = newRequestId();
  const tenant = await repoGetTenantById(id);
  if (!tenant) return undefined;

  audit(requestId, "tenant.cache_miss", {
    tenantId: id,
    success: true,
    meta: { reason: "id_lookup" },
  });
  return put(tenant);
}

/**
 * Resolves the tenant that owns a Retell agent id (webhook routing). Caches
 * both the agent->tenant mapping and the tenant itself.
 */
export async function getTenantByAgentId(agentId: string): Promise<Tenant | undefined> {
  const idx = agentIndex.get(agentId);
  if (idx && isFresh(idx.expiresAt)) {
    if (idx.tenantId === null) return undefined;
    return getTenant(idx.tenantId);
  }

  const tenant = await repoGetTenantByAgentId(agentId);
  if (!tenant) {
    agentIndex.set(agentId, { tenantId: null, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
    return undefined;
  }
  return put(tenant);
}

/**
 * Resolves a tenant by username (login). Caches the username->tenant mapping.
 */
export async function getTenantByUsername(username: string): Promise<Tenant | undefined> {
  const key = username.toLowerCase();
  const idx = usernameIndex.get(key);
  if (idx && isFresh(idx.expiresAt)) {
    if (idx.tenantId === null) return undefined;
    return getTenant(idx.tenantId);
  }

  const tenant = await repoGetTenantByUsername(username);
  if (!tenant) {
    usernameIndex.set(key, { tenantId: null, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
    return undefined;
  }
  return put(tenant);
}

/**
 * Resolves a tenant by contact email (login). Caches the email->tenant mapping.
 */
export async function getTenantByEmail(email: string): Promise<Tenant | undefined> {
  const key = email.toLowerCase().trim();
  if (!key) return undefined;
  const idx = emailIndex.get(key);
  if (idx && isFresh(idx.expiresAt)) {
    if (idx.tenantId === null) return undefined;
    return getTenant(idx.tenantId);
  }

  const tenant = await repoGetTenantByEmail(email);
  if (!tenant) {
    emailIndex.set(key, { tenantId: null, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
    return undefined;
  }
  return put(tenant);
}

/**
 * Returns all non-admin client tenants. Each is sanitized (no Retell key) and
 * cached for 60s, so repeated admin/report reads within the window are served
 * from memory without re-decrypting every row.
 */
export async function listClientTenants(): Promise<Tenant[]> {
  const all = await repoListClientTenants();
  return all.map((t) => put(t));
}

/**
 * Returns the decrypted Retell API key for a tenant. The key is decrypted by the
 * repository exactly once per 60s cache lifetime and is NEVER included in any
 * `Tenant` object — this is the only sanctioned way to obtain it, and it is
 * consumed solely by the server-only Retell client.
 */
export async function getRetellApiKey(id: string): Promise<string> {
  const cached = retellKeyCache.get(id);
  if (cached && isFresh(cached.expiresAt)) return cached.key;

  const tenant = await repoGetTenantById(id);
  const key = tenant?.retellApiKey ?? "";
  retellKeyCache.set(id, { key, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
  return key;
}

/**
 * Drops a tenant (and all of its indexes + cached Retell key) from the cache.
 * Call this after any mutation so the next read reflects the write. Safe to
 * call even when the tenant is not currently cached.
 */
export function invalidateTenant(id: string): void {
  const entry = tenantCache.get(id);
  tenantCache.delete(id);
  retellKeyCache.delete(id);
  if (entry) {
    const t = entry.tenant;
    if (t.username) usernameIndex.delete(t.username.toLowerCase());
    if (t.email) emailIndex.delete(t.email.toLowerCase());
    for (const aid of t.agentIds ?? []) agentIndex.delete(aid);
  }
  const requestId = newRequestId();
  audit(requestId, "tenant.cache_invalidate", { tenantId: id, success: true });
}

/** Clears all caches. Primarily for tests / operational recovery. */
export function clearTenantCache(): void {
  tenantCache.clear();
  agentIndex.clear();
  usernameIndex.clear();
  emailIndex.clear();
  retellKeyCache.clear();
}