"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Bot, User, Loader2, FileText, ChevronDown } from "lucide-react";
import { CallStatusBadge } from "@/components/calls/CallStatusBadge";
import { AudioPlayer } from "@/components/drawer/AudioPlayer";
import type { VoicerelyCallView } from "@/lib/transform";

interface TranscriptTurn {
  role: "agent" | "user";
  content: string;
  timestamp_ms: number;
  sentiment?: "Positive" | "Neutral" | "Negative";
}

interface CallDetail {
  transcript: TranscriptTurn[];
  summary: string | null;
  recording: { url: string | null; hasRecording: boolean };
}

interface CallDetailDrawerProps {
  call: VoicerelyCallView | null;
  onClose: () => void;
}

function sentimentClass(s?: string): string {
  if (s === "Positive") return "border-l-2 border-green-500/40";
  if (s === "Negative") return "border-l-2 border-red-500/40";
  return "border-l-2 border-transparent";
}

function TranscriptBubble({ turn }: { turn: TranscriptTurn }) {
  const isAgent = turn.role === "agent";
  return (
    <div className={`flex gap-2.5 ${isAgent ? "" : "flex-row-reverse"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isAgent ? "bg-accent/15 text-accent" : "bg-surface-hover text-muted"
      }`}>
        {isAgent ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${sentimentClass(turn.sentiment)} ${
        isAgent
          ? "bg-surface text-foreground rounded-tl-sm"
          : "bg-accent/10 text-foreground rounded-tr-sm"
      }`}>
        {turn.content}
      </div>
    </div>
  );
}

export function CallDetailDrawer({ call, onClose }: CallDetailDrawerProps) {
  const open = Boolean(call);
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Fetch full call detail (transcript + recording) when drawer opens.
  const fetchDetail = useCallback(async (callId: string) => {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(callId)}`);
      if (res.ok) {
        const data = await res.json();
        setDetail({
          transcript: data.transcript ?? [],
          summary: data.summary ?? null,
          recording: data.recording ?? { url: null, hasRecording: false },
        });
      }
    } catch {
      // Non-blocking — drawer still shows call metadata even if detail fails.
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (call?.callId) fetchDetail(call.callId);
    else setDetail(null);
  }, [call?.callId, fetchDetail]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Determine recording source: prefer the detail route's recording url (more
  // reliable), fall back to the list view's recordingUrl if detail hasn't loaded.
  const recordingUrl = detail?.recording.url ?? (call?.hasRecording ? call.recordingUrl : null);
  const hasRecording = Boolean(recordingUrl);

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

      {/* Slide-out panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Call details"
        aria-hidden={!open}
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-background-alt border-l border-border shadow-glow transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {call && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 h-16 border-b border-border shrink-0">
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-foreground tracking-tight truncate">
                  {call.agentName}
                </span>
                <span className="text-xs text-muted tabular-nums">{call.customerNumber}</span>
              </div>
              <button
                onClick={onClose}
                className="text-muted hover:text-foreground transition-colors ml-3 shrink-0"
                aria-label="Close call details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
              {/* Meta row */}
              <div className="flex items-center justify-between">
                <CallStatusBadge status={call.status} />
                <span className="text-sm text-muted tabular-nums">
                  {call.durationFormatted} · ${call.calculatedCost.toFixed(2)}
                </span>
              </div>

              {/* Audio player */}
              {hasRecording && recordingUrl ? (
                <AudioPlayer src={recordingUrl} />
              ) : (
                <div className="bg-surface border border-border rounded-2xl p-4 text-sm text-muted">
                  {loadingDetail ? "Loading recording…" : "No recording available for this call."}
                </div>
              )}

              {/* AI Summary (collapsible) */}
              {detail?.summary && (
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSummaryOpen((o) => !o)}
                    aria-expanded={summaryOpen}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-surface-hover transition"
                  >
                    <FileText className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-sm font-medium text-foreground flex-1">AI Call Summary</span>
                    <ChevronDown className={`w-4 h-4 text-muted transition-transform ${summaryOpen ? "rotate-180" : ""}`} />
                  </button>
                  {summaryOpen && (
                    <div className="px-4 pb-4 text-sm text-muted leading-relaxed border-t border-border pt-3">
                      {detail.summary}
                    </div>
                  )}
                </div>
              )}

              {/* Transcript */}
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground tracking-tight">
                  Transcript
                </h3>

                {loadingDetail ? (
                  <div className="flex items-center gap-2 text-sm text-muted py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading transcript…
                  </div>
                ) : detail && detail.transcript.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {detail.transcript.map((turn, i) => (
                      <TranscriptBubble key={i} turn={turn} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted py-2">
                    {detail ? "No transcript available for this call." : "Select a call to view its transcript."}
                  </p>
                )}
              </div>

              {/* Call metadata footer */}
              <div className="bg-surface border border-border rounded-xl p-4 text-xs text-muted space-y-1.5 mt-auto">
                <div className="flex justify-between">
                  <span>Call ID</span>
                  <span className="font-mono text-foreground">{call.callId.slice(0, 20)}…</span>
                </div>
                <div className="flex justify-between">
                  <span>Timestamp</span>
                  <span className="text-foreground">
                    {new Date(call.timestamp).toLocaleString("en-AU", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Sentiment</span>
                  <span className={`font-medium ${
                    call.sentiment === "Positive" ? "text-green-500" :
                    call.sentiment === "Negative" ? "text-red-500" : "text-foreground"
                  }`}>
                    {call.sentiment ?? "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}