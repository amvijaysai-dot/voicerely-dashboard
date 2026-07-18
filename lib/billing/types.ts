// lib/billing/types.ts

export type VoicerelyPlanType = "pay_as_you_go" | "fixed_allowance" | "tiered";

export interface VoicerelyClientConfig {
  clientId: string;
  displayName: string;             // white-labeled name shown in UI
  voicerely_plan_type: VoicerelyPlanType;
  voicerely_per_minute_rate: number;   // USD, e.g. 0.18 — Voicerely's rate, NOT Retell's cost
  allocated_minutes: number | null;    // null = unlimited / pure PAYG
  currency: "USD" | "EUR" | "GBP";
  billingCycleStart: string;       // ISO date
}