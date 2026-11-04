"use client";

import type { AvatarCaption as AvatarCaptionState } from "@/lib/spatialreal/avatarCaption";

/** What Mariam is saying, shown as a caption below the avatar while she speaks. Presentation only - `caption` is
 * whatever `useAvatarCaption` already collected from the room's `lk.transcription` stream. The one live-announced
 * region for Mariam's speech: `aria-live="polite"` + `aria-busy` while the line is still streaming in, so a screen
 * reader announces each finished line once instead of every partial chunk - same contract as Voice Practice's
 * `CurrentCaption` (`VoiceConversation.tsx`), reused here as its own small component per the Avatar/Voice isolation
 * rule (`tests/voice-captions.test.mjs`). `.caption-window` (globals.css) caps the box's height and fades old lines
 * out at the top instead of pushing layout around, on phones and desktop alike. */
export function AvatarCaption({ caption }: { caption: AvatarCaptionState | null }) {
  if (!caption?.text.trim()) return null;
  const text = caption.text.trim();
  return (
    <div className="flex w-full min-w-0 justify-center" aria-live="polite" aria-atomic="true" aria-busy={!caption.final}>
      <p
        className={`caption-window m-0 w-full max-w-prose text-center text-base font-semibold leading-snug [overflow-wrap:anywhere] md:text-lg ${
          caption.final ? "text-ink" : "text-ink/70"
        }`}
      >
        {text}
      </p>
    </div>
  );
}
