// app/api/config/paddle/route.ts
//
// Public configuration endpoint for Paddle.js SDK.
// Returns only non-sensitive configuration values needed for client-side Paddle integration.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    vendorId: process.env.PADDLE_VENDOR_ID || "",
    setupPriceId: process.env.NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID || "",
    environment: process.env.PADDLE_ENV || "sandbox",
  });
}