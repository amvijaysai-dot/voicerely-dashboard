// lib/retell/client.ts
//
// SERVER-ONLY Retell SDK wrapper. Per dashboard.md §5, this is the *only*
// module that ever imports the Retell API key. It must never be imported by
// any client component or shipped to the browser. Route handlers under
// app/api/ are the sole consumers.
//
// MULTI-TENANT: the Retell key + billing config now come from the logged-in
// tenant's DB row (see lib/db.ts), NOT process.env. Each tenant has their own
// independent Retell account, so all data is scoped to that tenant's key.

import type { RetellCallRecord, RetellAgent } from "./types";
import type { VoicerelyClientConfig } from "../billing/types";
import type { Tenant } from "../db";
import { RetellApiError } from "@/lib/errors";

const RETELL_API_BASE = "https://api.retellai.com";
const RETELL_TIMEOUT_MS = 8000;

/**
 * Resolve the Retell API key + Voicerely client config for a tenant.
 * `tenant` is the authenticated tenant's DB row (retellApiKey + billing).
 * Demo mode kicks in only when the tenant has no Retell key configured.
 */
/**
 * Builds the unified Voicerely client config for a tenant. Both the demo and
 * non-demo (real Retell key) pathways funnel through here so the plan type and
 * allowance are derived identically from the tenant's billing configuration —
 * never hardcoded to "fixed_allowance".
 *
 * - `voicerely_plan_type` mirrors the tenant's `billingModel` (hybrid /
 *   metered_maintenance / pure_per_minute). Demo falls back to "fixed_allowance".
 * - `allocated_minutes` accepts a real `0` (no `|| null` collapse). For hybrid
 *   it maps to `includedMinutes`; otherwise to `allowedMinutes`. `null` means
 *   truly unlimited / pay-as-you-go (only when the tenant has no allowance set).
 * - `voicerely_per_minute_rate` uses the tenant's `perMinuteRate` (demo default 0.18).
 */
function buildClientConfig(tenant: Tenant, demo: boolean): VoicerelyClientConfig {
  const billingModel = tenant.billingModel;
  // Map the tenant's billing model onto the plan-type vocabulary exposed to
  // the client config. Hybrid => fixed allowance (base fee + included minutes);
  // metered_maintenance / pure_per_minute => pay as you go; unset => default.
  const planType: VoicerelyClientConfig["voicerely_plan_type"] = !billingModel
    ? "fixed_allowance"
    : billingModel === "hybrid"
    ? "fixed_allowance"
    : "pay_as_you_go";

  // Hybrid plans allocate their `includedMinutes`; all other models use the
  // tenant's `allowedMinutes`. Explicitly accept 0 (do NOT collapse to null).
  const allocatedMinutes =
    billingModel === "hybrid"
      ? (tenant.includedMinutes ?? tenant.allowedMinutes ?? 0)
      : (tenant.allowedMinutes ?? 0);

  return {
    clientId: tenant.id,
    displayName: tenant.clientName,
    voicerely_plan_type: planType,
    voicerely_per_minute_rate: tenant.perMinuteRate || (demo ? 0.18 : 0),
    allocated_minutes: allocatedMinutes,
    currency: "USD",
    // Cycle window is persisted on the tenant row (see lib/billing/cycle.ts).
    // Resolved + rolled-forward lazily by the caller (billing summary route)
    // so it always reflects the true current period, never "today".
    billingCycleStart: tenant.billingCycleStart ?? new Date().toISOString().slice(0, 10),
  };
}

function resolveTenant(tenant: Tenant): {
  retellApiKey: string;
  config: VoicerelyClientConfig;
  demo: boolean;
} {
  const retellApiKey = tenant.retellApiKey ?? "";

  // Demo mode: tenant has no Retell key. Synthetic config so the dashboard
  // is navigable without a live backend. Real proxy path used once a key is set.
  if (!retellApiKey) {
    return { retellApiKey: "", config: buildClientConfig(tenant, true), demo: true };
  }

  return { retellApiKey, config: buildClientConfig(tenant, false), demo: false };
}

async function retellFetch(
  tenant: Tenant,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const { retellApiKey } = resolveTenant(tenant);

  // Network resiliency: bound every upstream call to an 8s execution timeout.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RETELL_TIMEOUT_MS);

  try {
    const res = await fetch(`${RETELL_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${retellApiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      // Retell data is per-request and tenant-scoped; never cache at the edge.
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      // Map upstream failures to clean, client-safe errors (no raw body leak).
      if (res.status === 429) {
        throw new RetellApiError(429, "Upstream rate limit reached. Please retry shortly.");
      }
      if (res.status >= 500) {
        throw new RetellApiError(502, "Retell service is temporarily unavailable.");
      }
      throw new RetellApiError(502, "Failed to retrieve data from Retell.");
    }

    return res.json();
  } catch (err) {
    if (err instanceof RetellApiError) throw err;
    // AbortError => our timeout fired; anything else => network failure.
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Retell request timed out."
        : "Unable to reach Retell.";
    throw new RetellApiError(504, message);
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetches ALL calls for a tenant by following Retell's pagination_key chain. */
async function paginateAllCalls(
  tenant: Tenant,
  maxPages = 20
): Promise<RetellCallRecord[]> {
  const all: RetellCallRecord[] = [];
  let paginationKey: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams();
    params.set("limit", "1000");
    if (paginationKey) params.set("pagination_key", paginationKey);
    const query = `?${params.toString()}`;
    const data = (await retellFetch(tenant, `/list-calls${query}`)) as {
      calls?: RetellCallRecord[];
      pagination_key?: string;
    };
    const batch = data.calls ?? [];
    all.push(...batch);
    paginationKey = data.pagination_key;
    pages++;
    // Safety cap: never loop forever on a corrupt pagination_key response.
    if (batch.length === 0) break;
  } while (paginationKey && pages < maxPages);

  return all;
}

/** Proxies Retell's GET /list-calls and returns the raw records. */
export async function listCalls(
  tenant: Tenant,
  opts: { limit?: number; pagination_key?: string } = {}
): Promise<RetellCallRecord[]> {
  const { demo } = resolveTenant(tenant);
  if (demo) return generateDemoCalls(opts.limit ?? 50);

  // When called without a specific pagination_key (e.g. from the billing/metrics
  // routes that need ALL calls for a cycle), paginate through the full history.
  // When called with an explicit pagination_key, honour it directly (single page).
  if (!opts.pagination_key) {
    return paginateAllCalls(tenant);
  }

  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  params.set("pagination_key", opts.pagination_key);
  const query = `?${params.toString()}`;
  const data = (await retellFetch(tenant, `/list-calls${query}`)) as {
    calls?: RetellCallRecord[];
  };
  return data.calls ?? [];
}

/** Retrieves a single raw call record (includes transcript + recording url). */
export async function getCall(
  tenant: Tenant,
  callId: string
): Promise<RetellCallRecord> {
  const { demo } = resolveTenant(tenant);
  if (demo) return generateDemoCall(callId);
  return (await retellFetch(tenant, `/get-call/${encodeURIComponent(callId)}`)) as RetellCallRecord;
}

/** Retrieves a single raw agent record (voice / prompt / phone). */
export async function getAgent(
  tenant: Tenant,
  agentId: string
): Promise<RetellAgent> {
  const { demo } = resolveTenant(tenant);
  if (demo) return generateDemoAgent(agentId, tenant);
  return (await retellFetch(
    tenant,
    `/get-agent/${encodeURIComponent(agentId)}`
  )) as RetellAgent;
}

/** Normalized agent view the dashboard renders (client-safe, no raw key). */
export interface VoicerelyAgentView {
  agentId: string;
  name: string;
  voice: string;
  prompt: string;
  phone: string;
  status: "Active" | "Idle";
  demo: boolean;
}

/** Builds the client-safe agent view from a raw Retell agent record. */
export function toAgentView(
  raw: RetellAgent,
  demo: boolean,
  fallbackName: string
): VoicerelyAgentView {
  const engine = raw.response_engine ?? {};
  const prompt =
    (typeof engine === "object" && engine !== null && "llm" in engine
      ? (engine as { llm?: { prompt?: string } }).llm?.prompt
      : undefined) ??
    (typeof raw.prompt === "string" ? raw.prompt : undefined) ??
    "";
  const voice =
    raw.voice_id ??
    (typeof engine === "object" && engine !== null && "voice_id" in engine
      ? (engine as { voice_id?: string }).voice_id
      : undefined) ??
    "";
  const phone =
    raw.inbound_phone_number ?? raw.phone_number ?? "";
  return {
    agentId: raw.agent_id,
    name: raw.agent_name ?? fallbackName,
    voice: voice || "Default",
    prompt: prompt,
    phone: phone || "+1 (800) 555-0100",
    status: "Active",
    demo,
  };
}

/** Exposes the resolved Voicerely client config for a tenant. */
export async function getClientConfig(
  tenant: Tenant
): Promise<VoicerelyClientConfig> {
  return resolveTenant(tenant).config;
}

// ---- Demo-mode data (used only when no Retell API key is configured) ----

function seeded(seed: number): () => number {
  let n = seed;
  return () => {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    return n / 0x7fffffff;
  };
}

function generateDemoCalls(limit: number): RetellCallRecord[] {
  const rand = seeded(42);
  const count = Math.min(limit, 64);
  const now = Date.now();
  const calls: RetellCallRecord[] = [];
  for (let i = 0; i < count; i++) {
    const dayOffset = Math.floor(rand() * 30);
    const start = now - dayOffset * 86_400_000 - Math.floor(rand() * 86_400_000);
    const duration = 30 + Math.floor(rand() * 600);
    const failed = rand() < 0.15;
    calls.push({
      call_id: `demo_${i}`,
      agent_id: "agent_demo",
      agent_name: i % 2 === 0 ? "Sales Agent" : "Support Agent",
      call_status: failed ? "error" : "ended",
      disconnection_reason: failed ? "error" : undefined,
      start_timestamp: start,
      end_timestamp: start + duration * 1000,
      duration_seconds: duration,
      from_number: `+1555${String(1000 + Math.floor(rand() * 8999))}`,
      to_number: "+18005550100",
      ...(failed ? {} : { recording_url: `https://recordings.example.com/${i}.mp3` }),
      transcript: "",
      transcript_object: [],
      call_analysis: {
        call_successful: !failed,
        user_sentiment: failed ? "Negative" : "Positive",
        call_summary: failed ? undefined : "Routine call handled successfully.",
      },
    });
  }
  return calls;
}

function generateDemoAgent(agentId: string, tenant: Tenant): RetellAgent {
  return {
    agent_id: agentId,
    agent_name: tenant.clientName ? `${tenant.clientName} Voice Agent` : "Primary Voice Agent",
    voice_id: "11labs-Adrian",
    response_engine: {
      llm: {
        model: "gpt-4o-mini",
        prompt:
          "You are the Voicerely voice assistant for a dental and vet clinic. " +
          "Greet the caller by name when known, verify their identity using the " +
          "last 4 digits of their phone number, then classify intent " +
          "(billing, support, scheduling, or general info). Pull the relevant " +
          "record, summarize options, and confirm the caller's choice. End with " +
          "a polite sign-off. Never invent facts not present in the retrieved data.",
      },
    },
    inbound_phone_number: "+1 (800) 555-0100",
  };
}

function generateDemoCall(callId: string): RetellCallRecord {
  const start = Date.now() - 3_600_000;
  return {
    call_id: callId,
    agent_id: "agent_demo",
    agent_name: "Sales Agent",
    call_status: "ended",
    start_timestamp: start,
    end_timestamp: start + 272_000,
    duration_seconds: 272,
    from_number: "+15551234800",
    to_number: "+18005550100",
    recording_url: `https://recordings.example.com/${callId}.mp3`,
    transcript: "",
    transcript_object: [
      { role: "agent", content: "Thanks for calling Voicerely, how can I help?", timestamp_ms: start, sentiment: "Positive" },
      { role: "user", content: "I'd like to review my current plan.", timestamp_ms: start + 4000, sentiment: "Neutral" },
      { role: "agent", content: "Absolutely, let me pull that up for you.", timestamp_ms: start + 9000, sentiment: "Positive" },
    ],
    call_analysis: {
      call_successful: true,
      user_sentiment: "Positive",
      call_summary: "Customer inquired about plan details.",
    },
  };
}
