// components/drawer/CallDetailDrawer.tsx
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { CallStatusBadge } from "@/components/calls/CallStatusBadge";
import { AudioPlayer } from "@/components/drawer/AudioPlayer";
import type { VoicerelyCallView } from "@/lib/transform";

interface CallDetailDrawerProps {
  call: VoicerelyCallView | null;
  onClose: () => void;
}

export function CallDetailDrawer({ call, onClose }: CallDetailDrawerProps) {
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

      {/* Slide-out panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-background-alt border-l border-border shadow-glow transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {call && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 h-16 border-b border-border">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  {call.agentName}
                </span>
                <span className="text-xs text-muted tabular-nums">{call.customerNumber}</span>
              </div>
              <button
                onClick={onClose}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="Close call details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Meta row */}
              <div className="flex items-center justify-between">
                <CallStatusBadge status={call.status} />
                <span className="text-sm text-muted tabular-nums">
                  {call.durationFormatted} · ${call.calculatedCost.toFixed(2)}
                </span>
              </div>

              {/* Audio player (amber progress, §2.3 / §4.5) */}
              {call.hasRecording && call.recordingUrl ? (
                <AudioPlayer src={call.recordingUrl} />
              ) : (
                <div className="bg-surface border border-border rounded-2xl p-4 text-sm text-muted">
                  No audio recording available for this call.
                </div>
              )}

              {/* Transcript */}
              <div>
                <h3 className="text-sm font-semibold text-foreground tracking-tight mb-3">
                  Transcript
                </h3>
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted">
                    Transcript view placeholder — sentiment-highlighted turns render here.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
