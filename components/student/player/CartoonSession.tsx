"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { SessionStartResponse } from "@/lib/api/types";
import { useVoicePractice } from "@/lib/voice/useVoicePractice";
import { CartoonCharacterPanel } from "./CartoonCharacterPanel";
import { VoiceCallView } from "./VoiceCallView";

/** Cartoon Practice: the EXACT existing Voice Practice pipeline and session (`useVoicePractice`,
 * `mode: "voice_practice"` - same Deepgram STT -> Gemma LLM -> Deepgram TTS agent, same backend
 * routes) with an animated character shown above the unmodified `VoiceCallView` call screen. There is
 * no second AI pipeline and no new LiveKit room type.
 *
 * "Only Voice" does not stop or restart the session - it only stops rendering the character panel, so
 * the student sees the exact same Voice Practice screen that `VoiceSession` shows. Toggling it back on
 * reattaches the character to the same live session.
 *
 * This component owns the session; the character's state wiring (`deriveCartoonCharacterView`) and the
 * call screen itself are both driven from the same `useVoicePractice` snapshot used by `VoiceSession`. */
export function CartoonSession({
  topicId,
  watched,
  onActiveChange,
  handoffStart,
  onHandoffConsumed,
}: {
  topicId: string;
  watched: boolean;
  onActiveChange?: (active: boolean) => void;
  // Stage 3: Avatar -> Cartoon handoff. When set, this is a session the backend's `POST /sessions/{id}/handoff`
  // ALREADY created (continuing a prior Avatar conversation) - this component joins it directly via
  // `startFromHandoff`, instead of its own normal cold `start()` (which would create a SECOND, unrelated session).
  // `onHandoffConsumed` is called once it has been used, so the caller (`PlayerMain`) clears it and a later, normal
  // mount of this component (e.g. the student leaves and reopens Cartoon on their own) starts cold as usual.
  handoffStart?: SessionStartResponse | null;
  onHandoffConsumed?: () => void;
}) {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  // Same gate as VoiceSession/MariamSession: POST /sessions/start is student-only.
  const isStudent = authState.status === "authenticated" && authState.user.role === "student";
  const messages = useMemo(() => ({ startError: t("voiceSession.startError"), connectionFailed: t("voiceSession.connectionFailed") }), [t]);
  const { phase, error, endCause, secondsLeft, snapshot, start, startFromHandoff, end, audioContainerRef, room } = useVoicePractice(topicId, messages);
  const [onlyVoice, setOnlyVoice] = useState(false);

  // Consume a handoff-provided session exactly once, right on mount - never on a later re-render (e.g. `topicId`
  // staying the same while something else re-renders this component), which would otherwise try to join the same
  // handed-off session a second time.
  const consumedHandoffRef = useRef(false);
  useEffect(() => {
    if (!handoffStart || consumedHandoffRef.current) return;
    consumedHandoffRef.current = true;
    void startFromHandoff(handoffStart);
    onHandoffConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = phase === "starting" || phase === "live" || phase === "ending";
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <CartoonCharacterPanel
        phase={phase}
        agentPresent={snapshot.agentPresent}
        agentState={snapshot.agentState}
        onlyVoice={onlyVoice}
        onToggleOnlyVoice={() => setOnlyVoice(v => !v)}
      />
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
    </div>
  );
}
