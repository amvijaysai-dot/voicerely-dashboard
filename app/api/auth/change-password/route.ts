// app/api/auth/change-password/route.ts
// Allows a logged-in tenant to change their own password.
// Requires: currentPassword (verified), newPassword (min 8 chars).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getTenantById, updateTenantPassword } from "@/lib/repositories/tenantRepository";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { parseBody, safeError } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts per IP per 15 minutes.
  const rl = await rateLimit("change-password", clientIp(req as unknown as Request), 5, 15 * 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many attempts. Please wait." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseBody(changePasswordSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: parsed.status });

  const { currentPassword, newPassword } = parsed.data;

  try {
    const tenant = await getTenantById(session.id);
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const valid = await verifyPassword(currentPassword, tenant.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: "New password must be different from current password" }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await updateTenantPassword(session.id, passwordHash, session.id);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = safeError(e);
    return NextResponse.json({ error }, { status });
  }
}
