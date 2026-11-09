"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { useVoicePractice } from "@/lib/voice/useVoicePractice";
import { VoiceCallView } from "./VoiceCallView";

/** Voice Practice: audio-only conversation with the hosted LiveKit voice
 * agent, on the same lesson and session record system as Mariam's Avatar
 * Practice (`MariamSession`). No SpatialReal, no camera - microphone only.
 * `onActiveChange` lets the lesson player lock the mode switch while a call
 * is live; unmounting this component ends the call regardless.
 *
 * This component owns the session (`useVoicePractice`); everything visual is `VoiceCallView`. */
export function VoiceSession({
  topicId,
  enrollmentId,
  watched,
  onActiveChange,
}: {
  topicId: string;
  enrollmentId?: string;
  watched: boolean;
  onActiveChange?: (active: boolean) => void;
}) {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  // Same gate as MariamSession: POST /sessions/start is student-only.
  const isStudent = authState.status === "authenticated" && authState.user.role === "student";
  const messages = useMemo(() => ({ startError: t("voiceSession.startError"), connectionFailed: t("voiceSession.connectionFailed") }), [t]);
  const { phase, error, endCause, secondsLeft, snapshot, start, end, audioContainerRef, room } = useVoicePractice(topicId, messages, enrollmentId);

  const active = phase === "starting" || phase === "live" || phase === "ending";
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);

  return (
    <VoiceCallView
      phase={phase}
      connection={snapshot.connection}
      agentPresent={snapshot.agentPresent}
      agentState={snapshot.agentState}
      micEnabled={snapshot.micEnabled}
      micPending={snapshot.micPending}
      micError={Boolean(snapshot.micError)}
      audioBlocked={snapshot.audioBlocked}
      endCause={endCause}
      error={error}
      secondsLeft={secondsLeft}
      segments={snapshot.segments}
      isStudent={isStudent}
      watched={watched}
      audioContainerRef={audioContainerRef}
      onStart={() => void start()}
      onEnd={end}
      onToggleMic={() => void room?.toggleMicrophone()}
      onEnableAudio={() => void room?.startAudio()}
    />
  );
}
