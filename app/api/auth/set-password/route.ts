// app/api/auth/set-password/route.ts
//
// Consumes a one-time, expiring password-setup link (minted on onboarding or
// reset). The raw token arrives as a query param in the emailed link; we hash
// it and compare to the stored hash, set the new password, and invalidate the
// token in a single shot (single-use). We never return the raw token.

import { NextRequest, NextResponse } from "next/server";
import { consumePasswordSetupToken } from "@/lib/security/passwordSetup";
import { setPasswordSchema, parseBody, safeError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = parseBody(setPasswordSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) {
    return NextResponse.json(parsed.error, { status: parsed.status });
  }
  const { tenantId, token, password } = parsed.data;
  try {
    const result = await consumePasswordSetupToken(tenantId, token, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = safeError(e);
    return NextResponse.json({ error }, { status });
  }
}
