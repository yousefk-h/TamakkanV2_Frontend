"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/format";

/** A real `<audio>` element underneath a custom play/pause/scrub control -
 * never a simulated/fake player. `src` is a freshly-signed Cloudinary URL
 * from the message itself (see `MessagingService.media_url_for`); it is
 * never cached across messages since each one is only valid for this one
 * response. */
export function VoiceMessagePlayer({ src, durationSeconds, mine }: { src: string; durationSeconds: number | null; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const total = durationSeconds ?? 0;

  // Only one voice note should ever play at once - pause this one the
  // instant any other audio element on the page starts.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onOtherPlay = (event: Event) => { if (event.target !== audio) audio.pause(); };
    document.addEventListener("play", onOtherPlay, true);
    return () => document.removeEventListener("play", onOtherPlay, true);
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play().catch(() => setLoadError(true));
  };

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(event.target.value);
    setCurrentTime(audio.currentTime);
  };

  const accent = mine ? "bg-white/25 text-white" : "bg-brand-primary-pale text-brand-blue";
  const barColor = mine ? "accent-white" : "accent-brand-blue";

  return (
    <div className="flex min-w-[220px] items-center gap-2.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onError={() => setLoadError(true)}
        className="hidden"
      />
      <button
        type="button"
        onClick={toggle}
        disabled={loadError}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={`grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-50 ${accent}`}
      >
        {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
      </button>
      {loadError ? (
        <span className="text-xs opacity-80">Voice message unavailable</span>
      ) : (
        <>
          <input
            type="range"
            min={0}
            max={Math.max(total, 0.1)}
            step={0.1}
            value={Math.min(currentTime, total)}
            onChange={seek}
            aria-label="Seek voice message"
            className={`h-1.5 min-w-0 flex-1 cursor-pointer rounded-full ${barColor}`}
          />
          <span className="shrink-0 font-mono text-[11px] tabular-nums opacity-80">
            {formatDuration(Math.floor(playing || currentTime > 0 ? currentTime : total))}
          </span>
        </>
      )}
    </div>
  );
}
