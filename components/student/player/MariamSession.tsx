"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PhoneOff } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Dialog";
import { AvatarCaption } from "./AvatarCaption";
import { AvatarTurnPill } from "./AvatarTurnPill";
import { useAvatarCaption } from "@/lib/spatialreal/avatarCaption";
import { ApiError, sessionsApi } from "@/lib/api/client";
import { formatDuration } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthContext";
import { createAvatarAudioContext, loadSpatialRealSdk, type AudioUnlockSdk } from "@/lib/spatialreal/sdk";
import { useSpatialRealAvatar } from "@/lib/spatialreal/useSpatialRealAvatar";
import { avatarControls, deriveAvatarTurn, isAvatarSessionActive } from "@/lib/spatialreal/avatarUiState";
import { createWeakNetworkFallbackTracker } from "@/lib/spatialreal/weakNetworkFallback";
import type { SpatialRealAvatarConnection, SpatialRealAvatarConnectionStatus } from "@/lib/spatialreal/types";
import { type MessageKey, useI18n } from "@/lib/i18n/LocaleProvider";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";

// Each SDK status maps to one message key - a closed, hand-authored set kept
// in step with `SpatialRealAvatarConnectionStatus` (a compile error here if
// the SDK ever adds a status this map doesn't cover).
const STATUS_KEY: Record<SpatialRealAvatarConnectionStatus, MessageKey> = {
  idle: "mariamSession.statusConnected",
  initializing: "mariamSession.statusInitializing",
  connecting: "mariamSession.statusConnecting",
  connected: "mariamSession.statusListening",
  disconnecting: "mariamSession.statusDisconnecting",
  error: "mariamSession.statusError",
};

// AvatarView's canvas renders with a transparent background (confirmed by
// inspecting the SDK's own WebGPU/WebGL setup - `alpha: true`,
// `backgroundColor: [0,0,0,0]`), so a real room photo shows through behind
// Mariam in the live view exactly like it does behind her static poster
// photo below - same backdrop in both states, no video call needed on our
// side just to give her a place to stand.
const AVATAR_BACKDROP_STYLE = {
  backgroundImage: "url('/backgrounds/avatar-room.png')",
  backgroundSize: "cover",
  backgroundPosition: "center 30%",
};

// WebKit (both Safari and Chrome-on-iOS - every iOS browser is WebKit under
// the hood, confirmed live: Chrome on iPhone showed the same bug, Chrome on
// Android didn't) doesn't reliably clip GPU-composited content to an
// ancestor's `border-radius` + `overflow: hidden` - a known WebKit
// rendering gap. Both the avatar's own canvas (drawn by `@spatialreal/web-sdk`,
// used once a session is live) and the poster `<Image>` below (used before
// one starts) are composited content, so both need this, not just the
// canvas - the poster's own square corners/edges were bleeding past this
// box's rounded ones on iOS while looking fine on Android before this was
// applied here too. `clip-path` clips composited layers correctly in
// WebKit, so it's applied alongside `overflow-hidden` (kept for
// browsers/content where it already works on its own) - the radius here
// must match `rounded-2xl` (1rem).
const AVATAR_CLIP_STYLE = { clipPath: "inset(0 round 1rem)", WebkitClipPath: "inset(0 round 1rem)" };

/** The avatar box shell, shared by both the idle (poster) and live (canvas)
 * states so a fix to the box's own shape/sizing only ever has to happen
 * once - this is exactly the kind of duplication that let the WebKit
 * clip-path fix above land on the live box while getting missed on the
 * idle one for a whole round of debugging.
 *
 * Deliberately NOT `aspect-video` (the CSS `aspect-ratio` property) - this
 * box sits inside a `flex flex-col` parent, and `aspect-ratio` combined
 * with an explicit competing `min-height` on a flex item is a documented
 * cross-engine edge case in exactly how the item's automatic minimum size
 * gets computed, which can differ between Blink and WebKit even though the
 * source looks identical. The padding-bottom trick below has no dependency
 * on `aspect-ratio` at all - percentage padding is always resolved against
 * the *containing block's width*, a plain-CSS behavior with no known
 * cross-browser divergence, and has worked this way for over a decade.
 * `min-w-0` on the box itself guards against the same flex-item
 * default-sizing issue independently of the aspect-ratio question. */
function AvatarBox({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className="relative w-full min-w-0 overflow-hidden rounded-2xl" style={AVATAR_CLIP_STYLE}>
      {/* Reserves the box's height - 16:9 of its own width from `md` up (with a
      280px floor), a fluid `dvh`-based height on phones so the avatar is
      large without ever exceeding the screen (`.avatar-stage-spacer` in
      globals.css) - `aria-hidden` and otherwise empty, it contributes no
      content, only space. Compact (a Practice with Mariam checkpoint mounted
      beside the fullscreen video, not full-bleed) uses a smaller fixed
      height instead - that panel is a narrow fixed-width column, not the
      page, so the responsive spacer sizing is the wrong fit there. */}
      {compact ? <div aria-hidden="true" style={{ height: 220 }} /> : <div aria-hidden="true" className="avatar-stage-spacer" />}
      <div className="absolute inset-0" style={AVATAR_BACKDROP_STYLE}>
        {children}
      </div>
    </div>
  );
}

/** Real "Discuss with Mariam" session. Renders the SpatialReal avatar with the SpatialReal Web SDK
 * (`@spatialreal/web-sdk`, LiveKit session: https://docs.spatialreal.ai/avatar-integration/livekit/web-client), not a
 * plain LiveKit `<video>` track: SpatialReal publishes animation/motion data, which only its SDK decodes and draws. The
 * SDK also plays Mariam's voice itself, so the room's audio tracks are never attached anywhere else. Never requests the
 * student's own camera (FR-024/NFR-008) - only their microphone, and only once connected. The SpatialReal API key
 * never reaches the browser: the API hands out a short-lived session token per session. */
export function MariamSession({
  topicId,
  enrollmentId,
  watched,
  onActiveChange,
  onSessionReady,
  onWeakNetworkFallback,
  checkpointId,
  fixedDurationMinutes,
  compact,
  onEnded,
  conversationGoal,
  learningObjective,
}: {
  topicId: string;
  enrollmentId?: string;
  watched: boolean;
  onActiveChange?: (active: boolean) => void;
  // Stage 3: Avatar -> Cartoon handoff. Reports this session's own id once it is live, and `null` once it stops
  // being usable as a handoff source (ended/errored/unmounted) - `PlayerMain` uses this id only to call
  // `POST /sessions/{id}/handoff` when the student switches to Cartoon; it is never used to end or alter this session.
  onSessionReady?: (sessionId: string | null) => void;
  // Stage 4: automatic weak-network fallback. Called ONLY when the student accepts the "switch to Cartoon?" offer
  // below, with this session's own (still internally known, even though `onSessionReady` already reported `null` by
  // then) session id - `PlayerMain` passes its EXISTING Stage 3 `handleAvatarToCartoonHandoff`, the exact same
  // `POST /sessions/{id}/handoff` call path a manual switch uses. Returns whether it succeeded so the offer dialog
  // can show a recoverable error instead of silently doing nothing.
  onWeakNetworkFallback?: (sessionId: string) => Promise<boolean | undefined>;
  // Interactive Video "Practice with Mariam" checkpoint support (additive - every prop below is undefined/false for
  // the existing "Discuss with Mariam" tab, which keeps that call site byte-for-byte behaviorally unchanged).
  /** Threaded through to `POST /sessions/start`'s optional `checkpoint_id` so the live session is tied to this
   * checkpoint (server-side duration cap, completion status, etc). Presence of this prop is what turns on every
   * other checkpoint-only behavior below - never gated on `compact` alone. */
  checkpointId?: string;
  /** The checkpoint's authored session length, shown only as an idle-state hint before the student starts - the
   * actual countdown always runs off `max_duration_minutes` in the `start()` response, which the backend already
   * caps to this value server-side, so there is nothing else for this prop to drive. */
  fixedDurationMinutes?: number;
  /** Smaller layout suited to the fixed-width side panel of the Full Lesson Screen, and suppresses the weak-network
   * "switch to Cartoon?" offer entirely - a checkpoint practice is short and fixed-mode, so there is no other mode
   * to switch to here. */
  compact?: boolean;
  /** Fires once, whenever this checkpoint's session stops being live for any reason. Only meaningful (and only
   * ever called) when `checkpointId` is set. */
  onEnded?: (reason: "completed" | "error" | "user_ended") => void;
  /** The checkpoint's own teacher-authored `conversation_goal`/`learning_objective` (see
   * `InteractiveVideoCheckpoint`) - shown as a small lesson-specific header so the overlay feels tied to this exact
   * paused moment, not a generic "Discuss with Mariam" tab. Only ever passed alongside `checkpointId`. */
  conversationGoal?: string;
  learningObjective?: string;
}) {
  const { t } = useI18n();
  const { state: authState } = useAuth();
  // The student layout deliberately lets admins/root browse the student view
  // (that's how the sidebar's Student/Admin switch works), but a live session
  // is a student-owned record: `POST /sessions/start` is student-only, so an
  // admin/root token gets a raw 403 there. Gate the action to that real
  // capability instead of surfacing a confusing "you don't have permission".
  const isStudent = authState.status === "authenticated" && authState.user.role === "student";
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<SpatialRealAvatarConnection | null>(null);
  const [micRequested, setMicRequested] = useState(true);
  // Stage 3 handoff source id - see `onSessionReady`'s own doc above.
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Counts down from this course's actual time budget (see
  // `ProgressService.get_topic_session_minutes`), not the student's flat
  // daily cap - `null` until the session actually starts.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Stage 4: automatic weak-network fallback offer. One tracker per mount (a fresh topic/session gets a fresh
  // count) - see `weakNetworkFallback.ts` for exactly what counts as "one qualifying failure" and why. This never
  // touches `avatarRuntime.ts`'s own `rejoin()`/backoff/stall-guard logic - it only watches the same `onAvatarError`
  // callback this component already received before this stage.
  const weakNetworkTrackerRef = useRef(createWeakNetworkFallbackTracker());
  const [showWeakNetworkOffer, setShowWeakNetworkOffer] = useState(false);
  const [weakNetworkSwitchPending, setWeakNetworkSwitchPending] = useState(false);
  const [weakNetworkSwitchError, setWeakNetworkSwitchError] = useState<string | null>(null);
  // A checkpoint practice is short/fixed-mode: there is no other mode to switch to, so the offer never applies.
  const weakNetworkOfferEnabled = !compact && !checkpointId;

  // Checkpoint practice only: distinguishes "the student pressed End" from "the connection dropped on its own" so
  // `onEnded` can report an accurate reason - `avatar.disconnect()` (called by both the End button below and the
  // hook's own unmount cleanup) always routes through the same `onDisconnected` callback either way.
  const userEndedRef = useRef(false);

  // Warm the SDK while the page is idle, so the click handler below can use the SDK's own audio-unlock helper. Kept in
  // this component's state (not module state), so nothing about a session is ever shared.
  const [audioSdk, setAudioSdk] = useState<AudioUnlockSdk | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSpatialRealSdk()
      .then(sdk => {
        if (!cancelled) setAudioSdk(sdk);
      })
      .catch(() => undefined); // offline: the click falls back to a plain audio context
    return () => {
      cancelled = true;
    };
  }, []);

  const avatar = useSpatialRealAvatar({
    connection: connection ?? { roomName: "", token: "", url: "", appId: "", avatarId: "", credential: "" },
    enabled: connection !== null,
    publishMicrophone: micRequested,
    onAvatarError: err => {
      setError(err.message);
      setPhase("error");
      // Stage 4: count this ONLY if it is a qualifying failure (see the tracker's own doc) - every other fatal error
      // (credentials, session-ended, mic, resource load, ...) is neither counted nor resets the count.
      if (weakNetworkOfferEnabled && weakNetworkTrackerRef.current.recordError(err)) setShowWeakNetworkOffer(true);
      if (checkpointId) onEnded?.("error");
    },
    onDisconnected: () => {
      setPhase(prev => (prev === "error" ? prev : "ended"));
      setConnection(null);
      if (checkpointId) onEnded?.(userEndedRef.current ? "user_ended" : "completed");
    },
  });

  // Re-arms the one-time offer on a genuinely healthy reconnect (see the tracker's `recordSuccess` doc) - a fresh
  // `start()` or a `rejoin()` that actually got back to "connected". Calling this on every "connected" (including the
  // very first one, where the count is already 0) is a harmless no-op.
  useEffect(() => {
    if (avatar.status === "connected") weakNetworkTrackerRef.current.recordSuccess();
  }, [avatar.status]);

  const caption = useAvatarCaption(avatar.room);

  // Lets the lesson player lock the practice-mode switch while a session exists (UI only; leaving this component
  // still ends the session via the hook's cleanup, exactly as before).
  // `avatar.status === "idle"` while phase is "live" means the avatar was torn down (End pressed while Mariam was still joining) -
  // the lock must not keep the student on a screen with nothing left to end.
  const active = isAvatarSessionActive(phase) && (phase !== "live" || avatar.status !== "idle");
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);

  // Usable as a handoff source only once actually connected and live.
  useEffect(() => {
    onSessionReady?.(phase === "live" ? sessionId : null);
  }, [phase, sessionId, onSessionReady]);
  useEffect(() => () => onSessionReady?.(null), [onSessionReady]);

  const start = useCallback(async () => {
    // FIRST, synchronously, while the click still counts: the browser only lets Mariam's voice play through an audio
    // context created inside the user gesture, and everything below awaits the network.
    const audioContext = createAvatarAudioContext(audioSdk);
    setPhase("connecting");
    setError(null);
    userEndedRef.current = false;
    try {
      const { server_url, participant_token, room_name, max_duration_minutes, session_id } = await sessionsApi.start(topicId, undefined, enrollmentId, checkpointId);
      // The SpatialReal session token is minted by our API for THIS session (never the API key), together with the
      // public App ID / Avatar ID - the same app and avatar the hosted agent drives.
      const avatarCredential = await sessionsApi.avatarToken(session_id);
      setSessionId(session_id);
      setMicRequested(true);
      setConnection({
        roomName: room_name,
        token: participant_token,
        url: server_url,
        appId: avatarCredential.app_id,
        avatarId: avatarCredential.avatar_id,
        credential: avatarCredential.session_token,
        audioContext,
      });
      setSecondsLeft(max_duration_minutes * 60);
      setPhase("live");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("mariamSession.startError"));
      setPhase("error");
    }
  }, [topicId, enrollmentId, checkpointId, t, audioSdk]);

  const end = useCallback(async () => {
    userEndedRef.current = true;
    await avatar.disconnect();
  }, [avatar]);

  // Stage 4: the offer's "Switch to Cartoon" button. By the time this offer can even appear, `avatarRuntime.ts`'s
  // own `release()` has already run (it is called right after the exhausted-rejoin `onError` that got us here) - the
  // LiveKit room, audio tracks and microphone are already torn down, so there is nothing left here to clean up
  // before calling the SAME handoff endpoint a manual switch uses. `sessionId` (this component's own state, never
  // cleared on error - only the "ready" report to `PlayerMain` is) is what lets the handoff still target the right
  // source session even though `PlayerMain`'s own copy has already gone back to `null`.
  const acceptWeakNetworkOffer = useCallback(async () => {
    if (!sessionId || !onWeakNetworkFallback || weakNetworkSwitchPending) return;
    setWeakNetworkSwitchPending(true);
    setWeakNetworkSwitchError(null);
    try {
      const ok = await onWeakNetworkFallback(sessionId);
      if (ok) {
        // Success: `PlayerMain` has already switched `practice` to "cartoon", which unmounts this component (and,
        // with it, this dialog) - closing it here too just avoids a one-frame flash of a now-stale offer first.
        setShowWeakNetworkOffer(false);
      } else {
        // Fully offline / handoff unreachable: fail honestly, stay right here with a recoverable error and both
        // buttons still live - never hang, never imply success, never leave the student on a blank screen.
        setWeakNetworkSwitchError(t("mariamSession.weakNetworkSwitchFailed"));
      }
    } catch {
      setWeakNetworkSwitchError(t("mariamSession.weakNetworkSwitchFailed"));
    } finally {
      setWeakNetworkSwitchPending(false);
    }
  }, [sessionId, onWeakNetworkFallback, weakNetworkSwitchPending, t]);

  // Decline (or dismiss, e.g. Escape/backdrop): preserves the existing Avatar recovery/error state exactly as it
  // already was (the "Start/Talk again" screen below, untouched by this stage) - no suppression of anything in
  // `avatarRuntime.ts`, and the offer is not re-shown again this "arm" (see the tracker's `recordSuccess` doc for
  // when it re-arms).
  const declineWeakNetworkOffer = useCallback(() => {
    setShowWeakNetworkOffer(false);
    setWeakNetworkSwitchError(null);
  }, []);

  // Purely a display countdown - the actual cutoff (and Mariam's spoken
  // warning before it) is enforced server-side by the LiveKit agent worker
  // (see `livekit_agent/agent.py`'s `_enforce_max_duration`); this just
  // mirrors that for the student to see. Gated on `status === "connected"`,
  // not just `phase === "live"`: the agent worker doesn't start its own
  // clock until the student has actually joined the room and Mariam starts
  // talking either (see `_run_session`'s `max_duration_task`), so ticking
  // this down from the moment `start()` resolves - while the avatar is
  // still loading assets and connecting, often several seconds - showed the
  // student time draining away before the session had really begun. One
  // interval per "connected" stretch, not re-created every tick -
  // `setSecondsLeft` reads the previous value itself rather than closing
  // over `secondsLeft`.
  useEffect(() => {
    if (phase !== "live" || avatar.status !== "connected") return;
    const interval = setInterval(() => {
      setSecondsLeft(prev => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, avatar.status]);

  const toggleMic = useCallback(() => setMicRequested(prev => !prev), []);

  const goalHeader = checkpointId && (conversationGoal || learningObjective) ? (
    <div className="rounded-xl border border-brand-blue/25 bg-brand-primary-pale/70 p-3 text-xs leading-relaxed text-ink">
      {learningObjective && <p className="m-0"><b className="text-brand-blue">{t("mariamSession.lessonGoalLabel")}</b> {learningObjective}</p>}
      {conversationGoal && <p className={learningObjective ? "m-0 mt-1" : "m-0"}>{conversationGoal}</p>}
    </div>
  ) : null;

  if (phase === "live" && connection) {
    const { bindContainer, isLoading, status, error: avatarError, micError, isPublishingMicrophone, isMicMuted, isMariamSpeaking, agentState, isStudentSpeaking } = avatar;
    // Reflects what the student just clicked, not the (slightly delayed, and
    // sometimes never-true-if-permission-denied) SDK-confirmed publishing
    // state - so the button visibly responds the instant it's clicked,
    // matching what a mute button should feel like.
    const micLooksOn = micRequested;
    const micStuck = micRequested && !isPublishingMicrophone && Boolean(micError);
    // `isMariamSpeaking` is the automatic half-duplex pause (Mariam speaking / thinking + a 250 ms hold) - it only
    // matters while the student wants the mic on; a student who muted themselves sees their own "Mic off" state instead.
    const micServerMuted = micRequested && (isMicMuted || isMariamSpeaking);
    // One authoritative turn state (see `avatarUiState.ts`), driven by LiveKit's published agent state when
    // available and by speaker detection otherwise.
    const turn = deriveAvatarTurn({ status, micRequested, isMariamSpeaking, isMicMuted, isPublishingMicrophone, agentState });
    const { showMic, showEnd } = avatarControls(status);
    const turnText =
      turn === "mariamSpeaking"
        ? t("mariamSession.mariamSpeakingMicPaused")
        : turn === "mariamThinking"
          ? t("mariamSession.mariamThinking")
          : turn === "yourTurn"
            ? // "We hear you" only while LiveKit itself reports the student's own mic as speaking.
              t(isStudentSpeaking ? "mariamSession.hearingYou" : "mariamSession.yourTurnSpeak")
            : turn === "micOff"
              ? t("mariamSession.micOff")
              : turn === "ending"
                ? t(STATUS_KEY.disconnecting)
                : turn === "error"
                  ? t(STATUS_KEY.error)
                  : turn === "connecting" && status === "connected"
                    ? t(STATUS_KEY.connecting) // connected to the room, waiting for Mariam (agent initializing)
                    : t(STATUS_KEY[status]);
    return (
      <div className="flex flex-col gap-3 md:gap-4">
        {goalHeader}
        <AvatarBox compact={compact}>
          <div ref={bindContainer} className="absolute inset-0 size-full" />
          {isLoading && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-brand-navy/85 px-4 text-center text-sm text-white/80">{t(STATUS_KEY[status])}</div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-brand-navy/90 px-4 text-center text-sm text-brand-coral">{avatarError?.message ?? t("mariamSession.connectionFailedGeneric")}</div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/30" />
          {/* One loading state only: while the overlay above is showing, the corner chip stays out of the way. */}
          {!isLoading && status === "connected" && (
            <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1.5 text-xs font-extrabold tracking-wide text-brand-primary-dark">
              <i className="size-1.5 animate-pulse rounded-full bg-brand-coral" aria-hidden="true" />
              {t("mariamSession.statusConnected")}
            </span>
          )}
          {secondsLeft !== null && (
            <span
              className={`absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-extrabold tabular-nums tracking-wide ${
                secondsLeft <= 30 ? "bg-brand-coral text-white" : "bg-white/95 text-brand-primary-dark"
              }`}
            >
              ⏱ {formatDuration(secondsLeft)}
            </span>
          )}
        </AvatarBox>
        {/* What Mariam is saying, as a caption - BELOW the avatar (never over her), same spot captions live in
        Voice Practice. Empty/collapsed when there's nothing to show yet, so it never reserves space on its own. */}
        {!isLoading && <AvatarCaption caption={caption} />}
        {/* Call status lives BELOW the avatar (never over Mariam) in a fixed-height slot so it cannot cause layout jumps. */}
        <div className="min-h-11">
          {!isLoading && (
            <AvatarTurnPill turn={turn} text={turnText} studentSpeaking={isStudentSpeaking} />
          )}
        </div>
        {micStuck && <p className="m-0 text-center text-xs text-brand-coral md:text-start">{t("mariamSession.micPermissionIssue")}</p>}
        <div className="flex items-start justify-center gap-8 md:justify-start">
          {showMic && (
            <div className="flex w-20 flex-col items-center gap-1.5">
              <button
                type="button"
                aria-pressed={!micLooksOn}
                aria-label={micServerMuted ? t("mariamSession.micMutedWhileSpeaking") : micLooksOn ? t("mariamSession.muteMic") : t("mariamSession.unmuteMic")}
                title={micServerMuted ? t("mariamSession.micMutedWhileSpeaking") : micLooksOn ? t("mariamSession.muteMicTitle") : t("mariamSession.unmuteMicTitle")}
                onClick={toggleMic}
                className={`grid size-14 place-items-center rounded-full transition-colors ${
                  micServerMuted ? "bg-accent-gold/25 text-[#8a6400]" : micLooksOn ? "bg-brand-primary-pale text-brand-navy" : "bg-brand-coral text-white"
                }`}
              >
                <Icon name={micServerMuted || !micLooksOn ? "micOff" : "mic"} className="size-6" />
              </button>
              <span className="text-xs font-semibold text-ink">
                {micServerMuted ? t("mariamSession.micMutedWhileSpeakingShort") : micLooksOn ? t("mariamSession.micOn") : t("mariamSession.micOff")}
              </span>
            </div>
          )}
          {showEnd && (
            <div className="flex w-20 flex-col items-center gap-1.5">
              <button
                type="button"
                aria-label={t("mariamSession.endSession")}
                title={t("mariamSession.endSessionTitle")}
                onClick={end}
                className="grid size-14 place-items-center rounded-full bg-brand-coral text-white transition-colors hover:bg-brand-coral/90"
              >
                <PhoneOff className="size-6" aria-hidden="true" />
              </button>
              <span className="text-xs font-semibold text-ink">{t("mariamSession.endCall")}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col gap-3 md:gap-4">
      {goalHeader}
      <AvatarBox compact={compact}>
        {/* Deliberately a CSS background-image, not `next/image`'s `fill` +
        `object-fit` (which is what this was before, and stayed visibly
        `cover`-cropped on iPhone no matter what `object-fit`/`objectPosition`
        value was passed - confirmed the source photo is a 290x366 portrait,
        so genuine `contain` behavior should show it narrower than this
        16:9-ish box with the room backdrop visible on both sides, not
        filling the width edge-to-edge). `fill` compiles to an absolutely
        positioned `<img>` (`position: absolute; inset: 0`) with `object-fit`
        set via inline style - that specific combination has a real, known
        history of being unreliable on iOS WebKit, independent of whether the
        style itself is correct. `background-size: contain` on a plain `div`
        has no such history, and this is a small, fixed, local asset with no
        real need for `next/image`'s responsive-loading pipeline - the
        tradeoff (no automatic AVIF/WebP negotiation or responsive srcset for
        this one image) is a reasonable trade for it actually rendering
        correctly on every device. */}
        <div
          role="img"
          aria-label={t("mariamSession.posterAlt")}
          className="absolute inset-0 size-full"
          style={{
            backgroundImage: "url('/mariam-poster.png')",
            backgroundSize: "contain",
            backgroundPosition: "bottom center",
            backgroundRepeat: "no-repeat",
          }}
        />
        {/* `w-full` on every child here isn't decorative - without it, a
        `flex-col items-center` container sizes each child to its own
        max-content (single-line) width instead of stretching it to the
        container, so on a narrow screen this text never wraps and just
        runs off the edge, clipped by this box's own `overflow-hidden`
        instead of wrapping onto a second line (confirmed live on iPhone
        widths). `text-center` still centers the (now-wrapped) text within
        the full width exactly as before - this doesn't change how it
        looks on wider screens where it already fit on one line. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-6 pb-4 pt-10 text-center text-white">
          {phase === "connecting" ? (
            <p className="w-full text-sm text-white/90">{t("mariamSession.connecting")}</p>
          ) : phase === "ended" ? (
            <>
              <b className="w-full text-sm">{t("mariamSession.sessionComplete")}</b>
              <p className="w-full text-xs text-white/70">{t("mariamSession.sessionSaved")}</p>
            </>
          ) : !isStudent ? (
            <p className="w-full text-sm text-white/90">{t("mariamSession.previewNotice")}</p>
          ) : (
            <p className="w-full text-sm text-white/90">
              {watched ? t("mariamSession.readyToStart") : t("mariamSession.watchFirst")}
              {checkpointId && fixedDurationMinutes ? ` (~${fixedDurationMinutes} min)` : ""}
            </p>
          )}
          {error && <p className="w-full rounded-lg bg-brand-coral/30 px-3 py-1.5 text-sm font-semibold text-white">{error}</p>}
        </div>
      </AvatarBox>
      <div className="flex justify-center md:justify-start">
        <button
          type="button"
          disabled={!isStudent || !watched || phase === "connecting"}
          onClick={start}
          title={!isStudent ? t("mariamSession.startDisabledPreview") : watched ? t("mariamSession.startTitleReady") : t("mariamSession.startTitleLocked")}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white shadow-[0_7px_17px_rgb(var(--brand-shadow-rgb)/.28)] disabled:opacity-40 md:inline-flex md:w-auto"
        >
          <Icon name="mic" className="size-4" /> {phase === "ended" ? t("mariamSession.talkAgain") : t("mariamSession.startSession")}
        </button>
      </div>
    </div>
    {/* Stage 4: the one-time "weak connection, switch to Cartoon?" offer, shown after the 3rd qualifying failure
    cycle (see `weakNetworkFallback.ts`). Only ever reachable here, in the non-live branch above, since the offer is
    raised from `onAvatarError`, which always moves `phase` to "error" first. Dismissing (Escape/backdrop) is treated
    the same as "Stay in Avatar" - never a silent automatic switch. */}
    {showWeakNetworkOffer && (
      <Dialog
        onClose={declineWeakNetworkOffer}
        dismissOnBackdropClick
        ariaLabel={t("mariamSession.weakNetworkOfferTitle")}
        className="w-[min(420px,92vw)] rounded-2xl border border-line bg-card p-5 shadow-card backdrop:bg-black/45"
      >
        <div className="flex flex-col gap-3 text-center">
          <b className="text-base text-ink">{t("mariamSession.weakNetworkOfferTitle")}</b>
          <p className="m-0 text-sm text-muted">{t("mariamSession.weakNetworkOfferBody")}</p>
          {weakNetworkSwitchError && (
            <p role="alert" className="m-0 rounded-lg bg-brand-coral/10 px-3 py-2 text-xs font-semibold text-brand-coral">
              {weakNetworkSwitchError}
            </p>
          )}
          <div className="mt-1 flex flex-col gap-2">
            <button
              type="button"
              disabled={weakNetworkSwitchPending}
              onClick={acceptWeakNetworkOffer}
              className="flex min-h-11 w-full items-center justify-center rounded-[10px] bg-brand-blue px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {t("mariamSession.weakNetworkSwitchToCartoon")}
            </button>
            <button
              type="button"
              disabled={weakNetworkSwitchPending}
              onClick={declineWeakNetworkOffer}
              className="flex min-h-11 w-full items-center justify-center rounded-[10px] bg-brand-primary-pale px-4 py-2.5 text-sm font-bold text-brand-navy disabled:opacity-40"
            >
              {t("mariamSession.weakNetworkStayInAvatar")}
            </button>
          </div>
        </div>
      </Dialog>
    )}
    </>
  );
}
