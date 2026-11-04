"use client";

import { Icon } from "@/components/ui/Icon";
import type { AvatarTurn } from "@/lib/spatialreal/avatarUiState";

/** The one-line "whose turn is it" strip under the avatar. Purely from props: `turn` is the authoritative state from
 * `deriveAvatarTurn` and `text` its short label. `studentSpeaking` only ever comes from LiveKit reporting the
 * student's own mic as speaking. Indicators are state-driven CSS (no invented audio levels). The strip is a polite
 * status region, so a screen reader hears each turn change once. */
export function AvatarTurnPill({ turn, text, studentSpeaking }: { turn: AvatarTurn; text: string; studentSpeaking: boolean }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-turn={turn}
      className={`m-0 flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-center text-sm font-bold transition-colors ${
        turn === "mariamSpeaking"
          ? "bg-accent-gold/20 text-[#8a6400]"
          : turn === "yourTurn"
            ? "turn-pill-active bg-brand-primary-pale text-brand-navy"
            : turn === "error"
              ? "bg-brand-coral/10 text-brand-coral"
              : "bg-bg text-muted"
      }`}
    >
      {turn === "mariamSpeaking" ? (
        <span className="turn-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : turn === "mariamThinking" ? (
        <span className="turn-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : (
        <Icon name={turn === "micOff" ? "micOff" : "mic"} className={`size-4 flex-none ${turn === "yourTurn" && !studentSpeaking ? "turn-mic-pulse" : ""}`} />
      )}
      <span className="min-w-0">{text}</span>
    </p>
  );
}
