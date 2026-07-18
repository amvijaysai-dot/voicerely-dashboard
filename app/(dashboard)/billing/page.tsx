// app/(dashboard)/billing/page.tsx
"use client";

import { useState, useEffect } from "react";
import Script from "next/script";
import { Receipt, CreditCard } from "lucide-react";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { getUsageStatus } from "@/lib/billing/thresholds";
import type { VoicerelyPlanType } from "@/lib/billing/types";

// Live plan config pulled from the authenticated tenant's billing summary
// (/api/billing/summary) plus the session user — no static client/rate leaks.
interface BillingSummary {
  minutesUsed: number;
  minutesAllocated: number | null;
  usagePercent: number | null;
  currentSpend: number;
  perMinuteRate: number;
  planType: string;
  currency?: string;
  displayName?: string;
}

interface SessionUser {
  id: string;
  username: string;
  clientName: string;
  email?: string;
  isAdmin: boolean;
}

interface PaymentMethod {
  hasPaymentMethod: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  paddleCustomerId?: string;
}

// Paddle V2 SDK type definitions — keeps the client integration fully typed
// (no `as any` escapes) and documents the event surface we rely on.
type PaddleEvent =
  | { name: "checkout.error"; data: { message?: string; code?: string; error?: unknown } }
  | { name: "checkout.completed"; data: { checkout_id?: string } }
  | { name: "checkout.closed"; data: Record<string, unknown> }
  | { name: string; data: unknown };

declare global {
  interface Window {
    Paddle?: {
      Environment: {
        set: (env: "sandbox" | "production") => void;
      };
      Initialize: (args: {
        token: string;
        eventCallback?: (event: PaddleEvent) => void;
      }) => void;
      Checkout: {
        open: (args: {
          items: Array<{ priceId: string; quantity: number }>;
          settings: { displayMode: "overlay" | "inline"; theme: "light" | "dark" };
          customer?: { email?: string };
          eventCallback?: (event: PaddleEvent) => void;
        }) => void;
      };
    };
  }
}

export default function BillingPage() {
  // Live values resolved from the authenticated tenant session + billing summary.
  const [clientName, setClientName] = useState<string>("");
  const [planType, setPlanType] = useState<string>("Fixed Allowance");
  const [rawPlanType, setRawPlanType] = useState<VoicerelyPlanType | undefined>(undefined);
  const [perMinuteRate, setPerMinuteRate] = useState<number>(0);
  const [allocatedMinutes, setAllocatedMinutes] = useState<number | null>(null);
  const [minutesUsed, setMinutesUsed] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("USD");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Fetch the logged-in tenant's identity + dynamically aggregated billing summary.
  useEffect(() => {
    let active = true;
    async function loadBilling() {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const [meRes, summaryRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/billing/summary"),
        ]);
        if (!meRes.ok) throw new Error("Unable to resolve tenant session.");
        const me = await meRes.json();
        if (active && me.user) setClientName(me.user.clientName);

        if (!summaryRes.ok) throw new Error("Unable to retrieve billing summary.");
        const summary: BillingSummary = await summaryRes.json();
        if (!active) return;

        setPlanType(
          summary.planType === "pay_as_you_go"
            ? "Pay As You Go"
            : summary.planType === "fixed_allowance"
            ? "Fixed Allowance"
            : "Tiered"
        );
        setRawPlanType(summary.planType as VoicerelyPlanType);
        setPerMinuteRate(summary.perMinuteRate ?? 0);
        setAllocatedMinutes(summary.minutesAllocated ?? null);
        setMinutesUsed(summary.minutesUsed ?? 0);
        setCurrency(summary.currency ?? "USD");
      } catch {
        if (active) setSummaryError("Unable to load billing summary. Please refresh.");
      } finally {
        if (active) setSummaryLoading(false);
      }
    }
    loadBilling();
    return () => {
      active = false;
    };
  }, []);

  // Fetch payment method on mount
  useEffect(() => {
    fetchPaymentMethod();
  }, []);

  async function fetchPaymentMethod() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/payment-method");
      if (res.ok) {
        const data = await res.json();
        setPaymentMethod(data);
      } else {
        setCheckoutError("Unable to retrieve payment records. Please refresh the page.");
      }
    } catch {
      // Network/database failure — surface a clean, user-friendly message
      // instead of silently showing "no payment method".
      setCheckoutError("Unable to retrieve payment records. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }

  const openPaddleCheckout = () => {
    const paddle = typeof window !== "undefined" ? window.Paddle : undefined;
    if (!paddle?.Checkout) {
      setCheckoutError("Paddle is still loading. Please try again in a moment.");
      return;
    }
    setCheckoutError(null);
    setUpdating(true);
    try {
      paddle.Checkout.open({
        items: [
          {
            priceId: process.env.NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID || "pri_placeholder",
            quantity: 1,
          },
        ],
        settings: {
          displayMode: "overlay",
          theme: "dark",
        },
        eventCallback: (event) => {
          if (event.name === "checkout.error") {
            // Explicitly surface checkout failures instead of failing silently.
            console.error("Paddle checkout error:", event.data);
            setCheckoutError("We couldn't open the payment window. Please try again.");
            setUpdating(false);
          } else if (event.name === "checkout.completed") {
            setCheckoutError(null);
            setUpdating(false);
            fetchPaymentMethod();
          } else if (event.name === "checkout.closed") {
            setUpdating(false);
          }
        },
      });
    } catch (err) {
      console.error("Error launching Paddle checkout:", err);
      setCheckoutError("We couldn't open the payment window. Please try again.");
      setUpdating(false);
    }
  };

  const usage = getUsageStatus(minutesUsed, allocatedMinutes ?? 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Paddle.js SDK Script - V2 Initialize */}
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={() => {
          const paddle = typeof window !== "undefined" ? window.Paddle : undefined;
          if (paddle) {
            // Crucial: set environment BEFORE initializing. Driven by the
            // NEXT_PUBLIC_PADDLE_ENV flag so prod/sandbox is a config switch.
            paddle.Environment.set(
              (process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production") || "sandbox"
            );
            paddle.Initialize({
              token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "test_placeholder",
            });
          }
        }}
      />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Billing</h1>
        <p className="text-sm text-muted mt-1">Subscription and usage overview.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Usage meter */}
        <UsageMeter
          minutesUsed={minutesUsed}
          minutesAllocated={allocatedMinutes}
          status={usage.status}
          planType={rawPlanType}
        />

        {/* Plan tier card */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3">
          <span className="text-sm text-muted">
            {summaryLoading ? "Loading…" : clientName || "—"}
          </span>
          <span className="text-lg font-semibold text-foreground tracking-tight">
            {summaryLoading ? "Loading…" : planType}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold text-foreground tabular-nums tracking-tight">
              {currency === "USD" ? "$" : currency === "EUR" ? "€" : "£"}
              {perMinuteRate.toFixed(2)}
            </span>
            <span className="text-sm text-muted">/ minute</span>
          </div>
        </div>
      </div>

      {/* Payment Method Card */}
      <section className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-accent" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Payment Method</h2>
        </div>

        {checkoutError && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">
            {checkoutError}
          </p>
        )}
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paymentMethod?.hasPaymentMethod ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-6 rounded bg-accent/20 flex items-center justify-center">
                <CreditCard className="w-3 h-3 text-accent" />
              </div>
              <div>
                <p className="text-foreground font-medium">{paymentMethod.cardBrand}</p>
                <p className="text-sm text-muted">•••• {paymentMethod.cardLast4}</p>
              </div>
            </div>
            <button
              onClick={openPaddleCheckout}
              disabled={updating}
              className="px-4 py-2 rounded-lg bg-accent text-black font-medium text-sm hover:opacity-90 transition disabled:opacity-50"
            >
              {updating ? "Loading..." : "Update Payment Method"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-muted">No payment method on file.</p>
            <button
              onClick={openPaddleCheckout}
              disabled={updating}
              className="px-4 py-2 rounded-lg bg-accent text-black font-medium text-sm hover:opacity-90 transition disabled:opacity-50"
            >
              {updating ? "Loading..." : "Link Credit Card"}
            </button>
          </div>
        )}
      </section>

      {/* Invoices */}
      <section className="bg-surface border border-border rounded-2xl overflow-hidden">
        <h2 className="text-lg font-semibold tracking-tight text-foreground px-6 py-4 border-b border-border">
          Invoices
        </h2>
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center">
            <Receipt className="w-5 h-5 text-muted" />
          </div>
          <div className="text-foreground font-medium">No invoices generated yet.</div>
          <p className="text-sm text-muted max-w-xs">
            Your monthly billing history will populate here.
          </p>
        </div>
      </section>
    </div>
  );
}