"use client";

import { useEffect, useRef, useState } from "react";
import type { Room, TextStreamReader } from "livekit-client";

/** Live caption of what Mariam is saying - the avatar's own speech only, never the student's. Built the same way
 * Voice Practice reads LiveKit Agents' spoken-text stream (`lk.transcription`: one text stream per utterance,
 * chunks appending until the stream closes), but kept as its own tiny module instead of reusing
 * `lib/voice/transcript.ts` - Avatar Practice and Voice Practice must stay independent (see
 * `tests/voice-captions.test.mjs`) - and scoped down to just "the current line", which is all a caption under the
 * avatar needs. */

const TRANSCRIPTION_TOPIC = "lk.transcription";

export interface AvatarCaption {
  text: string;
  /** False while the line is still streaming in. */
  final: boolean;
}

export function useAvatarCaption(room: Room | null): AvatarCaption | null {
  const [caption, setCaption] = useState<AvatarCaption | null>(null);
  const activeSegmentRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    // A new (or null) room means a new session: whatever was captioned for the previous one no longer applies.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCaption(null);
    activeSegmentRef.current = null;
    if (!room) return;

    const handleTranscription = async (reader: TextStreamReader, participantInfo: { identity: string }) => {
      // Mariam's speech only - the student's own words never appear here.
      if (participantInfo.identity === room.localParticipant.identity) return;
      const attributes = reader.info.attributes ?? {};
      const segmentId = attributes["lk.segment_id"] ?? reader.info.id;
      const generation = ++generationRef.current;
      activeSegmentRef.current = segmentId;
      const current = () => generationRef.current === generation && activeSegmentRef.current === segmentId;
      setCaption({ text: "", final: false });
      try {
        for await (const chunk of reader) {
          if (!current()) return;
          setCaption(previous => ({ text: (previous?.text ?? "") + chunk, final: false }));
        }
      } catch {
        return; // stream aborted (e.g. disconnect) - keep what arrived, not final
      }
      if (current()) setCaption(previous => (previous ? { ...previous, final: true } : previous));
    };

    room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, handleTranscription);
    return () => {
      try {
        room.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
      } catch {
        // never registered (room ended before a stream arrived)
      }
    };
  }, [room]);

  return caption;
}
