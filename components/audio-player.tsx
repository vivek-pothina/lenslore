"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

function formatTime(s: number) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  src,
  accent = "#3b82f6",
  border = "#27272a",
}: {
  src: string;
  accent?: string;
  border?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (a) setCurrent(a.currentTime);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnd = () => setPlaying(false);
    const onDur = () => setDuration(a.duration);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("ended", onEnd);
    a.addEventListener("loadedmetadata", onDur);
    return () => {
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("loadedmetadata", onDur);
    };
  }, [tick]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  }, []);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const a = audioRef.current;
      const bar = barRef.current;
      if (!a || !bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      a.currentTime = pct * duration;
    },
    [duration]
  );

  const restart = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    if (a.paused) {
      a.play();
      setPlaying(true);
    }
  }, []);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      className="rounded-xl border p-4 flex items-center gap-4"
      style={{ backgroundColor: "rgba(9,9,11,0.6)", borderColor: border }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={toggle}
          className="size-10 rounded-full flex items-center justify-center text-white transition-all active:scale-90"
          style={{ backgroundColor: accent }}
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        {current > 3 && (
          <button
            onClick={restart}
            className="size-8 rounded-full flex items-center justify-center transition-all"
            style={{ color: accent, opacity: 0.7 }}
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div
          ref={barRef}
          onClick={seek}
          className="h-2 rounded-full cursor-pointer relative overflow-hidden"
          style={{ backgroundColor: border }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{ width: `${pct}%`, backgroundColor: accent }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full shadow-sm transition-[left] duration-100"
            style={{
              left: `calc(${pct}% - 6px)`,
              backgroundColor: accent,
              opacity: playing ? 1 : 0.6,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono tabular-nums" style={{ color: accent, opacity: 0.6 }}>
          <span>{formatTime(current)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
