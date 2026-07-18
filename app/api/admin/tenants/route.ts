// app/api/admin/tenants/route.ts
//
// Super-Admin only. Lists and creates tenants. All data access goes through
// the repository (encryption at rest); input is validated with Zod; failures
// return structured JSON with proper status codes (no raw error leakage).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { listClientTenants, createTenant } from "@/lib/repositories/tenantRepository";
import { getSession, hashPassword } from "@/lib/auth";
import { onboardTenantSchema, parseBody, safeError } from "@/lib/validation";
import type { Tenant } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenants = (await listClientTenants()).map((t) => ({
    id: t.id,
    clientName: t.clientName,
    username: t.username,
    allowedMinutes: t.allowedMinutes,
    usedMinutes: t.usedMinutes,
    perMinuteRate: t.perMinuteRate,
    hasRetellKey: Boolean(t.retellApiKey),
  }));
  return NextResponse.json({ tenants });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseBody(onboardTenantSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) {
    return NextResponse.json(parsed.error, { status: parsed.status });
  }
  const input = parsed.data;

 try {
    const passwordHash = await hashPassword(input.password);
    const tenantId = `tenant_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const tenant: Tenant = {
      id: tenantId,
      clientName: input.clientName,
      username: input.username,
      passwordHash,
      allowedMinutes: input.allowedMinutes,
      usedMinutes: 0,
      perMinuteRate: input.perMinuteRate,
      retellApiKey: input.retellApiKey,
      status: "active",
      isAdmin: false,
      createdAt: new Date().toISOString(),
      agentIds: input.agentId ? [input.agentId] : [],
      billingModel: input.billingModel,
      baseMonthlyFee: input.baseMonthlyFee,
      includedMinutes: input.includedMinutes,
      email: input.email,
    };
    const created = await createTenant(tenant, session.id);
    // Fire-and-forget onboarding email (best-effort; failures are logged, not fatal).
    if (created.email) {
      const { sendOnboardingEmail } = await import("@/lib/email");
      await sendOnboardingEmail({
        to: created.email,
        clientName: created.clientName,
        username: created.username,
        password: input.password,
        loginUrl: `${new URL(req.url).origin}/login`,
      }).catch((e) => {
        console.error("[onboarding-email] failed:", e);
      });
    }
    return NextResponse.json(
      {
        id: created.id,
        clientName: created.clientName,
        username: created.username,
        email: created.email,
      },
      { status: 201 }
    );
  } catch (e) {
    const { error, status } = safeError(e);
    return NextResponse.json({ error }, { status });
  }
}
