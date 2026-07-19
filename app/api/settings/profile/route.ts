// app/api/settings/profile/route.ts
// Allows a logged-in tenant to update their business profile settings.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { updateTenant } from "@/lib/repositories/tenantRepository";
import { parseBody, safeError } from "@/lib/validation";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  avgBookingValue: z.number().positive("Must be a positive number").max(100_000, "Value seems too high"),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseBody(profileSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: parsed.status });

  try {
    await updateTenant(session.id, { avgBookingValue: parsed.data.avgBookingValue }, session.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = safeError(e);
    return NextResponse.json({ error }, { status });
  }
}