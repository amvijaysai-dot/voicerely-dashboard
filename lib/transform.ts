// lib/transform.ts

import type { RetellCallRecord } from "./retell/types";
import type { VoicerelyClientConfig } from "./billing/types";

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
  recordingUrl?: string;            // Retell recording URL (when present)
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
    recordingUrl: raw.recording_url || undefined,
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