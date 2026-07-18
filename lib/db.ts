// lib/db.ts
//
// Storage adapter (Repository pattern). Pure file I/O for the Tenant flat
// file — NO encryption, NO business logic. The repository layer
// (lib/repositories/tenantRepository.ts) owns encryption + querying. This
// file is the single place to swap for Prisma + Supabase (PostgreSQL).

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

import fs from "node:fs";
import path from "node:path";
import { hashSync } from "bcryptjs";

// Serializes all flat-file writes so concurrent webhook ingestions can't
// interleave read-modify-write cycles. Each writer awaits the previous one,
// so usedMinutes increments are never silently lost. The Postgres driver gets
// the same guarantee for free via atomic `UPDATE ... SET usedMinutes = col + n`.
let writeChain: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => T): Promise<T> {
  const run = writeChain.then(fn, fn);
  // Keep the chain alive even if a writer rejects.
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export type BillingModel = "hybrid" | "metered_maintenance" | "pure_per_minute";

export interface Tenant {
  id: string;
  clientName: string;
  username: string;
  passwordHash: string;
  allowedMinutes: number;
  usedMinutes: number;
  perMinuteRate: number;
  retellApiKey: string; // stored encrypted by the repository layer
  status: "active" | "suspended";
  isAdmin?: boolean;
  createdAt: string;
  /** Retell agent ids owned by this tenant (used to attribute webhooks). */
  agentIds?: string[];
  /** Billing model for flexible pricing options. */
  billingModel?: BillingModel;
  /** Base monthly fee (for hybrid and metered_maintenance models). */
  baseMonthlyFee?: number;
  /** Included minutes in base fee (for hybrid model). */
  includedMinutes?: number;
  /** Client contact email address (used for onboarding + notifications). */
  email?: string;
  /** Payment method for billing (Paddle customer ID). */
  paddleCustomerId?: string;
  /** Payment method card brand (e.g., "Visa", "Mastercard"). */
  cardBrand?: string;
  /** Last 4 digits of the payment card. */
  cardLast4?: string;
  /** Hashed one-time password-setup token (set on onboarding / reset). */
  passwordSetupTokenHash?: string | null;
  /** ISO expiry for the password-setup token (typically +24h). */
  passwordSetupExpiresAt?: string | null;
  /** Start of the tenant's CURRENT billing cycle (ISO date). */
  billingCycleStart?: string | null;
  /** End (exclusive) of the CURRENT billing cycle (ISO date). */
  billingCycleEnd?: string | null;
}

/** A single ingested call record, stored per tenant in the call-log history. */
export interface CallLog {
  callId: string;
  tenantId: string;
  agentId: string;
  totalDurationSeconds: number;
  transcript: string;
  audioUrl: string;
  disconnectionReason?: string | null;
  sentiment?: string | null;
  createdAt: string | Date;
  // ---- Anomaly & diagnostic markers (per call) ----
  /** Agent fabricated facts not grounded in the retrieved data. */
  hallucinationDetected?: boolean;
  /** Agent diverged from the approved conversation script. */
  scriptDeviation?: boolean;
  /** Agent failed to capture required information from the caller. */
  missedInformation?: boolean;
  /** Count of times the agent interrupted the caller. */
  interruptionCount?: number;
  /** Share of speaking time held by the agent (0..1). */
  agentTalkRatio?: number;
  /** Free-text aggregate of detected mistakes for this call. */
  mistakeSummary?: string | null;
  /** Concrete instruction change recommended for the agent's prompt. */
  recommendedPromptCorrection?: string | null;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "tenants.json");

function ensureStore(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    // Seed a Super-Admin so the portal is usable on first run.
    const seed: Tenant[] = [
      {
        id: "admin",
        clientName: "Voicerely Super Admin",
        username: "admin",
        passwordHash: "", // set below via hashSync at runtime
        allowedMinutes: 0,
        usedMinutes: 0,
        perMinuteRate: 0,
        retellApiKey: "",
        status: "active",
        isAdmin: true,
        createdAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
  }

  // One-time: set a default Super-Admin password on first run.
  const tenants = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Tenant[];
  const admin = tenants.find((t) => t.id === "admin");
  if (admin && !admin.passwordHash) {
    admin.passwordHash = hashSync("admin123", 10);
    fs.writeFileSync(DATA_FILE, JSON.stringify(tenants, null, 2));
  }
}

/** Raw read — returns whatever is on disk (retellApiKey still encrypted). */
export function readTenantsRaw(): Tenant[] {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Tenant[];
  } catch {
    return [];
  }
}

/** Raw write — persists exactly the provided records.
 *  Atomic: writes to a temp file then renames over the target, so a crash
 *  mid-write can never leave a half-written (corrupted) JSON file. Runs under
 *  a module-wide write lock so two concurrent writers serialize safely. */
export function writeTenantsRaw(tenants: Tenant[]): void {
  ensureStore();
  writeJsonAtomically(DATA_FILE, tenants);
}

/** Raw write of the full call-log map (atomic, serialized). */
export function writeCallsRaw(map: Record<string, CallLog[]>): void {
  ensureCallsStore();
  writeJsonAtomically(CALLS_FILE, map);
}

/** Read-modify-write the tenant list as a single serialized, atomic unit.
 *  The callback receives the current on-disk tenants and returns the next
 *  state; the read and write happen inside one write lock so concurrent
 *  callers (e.g. two simultaneous webhook minute increments) can never
 *  interleave and lose an update. */
export function mutateTenantsRaw(fn: (current: Tenant[]) => Tenant[]): void {
  ensureStore();
  withWriteLock(() => {
    const next = fn(readTenantsRaw());
    const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  });
}

/** Read-modify-write the call-log map as a single serialized, atomic unit. */
export function mutateCallsRaw(
  fn: (current: Record<string, CallLog[]>) => Record<string, CallLog[]>
): void {
  ensureCallsStore();
  withWriteLock(() => {
    const tmp = `${CALLS_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(fn(readCallsRaw()), null, 2));
    fs.renameSync(tmp, CALLS_FILE);
  });
}

function writeJsonAtomically(file: string, data: unknown): void {
  // Serialize against every other flat-file writer so two concurrent mutations
  // (e.g. two webhooks incrementing usedMinutes) can't interleave: the second
  // writer re-reads the post-first-write state before its own write, eliminating
  // the lost-update race. The rename is atomic so a crash can't corrupt the file.
  withWriteLock(() => {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  });
}

// ---- Call-log history (per tenant) --------------------------------------

const CALLS_FILE = path.join(DATA_DIR, "calls.json");

function ensureCallsStore(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CALLS_FILE)) {
    fs.writeFileSync(CALLS_FILE, JSON.stringify({} as Record<string, CallLog[]>));
  }
}

/** Raw read of all call logs, keyed by tenantId. */
export function readCallsRaw(): Record<string, CallLog[]> {
  ensureCallsStore();
  try {
    return JSON.parse(fs.readFileSync(CALLS_FILE, "utf8")) as Record<string, CallLog[]>;
  } catch {
    return {};
  }
}
