// components/drawer/AudioPlayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  // Keep playing state in sync with the actual audio element (e.g. native
  // pause/end) so the toggle button never drifts out of phase.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => {
      setIsPlaying(false);
      setCurrent(0);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => setIsPlaying(false));
    } else {
      el.pause();
    }
  };

  // Scrub: jump to any point along the wave track when the user clicks/drags.
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const next = Number(e.target.value);
    el.currentTime = next;
    setCurrent(next);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-4 shadow-sm">
      <button
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="w-11 h-11 rounded-full bg-accent flex items-center justify-center shrink-0 text-black hover:opacity-90 transition"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </button>

      {/* Wave-style scrub track */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={handleSeek}
          aria-label="Seek audio"
          className="voicerely-range w-full"
          style={{
            background: `linear-gradient(to right, #FF6B00 ${progress}%, #2A2A2E ${progress}%)`,
          }}
        />
      </div>

      <span className="text-xs text-muted tabular-nums shrink-0 w-[72px] text-right">
        {formatTime(current)} / {formatTime(duration)}
      </span>

      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}
