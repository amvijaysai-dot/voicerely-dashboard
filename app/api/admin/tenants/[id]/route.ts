// app/api/admin/tenants/[id]/route.ts
//
// Per-tenant admin operations: PATCH (update allocation/status, re-encrypt a
// new Retell key) and DELETE (offboard). All access goes through the
// repository (encryption at rest); admin session is enforced; failures emit
// structured JSON with proper status codes.

import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { getTenant, invalidateTenant } from "@/lib/tenantService";
import { updateTenant, deleteTenant } from "@/lib/repositories/tenantRepository";
import { updateTenantSchema, parseBody, safeError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await getTenant(id);
  if (!existing || existing.isAdmin) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const parsed = parseBody(updateTenantSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) {
    return NextResponse.json(parsed.error, { status: parsed.status });
  }
  const input = parsed.data;

  try {
    const patch: Record<string, unknown> = {};
    if (input.clientName !== undefined) patch.clientName = input.clientName;
    if (input.allowedMinutes !== undefined) patch.allowedMinutes = input.allowedMinutes;
    if (input.perMinuteRate !== undefined) patch.perMinuteRate = input.perMinuteRate;
    if (input.status !== undefined) patch.status = input.status;
    // Re-encrypt only when a new key is supplied; otherwise keep the existing.
    if (input.retellApiKey !== undefined) patch.retellApiKey = input.retellApiKey;
    // Primary Retell agent tracking id -> stored as agentIds[0].
    if (input.agentId !== undefined) patch.agentIds = input.agentId ? [input.agentId] : [];
    // Billing model fields — persisted so plan edits actually save.
    if (input.billingModel !== undefined) patch.billingModel = input.billingModel;
    if (input.baseMonthlyFee !== undefined) patch.baseMonthlyFee = input.baseMonthlyFee;
    if (input.includedMinutes !== undefined) patch.includedMinutes = input.includedMinutes;

    const updated = await updateTenant(id, patch, session.id);
    if (!updated) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    invalidateTenant(id);
    return NextResponse.json({
      id: updated.id,
      clientName: updated.clientName,
      allowedMinutes: updated.allowedMinutes,
      perMinuteRate: updated.perMinuteRate,
      status: updated.status,
      hasRetellKey: Boolean(updated.retellApiKey),
      billingModel: updated.billingModel,
      baseMonthlyFee: updated.baseMonthlyFee,
      includedMinutes: updated.includedMinutes,
    });
  } catch (e) {
    const { error, status } = safeError(e);
    return NextResponse.json({ error }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await getTenant(id);
  if (!existing || existing.isAdmin) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const removed = await deleteTenant(id, session.id);
  if (!removed) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  invalidateTenant(id);
  return NextResponse.json({ ok: true, id });
}