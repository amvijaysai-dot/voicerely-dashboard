// components/drawer/CallTranscriptModal.tsx
//
// Interactive Call Transcript & Recording Detail Modal (Option B). Opens when
// a client inspects an individual call row. Premium dark-themed overlay with:
//   1. Header + compact summary panel (metadata + AI executive summary)
//   2. Inline audio waveform (play/pause, mock progress slider, durations)
//   3. Speaker-separated transcript feed (AI agent vs. customer, micro-times)
// Uses clean mock data; the live Retell mapping plugs in later.

"use client";

import { useEffect } from "react";
import { X, Bot, User, Sparkles } from "lucide-react";
import { SentimentBadge, type Sentiment } from "@/components/calls/SentimentBadge";
import { AudioWaveform } from "@/components/drawer/AudioWaveform";

export type Speaker = "agent" | "customer";

export interface TranscriptTurn {
  id: string;
  speaker: Speaker;
  /** Micro-timestamp relative to call start, e.g. "00:12". */
  timestamp: string;
  text: string;
}

export interface CallTranscriptDetail {
  id: string;
  timestamp: string; // ISO
  fromNumber: string; // formatted/masked
  durationSeconds: number;
  sentiment: Sentiment;
  executiveSummary: string;
  transcript: TranscriptTurn[];
}

interface CallTranscriptModalProps {
  call: CallTranscriptDetail | null;
  onClose: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function CallTranscriptModal({ call, onClose }: CallTranscriptModalProps) {
  const open = Boolean(call);

  // Close on Escape for accessibility.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!open}
      />

      {/* Centered modal sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {call && (
          <div className="w-full max-w-2xl max-h-[90vh] bg-background-alt border border-border rounded-2xl shadow-glow flex flex-col overflow-hidden">
            {/* 1. Header */}
            <div className="flex items-center justify-between px-6 h-16 border-b border-border shrink-0">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  Call Transcript & Recording
                </span>
                <span className="text-xs text-muted tabular-nums">{call.fromNumber}</span>
              </div>
              <button
                onClick={onClose}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="Close transcript modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body (scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Compact summary panel */}
              <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Meta label="Date & Time" value={formatDateTime(call.timestamp)} />
                  <Meta label="Duration" value={formatDuration(call.durationSeconds)} />
                  <Meta label="Caller ID" value={call.fromNumber} />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">Sentiment</span>
                    <SentimentBadge sentiment={call.sentiment} />
                  </div>
                </div>

                {/* AI Executive Summary */}
                <div className="flex gap-3 rounded-xl bg-accent/5 border border-accent/20 p-4">
                  <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-semibold text-accent uppercase tracking-wide">
                      AI Executive Summary
                    </span>
                    <p className="text-sm text-foreground mt-1 leading-relaxed">
                      {call.executiveSummary}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Inline audio waveform */}
              <AudioWaveform durationSeconds={call.durationSeconds} />

              {/* 3. Speaker-separated transcript feed */}
              <div>
                <h3 className="text-sm font-semibold text-foreground tracking-tight mb-3">
                  Conversation Timeline
                </h3>
                <div className="flex flex-col gap-3">
                  {call.transcript.map((turn) => (
                    <TranscriptBubble key={turn.id} turn={turn} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm text-foreground tabular-nums truncate">{value}</span>
    </div>
  );
}

function TranscriptBubble({ turn }: { turn: TranscriptTurn }) {
  const isAgent = turn.speaker === "agent";
  return (
    <div className={`flex gap-3 ${isAgent ? "" : "flex-row-reverse"}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isAgent ? "bg-accent/15 text-accent" : "bg-surface-hover text-muted"
        }`}
      >
        {isAgent ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col gap-1 max-w-[80%] ${isAgent ? "items-start" : "items-end"}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {isAgent ? "AI Voice Agent" : "Customer"}
          </span>
          <span className="text-[11px] text-muted tabular-nums">{turn.timestamp}</span>
        </div>
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isAgent
              ? "bg-surface border border-border text-foreground rounded-tl-sm"
              : "bg-surface-hover text-foreground rounded-tr-sm"
          }`}
        >
          {turn.text}
        </div>
      </div>
    </div>
  );
}
