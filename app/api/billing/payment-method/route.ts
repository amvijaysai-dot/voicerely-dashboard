// app/api/billing/payment-method/route.ts
//
// Paddle payment method management for client billing.
// Provides endpoints to get payment method info and create Paddle checkout for updating.

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/auth";

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
 *
 * Creates a server-side Paddle checkout session for updating a tenant's
 * payment method. This is a server-trusted operation only — it reads the
 * authenticated tenant from the session and never accepts client-supplied
 * state (no payment tokens, card data, or customer IDs are taken from the
 * request body). All sensitive values are resolved server-side from env.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ WEBHOOK LANDING ZONE (upcoming)                                        │
 * │ This route is NOT where saved payment tokens are written. Paddle       │
 * │ returns the persisted payment method asynchronously via its webhook    │
 * │ pipeline. The handlers to be added here (or in app/api/webhooks/       │
 * │ paddle) will listen for:                                               │
 * │   • "transaction.completed"  → confirm one-time setup charge cleared   │
 * │   • "subscription.updated"   → map the new payment_method token back   │
 * │     to the Prisma tenant row (paddleCustomerId + card metadata)         │
 * │ Those listeners update the tenant record out-of-band; the client only  │
 * │ triggers the overlay and polls /api/billing/payment-method for status. │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export async function POST(request: NextRequest) {
  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // In demo mode, return error (client should use Paddle.js SDK directly)
  if (!PADDLE_API_KEY) {
    return NextResponse.json(
      { error: "Paddle not configured. Set PADDLE_API_KEY and PADDLE_VENDOR_ID." },
      { status: 503 }
    );
  }

  // Get or create Paddle customer
  let paddleCustomerId = tenant.paddleCustomerId;

  if (!paddleCustomerId) {
    // Create a new Paddle customer
    try {
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

      if (createRes.ok) {
        const createData = (await createRes.json()) as { data: { id: string } };
        paddleCustomerId = createData.data.id;
      }
    } catch {
      // Fall through to use checkout without customer ID
    }
  }

  // Use the configured setup price ID for payment method update
  if (PADDLE_SETUP_PRICE_ID) {
    // Create a checkout for the setup price
    try {
      const checkoutRes = await fetch(`${PADDLE_API_URL}/checkouts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              price_id: PADDLE_SETUP_PRICE_ID,
              quantity: 1,
            },
          ],
          customer_id: paddleCustomerId,
          success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
        }),
      });

      if (checkoutRes.ok) {
        const checkoutData = (await checkoutRes.json()) as {
          data: {
            url: string;
            checkout_id: string;
          };
        };
        return NextResponse.json({
          checkoutUrl: checkoutData.data.url,
          paddleCheckoutId: checkoutData.data.checkout_id,
        });
      }
    } catch {
      // Fall through to error
    }
  }

  // Return error if no valid checkout could be created
  return NextResponse.json(
    { error: "Unable to create Paddle checkout. Check PADDLE_SETUP_PRICE_ID configuration." },
    { status: 500 }
  );
}
