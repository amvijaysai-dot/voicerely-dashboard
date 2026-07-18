// app/api/agents/route.ts
//
// Returns the authenticated tenant's real Retell agent configuration(s):
// voice, system prompt, and inbound phone number. Each agent is pulled
// live from Retell's GET /get-agent/{agent_id} via the shared
// server-only wrapper (key stays server-side). Failures per-agent are
// isolated so one bad agent can't 5xx the whole list. Demo tenants
// (no Retell key) get a synthetic profile so the page still renders.

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/auth";
import { getAgent, toAgentView } from "@/lib/retell/client";
import { safeError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentIds = tenant.agentIds ?? [];
  if (agentIds.length === 0) {
    return NextResponse.json({ agents: [] });
  }

  try {
    const agents = await Promise.all(
      agentIds.map(async (agentId) => {
        try {
          const raw = await getAgent(tenant, agentId);
          return toAgentView(raw, raw.agent_id === "agent_demo", tenant.clientName);
        } catch (err) {
          // Isolate per-agent failures (429/5xx/timeout) so the rest load.
          const { error } = safeError(err);
          const { RetellApiError } = await import("@/lib/errors");
          const status =
            err instanceof RetellApiError ? err.status : 502;
          return {
            agentId,
            name: tenant.clientName,
            voice: "—",
            prompt: "",
            phone: "—",
            status: "Idle" as const,
            demo: false,
            error: status === 429 ? "rate_limited" : "unavailable",
          };
        }
      })
    );
    return NextResponse.json({ agents });
  } catch (err) {
    const { status } = safeError(err);
    return NextResponse.json({ error: "Unable to load agents" }, { status });
  }
}
