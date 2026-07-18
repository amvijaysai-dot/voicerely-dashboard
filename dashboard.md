# Voicerely — AI Voice Agent Analytics Dashboard
### Structural Configuration & Build Blueprint

> Target stack: Next.js 14+ (App Router) · Tailwind CSS · Shadcn/ui · Tremor · Lucide React
> Purpose: White-labeled client analytics dashboard sitting on top of a Retell AI backend, with all provider pricing abstracted behind a custom Voicerely billing layer.

---

## Table of Contents

1. [Design System & Branding](#1-design-system--branding)
2. [Architecture & File Structure](#2-architecture--file-structure)
3. [Data Schema & API Transformation Logic](#3-data-schema--api-transformation-logic)
4. [Component Boilerplate](#4-component-boilerplate)
5. [Build Notes](#5-build-notes)

---

## 1. Design System & Branding

### 1.1 Color Tokens

| Token | Hex | Usage |
|---|---|---|
| `bg-primary` | `#0B0B0C` | App shell background |
| `bg-primary-alt` | `#121214` | Page background / secondary surface |
| `surface` | `#1E1E22` | Cards, table headers, panel borders |
| `surface-hover` | `#28282D` | Hover state on interactive surfaces |
| `accent` | `#FF6B00` | Primary buttons, progress fill, active nav, highlights |
| `accent-alt` | `#FF7A00` | Gradient stop / hover state for accent |
| `text-primary` | `#FFFFFF` | Headings, high-emphasis text |
| `text-secondary` | `#9CA3AF` | Body copy, labels, muted text |
| `border-subtle` | `#2A2A2E` | Hairline dividers |
| `success` | `#22C55E` | Completed call status |
| `danger` | `#EF4444` | Failed call status |

### 1.2 Tailwind Theme Extension

```js
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "#0B0B0C",
          alt: "#121214",
        },
        surface: {
          DEFAULT: "#1E1E22",
          hover: "#28282D",
        },
        accent: {
          DEFAULT: "#FF6B00",
          alt: "#FF7A00",
        },
        muted: "#9CA3AF",
        border: "#2A2A2E",
        success: "#22C55E",
        danger: "#EF4444",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Geist", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 24px 0 rgba(255,107,0,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
```

### 1.3 Typography

- **Display / Headers:** Inter, 600–700 weight, tight tracking (`tracking-tight`)
- **Body / Data:** Inter, 400–500 weight, `text-zinc-400` / `#9CA3AF`
- **Numerals (metrics):** Inter Tight or tabular-nums variant for aligned KPI figures — always set `font-variant-numeric: tabular-nums` on metric values so they don't jitter on refresh.

### 1.4 Global Styling Notes

- All primary CTAs use `bg-accent hover:bg-accent-alt text-white shadow-glow` with `rounded-xl`.
- Cards: `bg-surface border border-border rounded-2xl p-6`.
- Active nav item: left border accent bar (`border-l-2 border-accent`) + `text-white`, inactive: `text-muted hover:text-white`.
- Charts (Tremor) should be re-themed via CSS variables to remove default light-mode fills — see `tremor.css` override in section 4.4.

---

## 2. Architecture & File Structure

### 2.1 Tech Stack

- **Framework:** Next.js 14+ App Router, Server Components by default, Client Components only where interactivity is required (tables, drawers, audio player).
- **Styling:** Tailwind CSS + Shadcn/ui primitives.
- **Charts:** Tremor (dark-mode themed) for line/bar/progress visualizations.
- **Icons:** Lucide React.
- **Data fetching:** Server-side route handlers proxy Retell — the client bundle never sees a Retell API key.
- **Auth/Tenancy:** Middleware resolves `clientId` from subdomain or session, scoping every query to that tenant's Retell key + billing config.

### 2.2 Directory Structure

```
voicerely-dashboard/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── (dashboard)/
│   │   ├── layout.tsx                 # Sidebar + topbar shell
│   │   ├── page.tsx                   # Overview
│   │   ├── billing/
│   │   │   └── page.tsx               # Billing & Subscription Panel
│   │   ├── calls/
│   │   │   ├── page.tsx               # Live Agent Logs table
│   │   │   └── [callId]/
│   │   │       └── page.tsx           # Deep link into a single call
│   │   └── settings/
│   │       └── page.tsx
│   └── api/
│       ├── calls/route.ts             # Proxies Retell list-calls -> transforms -> returns
│       ├── calls/[callId]/route.ts    # Single call + transcript + recording
│       └── billing/summary/route.ts   # Aggregates usage vs. plan
├── components/
│   ├── overview/
│   │   ├── MetricCard.tsx
│   │   └── UsageTrendChart.tsx
│   ├── billing/
│   │   ├── UsageMeter.tsx
│   │   ├── PlanTierCard.tsx
│   │   └── InvoiceList.tsx
│   ├── calls/
│   │   ├── CallsTable.tsx
│   │   ├── CallStatusBadge.tsx
│   │   └── CallSearchBar.tsx
│   ├── drawer/
│   │   ├── CallDetailDrawer.tsx
│   │   ├── AudioPlayer.tsx
│   │   └── TranscriptView.tsx
│   └── ui/                            # shadcn primitives (button, card, sheet, table...)
├── lib/
│   ├── retell/
│   │   ├── client.ts                  # Server-only Retell SDK wrapper
│   │   └── types.ts                   # Raw Retell response types
│   ├── billing/
│   │   ├── calculate.ts               # Pricing translation layer
│   │   └── types.ts                   # VoicerelyClientConfig, PlanType
│   └── transform.ts                   # Retell -> Voicerely view model mapper
├── tailwind.config.ts
└── dashboard.md
```

### 2.3 Core Dashboard Sections

**Overview Component** — `app/(dashboard)/page.tsx`
KPI row: Total Calls, Total Minutes Consumed, Current Spend (Voicerely-calculated), Avg Call Duration. Backed by `MetricCard` + a Tremor `AreaChart` trend line for call volume over the last 30 days.

**Billing & Subscription Panel** — `app/(dashboard)/billing/page.tsx`
`UsageMeter` (radial or linear progress, amber fill) showing minutes used vs. allocated. `PlanTierCard` displays the client's custom per-minute rate and plan name (never Retell's underlying cost). `InvoiceList` shows outstanding/paid invoices.

**Live Retell Agent Logs** — `app/(dashboard)/calls/page.tsx`
Paginated, searchable `CallsTable`: Timestamp, Agent Name, Customer Number (masked per privacy settings), Duration (`MM:SS`), Status badge (Completed/Failed), Calculated Client Cost. Row click opens `CallDetailDrawer`.

**Media & Transcript Drawer** — `components/drawer/CallDetailDrawer.tsx`
Shadcn `Sheet` sliding from the right. Contains `AudioPlayer` (amber waveform/progress) and `TranscriptView` with sentiment-highlighted turns (positive/neutral/negative background tints, still respecting the dark palette).

---

## 3. Data Schema & API Transformation Logic

### 3.1 Raw Retell Ingestion Types

```typescript
// lib/retell/types.ts

/** Shape of a single record from Retell's GET /list-calls */
export interface RetellCallRecord {
  call_id: string;
  agent_id: string;
  agent_name?: string;
  call_status: "ended" | "error" | "ongoing" | "registered";
  disconnection_reason?: string;
  start_timestamp: number;        // epoch ms
  end_timestamp: number;          // epoch ms
  duration_seconds: number;
  from_number?: string;
  to_number?: string;
  recording_url?: string;
  transcript?: string;
  transcript_object?: RetellTranscriptTurn[];
  call_analysis?: {
    call_successful?: boolean;
    user_sentiment?: "Positive" | "Neutral" | "Negative";
    call_summary?: string;
  };
}

export interface RetellTranscriptTurn {
  role: "agent" | "user";
  content: string;
  timestamp_ms: number;
  sentiment?: "Positive" | "Neutral" | "Negative";
}
```

### 3.2 Voicerely Client Configuration

```typescript
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
```

### 3.3 Client-Facing View Model

```typescript
// lib/transform.ts

export interface VoicerelyCallView {
  callId: string;
  agentName: string;
  customerNumber: string;          // formatted/masked
  timestamp: string;                // ISO, client-formatted downstream
  durationFormatted: string;        // MM:SS
  durationMinutes: number;
  status: "Completed" | "Failed";
  calculatedCost: number;           // duration_minutes * voicerely_per_minute_rate
  sentiment?: "Positive" | "Neutral" | "Negative";
  hasRecording: boolean;
}

/**
 * Transforms a raw Retell call record into the Voicerely client-facing
 * payload. Retell's own cost/pricing fields (if present in the raw
 * response) are intentionally never read or forwarded here.
 */
export function transformCallToClientView(
  raw: RetellCallRecord,
  config: VoicerelyClientConfig
): VoicerelyCallView {
  const durationMinutes = raw.duration_seconds / 60;
  const calculatedCost = round2(durationMinutes * config.voicerely_per_minute_rate);

  return {
    callId: raw.call_id,
    agentName: raw.agent_name ?? "Unnamed Agent",
    customerNumber: maskPhoneNumber(raw.from_number ?? raw.to_number ?? "Unknown"),
    timestamp: new Date(raw.start_timestamp).toISOString(),
    durationFormatted: formatDuration(raw.duration_seconds),
    durationMinutes: round2(durationMinutes),
    status: raw.call_status === "ended" && !raw.disconnection_reason?.includes("error")
      ? "Completed"
      : "Failed",
    calculatedCost,
    sentiment: raw.call_analysis?.user_sentiment,
    hasRecording: Boolean(raw.recording_url),
  };
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function maskPhoneNumber(num: string): string {
  if (num.length < 4) return num;
  return `•••• ${num.slice(-4)}`;
}
```

### 3.4 Billing Summary Aggregation

```typescript
// lib/billing/calculate.ts

export interface BillingSummary {
  minutesUsed: number;
  minutesAllocated: number | null;
  usagePercent: number | null;      // null when unlimited/PAYG
  currentSpend: number;
  perMinuteRate: number;
  planType: VoicerelyPlanType;
}

export function calculateBillingSummary(
  calls: VoicerelyCallView[],
  config: VoicerelyClientConfig
): BillingSummary {
  const minutesUsed = round2(
    calls.reduce((sum, c) => sum + c.durationMinutes, 0)
  );
  const currentSpend = round2(
    calls.reduce((sum, c) => sum + c.calculatedCost, 0)
  );

  return {
    minutesUsed,
    minutesAllocated: config.allocated_minutes,
    usagePercent: config.allocated_minutes
      ? round2((minutesUsed / config.allocated_minutes) * 100)
      : null,
    currentSpend,
    perMinuteRate: config.voicerely_per_minute_rate,
    planType: config.voicerely_plan_type,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

> **Security note:** `lib/retell/client.ts` should be the *only* module that ever imports the Retell API key (read server-side from an env var or per-tenant secret store). Route handlers call it, transform the response with `transformCallToClientView`, and return only the `VoicerelyCallView[]` shape to the browser — Retell's raw payload, and any Retell-native cost/pricing fields, never leave the server.

---

## 4. Component Boilerplate

### 4.1 Overview — MetricCard

```tsx
// components/overview/MetricCard.tsx
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
}

export function MetricCard({ label, value, icon: Icon, trend }: MetricCardProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <Icon className="w-4 h-4 text-accent" />
      </div>
      <span className="text-3xl font-semibold text-white tabular-nums tracking-tight">
        {value}
      </span>
      {trend && (
        <span className={trend.positive ? "text-sm text-success" : "text-sm text-danger"}>
          {trend.value}
        </span>
      )}
    </div>
  );
}
```

### 4.2 Billing — UsageMeter

```tsx
// components/billing/UsageMeter.tsx
interface UsageMeterProps {
  minutesUsed: number;
  minutesAllocated: number | null;
}

export function UsageMeter({ minutesUsed, minutesAllocated }: UsageMeterProps) {
  const percent = minutesAllocated
    ? Math.min(100, (minutesUsed / minutesAllocated) * 100)
    : 0;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-muted">Minutes used</span>
        <span className="text-sm text-white tabular-nums">
          {minutesUsed.toFixed(0)}
          {minutesAllocated ? ` / ${minutesAllocated}` : " (pay as you go)"}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-background-alt overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-alt rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
```

### 4.3 Calls — CallStatusBadge

```tsx
// components/calls/CallStatusBadge.tsx
export function CallStatusBadge({ status }: { status: "Completed" | "Failed" }) {
  const isCompleted = status === "Completed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isCompleted
          ? "bg-success/10 text-success"
          : "bg-danger/10 text-danger"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? "bg-success" : "bg-danger"}`} />
      {status}
    </span>
  );
}
```

### 4.4 Tremor Dark-Mode Override

```css
/* app/tremor-overrides.css */
:root {
  --tremor-brand: #FF6B00;
  --tremor-brand-emphasis: #FF7A00;
  --tremor-background: #1E1E22;
  --tremor-content: #9CA3AF;
  --tremor-content-emphasis: #FFFFFF;
  --tremor-border: #2A2A2E;
}
```

### 4.5 Drawer — AudioPlayer (skeleton)

```tsx
// components/drawer/AudioPlayer.tsx
"use client";

import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

export function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    isPlaying ? audioRef.current.pause() : audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-4">
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shrink-0"
      >
        {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
      </button>
      <div className="flex-1 h-1.5 rounded-full bg-background-alt overflow-hidden">
        <div
          className="h-full bg-accent rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setProgress((el.currentTime / el.duration) * 100 || 0);
        }}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
}
```

---

## 5. Build Notes

- **Never ship the Retell key to the client bundle.** All Retell SDK calls happen in `lib/retell/client.ts`, imported only by files under `app/api/`.
- **Never surface Retell's native billing/cost fields** in any client-facing type, log, or network response — the transform layer in `lib/transform.ts` is the single choke point where raw data becomes client-safe data.
- **Per-tenant isolation:** resolve `clientId` → `{ retellApiKey, VoicerelyClientConfig }` via a secrets/config store keyed by subdomain or session, not by client-supplied input.
- **Pagination:** `CallsTable` should use cursor-based pagination matching Retell's `list-calls` pagination_key, mapped through the transform function per page rather than transforming the entire call history at once.
- **Sentiment highlighting** in `TranscriptView`: use subtle background tints (`bg-success/10`, `bg-danger/10`, `bg-white/5` for neutral) rather than saturated colors, to stay legible against the dark theme.
- Suggested build order: (1) design tokens + Tailwind config, (2) `lib/retell` + `lib/transform` + `lib/billing`, (3) API routes, (4) Overview, (5) Calls table, (6) Drawer, (7) Billing panel.
