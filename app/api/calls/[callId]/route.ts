// app/api/calls/[callId]/route.ts
//
// Single call + transcript + recording configuration for the detail drawer.
// Retell key stays server-side; only the client-safe view is returned.
// Scoped to the logged-in tenant (401 if unauthenticated).

import { NextRequest, NextResponse } from "next/server";
import { getCall, getClientConfig } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { getSessionTenant } from "@/lib/auth";
import { safeError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { callId } = await params;

  try {
    const config = await getClientConfig(tenant);

    // Best-effort single-call lookup. An invalid/placeholder Retell key or a
    // missing record must not crash the route with a 5xx — return a clean 404
    // so the client drawer can show a "call not found" state.
    let raw: Awaited<ReturnType<typeof getCall>>;
    try {
      raw = await getCall(tenant, callId);
    } catch {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const call = transformCallToClientView(raw, config);

    return NextResponse.json({
      call,
      transcript: raw.transcript_object ?? [],
      recording: raw.recording_url
        ? { url: raw.recording_url, hasRecording: true }
        : { url: null, hasRecording: false },
      summary: raw.call_analysis?.call_summary ?? null,
      clientId: tenant.id,
    });
  } catch (err) {
    const { error, status } = safeError(err);
    return NextResponse.json({ error }, { status });
  }
}