// components/drawer/AudioWaveform.tsx
//
// Inline audio waveform placeholder for the call transcript modal. Provides
// Play/Pause toggle, a mock progress slider, and duration text nodes. The
// waveform bars are decorative placeholders for the upcoming playback stream;
// playback state is simulated locally so the UI is fully interactive now.

import { useState } from "react";
import { Play, Pause } from "lucide-react";

interface AudioWaveformProps {
  /** Total duration in seconds (for the end-time label). */
  durationSeconds: number;
}

// Deterministic bar heights so server/client render identically (no hydration
// mismatch) and the waveform looks stable across reloads.
const BARS = [
  0.35, 0.55, 0.4, 0.7, 0.85, 0.6, 0.45, 0.75, 0.9, 0.65, 0.5, 0.8, 0.55, 0.4,
  0.7, 0.95, 0.6, 0.45, 0.75, 0.5, 0.65, 0.85, 0.55, 0.4, 0.7, 0.6, 0.5, 0.8,
  0.45, 0.65, 0.9, 0.55, 0.4, 0.7, 0.6, 0.5, 0.75, 0.85, 0.5, 0.45,
];

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioWaveform({ durationSeconds }: AudioWaveformProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..100

  const playedSeconds = (progress / 100) * durationSeconds;

  const togglePlay = () => setIsPlaying((p) => !p);

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProgress(Number(e.target.value));
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="w-11 h-11 rounded-full bg-accent flex items-center justify-center shrink-0 hover:bg-accent-alt transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 text-foreground" />
          ) : (
            <Play className="w-4 h-4 text-foreground ml-0.5" />
          )}
        </button>

        {/* Waveform bars (played portion in accent, rest muted) */}
        <div className="flex-1 flex items-center gap-[3px] h-11 overflow-hidden" aria-hidden="true">
          {BARS.map((h, i) => {
            const played = (i / BARS.length) * 100 <= progress;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full ${played ? "bg-accent" : "bg-surface-hover"}`}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Progress slider + duration nodes */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted tabular-nums w-10 text-right">
          {fmt(playedSeconds)}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={onScrub}
          className="flex-1 accent-accent h-1.5 cursor-pointer"
          aria-label="Seek"
        />
        <span className="text-xs text-muted tabular-nums w-10">{fmt(durationSeconds)}</span>
      </div>
    </div>
  );
}
