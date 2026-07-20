// app/api/billing/payment-method/route.ts
//
// Paddle payment method management for client billing.
// Provides endpoints to get payment method info and create Paddle checkout for updating.

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/auth";
import { updateTenant } from "@/lib/repositories/tenantRepository";
import { invalidateTenant } from "@/lib/tenantService";

export const dynamic = "force-dynamic";

// Paddle API configuration
const PADDLE_API_URL = "https://api.paddle.com";
const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_VENDOR_ID = process.env.PADDLE_VENDOR_ID;
const PADDLE_SETUP_PRICE_ID = process.env.PADDLE_SETUP_PRICE_ID;
const PADDLE_ENV = process.env.PADDLE_ENV || "sandbox";

interface PaddlePaymentMethod {
  id: string;
  type: "card";
  card_brand: string;
  last_four: string;
}

interface PaddleCustomer {
  id: string;
  payment_method?: PaddlePaymentMethod;
}

/**
 * GET /api/billing/payment-method
 * Returns the current payment method for the logged-in tenant.
 */
export async function GET() {
  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If no Paddle customer ID, return no payment method
  if (!tenant.paddleCustomerId) {
    return NextResponse.json({
      hasPaymentMethod: false,
      cardBrand: null,
      cardLast4: null,
    });
  }

  // In demo mode (no Paddle API key), return mock data
  if (!PADDLE_API_KEY) {
    return NextResponse.json({
      hasPaymentMethod: true,
      cardBrand: "Visa",
      cardLast4: "4242",
      paddleCustomerId: tenant.paddleCustomerId,
    });
  }

  // Fetch customer from Paddle API
  try {
    const res = await fetch(`${PADDLE_API_URL}/customers/${tenant.paddleCustomerId}`, {
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      // If customer not found, still return no payment method
      return NextResponse.json({
        hasPaymentMethod: false,
        cardBrand: null,
        cardLast4: null,
      });
    }

    const data = (await res.json()) as { data: PaddleCustomer };
    const paymentMethod = data.data?.payment_method;

    if (paymentMethod) {
      return NextResponse.json({
        hasPaymentMethod: true,
        cardBrand: paymentMethod.card_brand,
        cardLast4: paymentMethod.last_four,
        paddleCustomerId: tenant.paddleCustomerId,
      });
    }

    return NextResponse.json({
      hasPaymentMethod: false,
      cardBrand: null,
      cardLast4: null,
    });
  } catch {
    return NextResponse.json({
      hasPaymentMethod: false,
      cardBrand: null,
      cardLast4: null,
    });
  }
}

/**
 * POST /api/billing/payment-method
 * Creates or updates Paddle customer record for the tenant.
 * Checkout itself is initiated client-side via Paddle.Checkout.open().
 * This endpoint only handles the server-side customer creation/lookup.
 */
export async function POST() {
  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!PADDLE_API_KEY) {
    return NextResponse.json(
      { error: "Paddle not configured. Set PADDLE_API_KEY." },
      { status: 503 }
    );
  }

  try {
    let customerId = tenant.paddleCustomerId;

    // Create Paddle customer if one doesn't exist yet.
    if (!customerId) {
      const createRes = await fetch(`${PADDLE_API_URL}/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: tenant.username,
          name: tenant.clientName,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        console.error("Paddle customer creation failed:", err);
        return NextResponse.json(
          { error: "Failed to create Paddle customer." },
          { status: 502 }
        );
      }

      const createData = (await createRes.json()) as { data: { id: string } };
      customerId = createData.data.id;

      // Persist the Paddle customer ID on the tenant record.
      await updateTenant(tenant.id, { paddleCustomerId: customerId });
      invalidateTenant(tenant.id);
    }

    // Return the customer ID so the client can pass it to Paddle.Checkout.open().
    return NextResponse.json({
      customerId,
      ok: true,
    });
  } catch (err) {
    console.error("Paddle POST error:", err);
    return NextResponse.json(
      { error: "Failed to prepare Paddle checkout." },
      { status: 500 }
    );
  }
}
