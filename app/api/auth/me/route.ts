// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getSession, getSessionTenant } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null }, { status: 200 });
  const tenant = await getSessionTenant();
  return NextResponse.json({
    user: {
      id: session.id,
      username: session.username,
      clientName: session.clientName,
      email: session.email,
      isAdmin: session.isAdmin,
      avgBookingValue: tenant?.avgBookingValue ?? 210,
    }
  });
}
