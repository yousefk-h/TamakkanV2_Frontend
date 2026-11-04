"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Loader2, MessageSquareText, PhoneOff } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { formatDuration } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n/LocaleProvider";
import { selectCaptionView } from "@/lib/voice/captions";
import type { TranscriptSegment } from "@/lib/voice/transcript";
import type { VoiceAgentState } from "@/lib/voice/voiceRoom";
import { deriveVoiceIndicator, voiceControls, type VoiceUiConnection, type VoiceUiPhase } from "@/lib/voice/voiceUiState";
import { ConversationSheet, CurrentCaption, RecentContext } from "./VoiceConversation";

const AGENT_STATE_KEY: Record<VoiceAgentState, MessageKey> = {
  initializing: "voiceSession.statusInitializing",
  idle: "voiceSession.statusListening",
  listening: "voiceSession.statusListening",
  thinking: "voiceSession.statusThinking",
  speaking: "voiceSession.statusSpeaking",
};

export interface VoiceCallViewProps {
  phase: VoiceUiPhase;
  connection: VoiceUiConnection;
  agentPresent: boolean;
  agentState: VoiceAgentState | null;
  micEnabled: boolean;
  micPending: boolean;
  micError: boolean;
  audioBlocked: boolean;
  endCause: string | null;
  error: string | null;
  secondsLeft: number | null;
  segments: readonly TranscriptSegment[];
  isStudent: boolean;
  watched: boolean;
  audioContainerRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  onEnableAudio: () => void;
}

/** Voice Practice's call screen, purely from props (no session logic): focus-first - state, visualizer, current
 * caption, then the mic/End controls; the complete provisional conversation lives in a separate, non-modal sheet.
 * Every state shown comes from what the session already exposes - there are no invented audio levels and no
 * invented partial transcription. */
export function VoiceCallView({
  phase,
  connection,
  agentPresent,
  agentState,
  micEnabled,
  micPending,
  micError,
  audioBlocked,
  endCause,
  error,
  secondsLeft,
  segments,
  isStudent,
  watched,
  audioContainerRef,
  onStart,
  onEnd,
  onToggleMic,
  onEnableAudio,
}: VoiceCallViewProps) {
  const { t } = useI18n();
  // What is on screen: the latest utterance + the 2 turns before it (see `lib/voice/captions.ts`).
  const captionView = useMemo(() => selectCaptionView(segments), [segments]);

  // The full conversation sheet. Non-modal, so the mic and End controls stay usable while it is open.
  const [sheetOpen, setSheetOpen] = useState(false);
  const conversationButtonRef = useRef<HTMLButtonElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const startSession = useCallback(() => {
    setSheetOpen(false); // a new call never inherits an open sheet from the previous one
    onStart();
  }, [onStart]);
  const hasConversation = phase === "live" || phase === "ending" || phase === "ended";
  const sheetVisible = sheetOpen && hasConversation;
  // On a phone the sheet covers the lower part of the screen: bring the call controls (and the caption above them)
  // into the still-visible top part, so the mic / End buttons are never hidden behind it.
  useEffect(() => {
    if (!sheetVisible || !window.matchMedia("(max-width: 639px)").matches) return;
    const el = controlsRef.current;
    if (!el) return;
    const visibleBottom = window.innerHeight * 0.54 - 12;
    const overshoot = el.getBoundingClientRect().bottom - visibleBottom;
    if (overshoot > 0) window.scrollBy({ top: overshoot, behavior: "auto" });
  }, [sheetVisible]);

  const live = phase === "live";
  const indicator = deriveVoiceIndicator({ phase, connection, agentPresent, agentState, micEnabled });
  const { showMic, showEnd } = voiceControls({ phase, connection });

  let status: string;
  if (indicator === "connecting") status = t("voiceSession.statusConnecting");
  else if (indicator === "reconnecting") status = t("voiceSession.statusReconnecting");
  else if (indicator === "waiting") status = t("voiceSession.statusWaitingForAgent");
  else if (indicator === "speaking") status = t("voiceSession.statusMariamSpeaking");
  else if (indicator === "muted") status = t("voiceSession.statusMicMuted");
  else if (live) status = agentState ? t(AGENT_STATE_KEY[agentState]) : t("voiceSession.statusConnected");
  else if (phase === "ending") status = t("voiceSession.statusEnding");
  else if (phase === "ended") status = endCause === "agent_ended" ? t("voiceSession.agentEnded") : endCause === "max_duration_reached" ? t("voiceSession.timeUp") : t("voiceSession.sessionComplete");
  else if (!isStudent) status = t("voiceSession.previewNotice");
  else status = watched ? t("voiceSession.readyToStart") : t("voiceSession.watchFirst");

  const busy = indicator === "connecting" || indicator === "reconnecting" || indicator === "waiting" || indicator === "ending";
  const callIsUp = live && agentPresent;

  return (
    // While the phone sheet is open, extra bottom space lets the page scroll the call controls above it.
    <div className={`flex flex-col gap-3 md:gap-4 ${sheetVisible ? "max-sm:pb-[46dvh]" : ""}`}>
      {/* Call card: who you are talking to, what she is doing right now, and the time left. */}
      <div className="voice-call-card relative flex w-full min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy to-brand-primary-dark px-4 pb-4 pt-12 text-center text-white md:min-h-[300px] md:gap-3 md:pb-7 md:pt-14">
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1.5 text-xs font-extrabold tracking-wide text-brand-primary-dark">
          <i className={`size-1.5 rounded-full ${callIsUp ? "animate-pulse bg-brand-coral motion-reduce:animate-none" : "bg-muted"}`} aria-hidden="true" />
          {t("voiceSession.badge")}
        </span>
        {live && secondsLeft !== null && (
          <span
            className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-extrabold tabular-nums tracking-wide ${
              secondsLeft <= 30 ? "bg-brand-coral text-white" : "bg-white/95 text-brand-primary-dark"
            }`}
          >
            ⏱ {formatDuration(secondsLeft)}
          </span>
        )}

        {/* Voice indicator - driven only by real states: rings while she speaks, a steady glow while she listens,
        a gentle pulse while she thinks, a spinner while connecting, a dimmed mic when muted. */}
        <div className="voice-indicator relative grid size-[4.5rem] flex-none place-items-center md:size-32" aria-hidden="true">
          {indicator === "speaking" && <span className="absolute inset-0 animate-ping rounded-full bg-brand-cyan/30 motion-reduce:animate-none" />}
          <span
            className={`absolute inset-2 rounded-full transition-all ${
              indicator === "speaking"
                ? "bg-brand-cyan/40"
                : indicator === "listening"
                  ? "bg-white/20 ring-4 ring-white/30"
                  : indicator === "thinking"
                    ? "animate-pulse bg-white/20 motion-reduce:animate-none"
                    : "bg-white/10"
            }`}
          />
          <span className={`relative grid size-12 place-items-center rounded-full shadow-lg md:size-20 ${indicator === "muted" ? "bg-white/70 text-brand-navy/70" : "bg-white text-brand-blue"}`}>
            {busy ? (
              <Loader2 className="size-6 animate-spin motion-reduce:animate-none md:size-8" />
            ) : (
              <Icon name={live && !micEnabled ? "micOff" : "mic"} className="size-6 md:size-8" />
            )}
          </span>
        </div>

        <div className="flex w-full flex-col items-center justify-center gap-0.5">
          {/* While a call is up the status line and the caption already say who is speaking. */}
          {!live && phase !== "ending" && <p className="m-0 text-xs font-bold uppercase tracking-wider text-white/70">{t("voiceSession.tutorName")}</p>}
          <p className="m-0 w-full text-base font-extrabold leading-snug text-white md:text-lg" role="status" aria-live="polite">
            {status}
          </p>
        </div>
        {/* Current caption + the 2 turns before it: the focus of an active call. The only live-announced spoken text. */}
        {(live || phase === "ending") && (
          <div className="flex w-full min-w-0 flex-col items-center gap-2 border-t border-white/15 pt-2.5">
            <CurrentCaption current={captionView.current} />
            <RecentContext recent={captionView.recent} />
          </div>
        )}
        {error && <p className="m-0 w-full rounded-lg bg-brand-coral/30 px-3 py-2 text-sm font-semibold text-white">{error}</p>}
        {live && micError && <p className="m-0 w-full rounded-lg bg-brand-coral/30 px-3 py-2 text-sm font-semibold text-white">{t("voiceSession.micPermissionIssue")}</p>}
        {live && audioBlocked && (
          <button type="button" onClick={onEnableAudio} className="min-h-11 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-blue">
            🔊 {t("voiceSession.enableAudio")}
          </button>
        )}
      </div>
      <div ref={audioContainerRef} style={{ display: "none" }} />

      {showEnd ? (
        // Controls sit directly under the call card and above the transcript: the mic is the big primary control,
        // End is separate and clearly distinct. Each has an icon AND a text label (state is never colour-only).
        <div ref={controlsRef} className="flex gap-3">
          {showMic && (
            <button
              type="button"
              disabled={!live || connection !== "connected" || micPending}
              aria-label={micEnabled ? t("voiceSession.muteMic") : t("voiceSession.unmuteMic")}
              aria-pressed={!micEnabled}
              onClick={onToggleMic}
              className={`flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl px-4 text-base font-bold transition-colors disabled:opacity-40 ${
                micEnabled ? "bg-brand-primary-pale text-brand-navy" : "bg-brand-coral text-white"
              }`}
            >
              <Icon name={micEnabled ? "mic" : "micOff"} className="size-6 flex-none" />
              <span className="truncate">{micEnabled ? t("voiceSession.micOn") : t("voiceSession.micOff")}</span>
            </button>
          )}
          <button
            type="button"
            disabled={!live}
            aria-label={t("voiceSession.endSession")}
            onClick={onEnd}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-coral px-5 text-base font-bold text-white transition-colors hover:bg-brand-coral/90 disabled:opacity-40 ${showMic ? "flex-none" : "flex-1"}`}
          >
            <PhoneOff className="size-5 flex-none" aria-hidden="true" />
            <span>{t("voiceSession.endCall")}</span>
          </button>
        </div>
      ) : (
        <div className="flex justify-center md:justify-start">
          <button
            type="button"
            disabled={!isStudent || !watched || phase === "starting"}
            onClick={startSession}
            title={!isStudent ? t("voiceSession.startDisabledPreview") : watched ? undefined : t("voiceSession.watchFirst")}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)] disabled:opacity-40 md:inline-flex md:w-auto"
          >
            <Icon name="mic" className="size-4" /> {phase === "ended" || phase === "error" ? t("voiceSession.talkAgain") : t("voiceSession.startSession")}
          </button>
        </div>
      )}

      {hasConversation && (
        <>
          <button
            ref={conversationButtonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={sheetVisible}
            onClick={() => setSheetOpen(open => !open)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-bold text-ink shadow-card md:w-auto md:self-start"
          >
            <MessageSquareText className="size-4 flex-none text-brand-blue" aria-hidden="true" />
            {t("voiceSession.conversationButton")}
            {segments.length > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-brand-primary-pale px-1.5 text-[11px] font-extrabold leading-5 text-brand-blue">{segments.length}</span>}
          </button>
          {sheetVisible && <ConversationSheet segments={segments} onClose={closeSheet} returnFocusRef={conversationButtonRef} />}
        </>
      )}
    </div>
  );
}
