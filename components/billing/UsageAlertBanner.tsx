// components/billing/UsageAlertBanner.tsx
"use client";

import Link from "next/link";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { UsageStatus } from "@/lib/billing/thresholds";

interface UsageAlertBannerProps {
  status: UsageStatus;
  message: string;
}

/**
 * Prominent top-of-page threshold banner. Amber for "warning", crimson for
 * "depleted". Includes a fast "Upgrade Plan" CTA routing to /billing.
 * Rendered only when status is warning|depleted by the caller.
 */
export function UsageAlertBanner({ status, message }: UsageAlertBannerProps) {
  const isDepleted = status === "depleted";
  const Icon = isDepleted ? ShieldAlert : AlertTriangle;

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 border rounded-2xl px-4 py-3 ${
        isDepleted
          ? "bg-danger/10 border-danger/30 text-danger"
          : "bg-accent/10 border-accent/30 text-accent"
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <p className="flex-1 text-sm font-medium leading-snug">{message}</p>
      <Link
        href="/billing"
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
          isDepleted
            ? "bg-danger text-white hover:opacity-90"
            : "bg-accent text-black hover:opacity-90"
        }`}
      >
        Upgrade Plan
      </Link>
    </div>
  );
}
