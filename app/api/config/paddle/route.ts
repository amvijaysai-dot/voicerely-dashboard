// app/api/config/paddle/route.ts
// Client-side Paddle configuration. Requires authenticated session.
// Returns only the CLIENT TOKEN (safe for browser) and environment.
// Never returns server-side API keys.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
  const environment = (process.env.PADDLE_ENV ?? "sandbox") as "sandbox" | "production";

  if (!clientToken) {
    return NextResponse.json(
      { error: "Paddle not configured. Set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    clientToken,
    environment,
    // The priceId for the subscription/setup product.
    // NEXT_PUBLIC_ prefix is intentional — this is the product price, not a secret.
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID ?? "",
  });
}