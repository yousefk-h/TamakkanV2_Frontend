"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { connectAvatar, type AvatarConnection, type SrMicState } from "./avatarRuntime";
import { watchAvatarTurn } from "./avatarTurn";
import { createMicGate } from "./micGate";
import { loadSpatialRealSdk } from "./sdk";
import type { SpatialRealAvatarConnectionStatus, SpatialRealAvatarState, UseSpatialRealAvatarOptions, UseSpatialRealAvatarResult } from "./types";

/** React binding for Mariam's avatar on the NEW SpatialReal Web SDK (`@spatialreal/web-sdk`). The lifecycle itself
 * (create -> start -> mic -> rejoin -> end/dispose) is `avatarRuntime.ts`; this hook only owns React state, the element
 * the avatar is drawn into, and the two things that depend on the live LiveKit room: the real `lk.agent.state` and the
 * half-duplex microphone gate (`avatarTurn.ts` + `micGate.ts`, unchanged by the SDK move).
 *
 * The browser never sees the SpatialReal API key: `connection.credential` is the short-lived session token the API
 * minted for this session. */

function createIdleState(): SpatialRealAvatarState {
  return {
    error: null,
    isConnected: false,
    isLoading: false,
    isPublishingMicrophone: false,
    isMicMuted: false,
    isMariamSpeaking: false,
    agentState: null,
    isStudentSpeaking: false,
    micError: null,
    room: null,
    status: "idle",
  };
}

const micFlags = (state: SrMicState) => ({ isPublishingMicrophone: state === "on" || state === "muted", isMicMuted: state === "muted" });

export function useSpatialRealAvatar(options: UseSpatialRealAvatarOptions): UseSpatialRealAvatarResult {
  const { connection, enabled = true, onAvatarError, onDisconnected, publishMicrophone = false } = options;
  const { appId, avatarId, audioContext, credential, roomName, token, url } = connection;

  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const [containerReady, setContainerReady] = useState(false);
  const [state, setState] = useState<SpatialRealAvatarState>(createIdleState);

  const connectionRef = useRef<AvatarConnection | null>(null);
  // The previous session's teardown: a container holds one session at a time, so the next one waits for it.
  const teardownRef = useRef<Promise<void>>(Promise.resolve());
  const callbacksRef = useRef({ onAvatarError, onDisconnected });
  useEffect(() => {
    callbacksRef.current = { onAvatarError, onDisconnected };
  }, [onAvatarError, onDisconnected]);
  const publishMicrophoneRef = useRef(publishMicrophone);
  useEffect(() => {
    publishMicrophoneRef.current = publishMicrophone;
  }, [publishMicrophone]);

  const bindContainer = useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node);
    setContainerReady(node ? node.offsetWidth > 0 && node.offsetHeight > 0 : false);
  }, []);

  // The avatar needs a container with its own non-zero size before the SDK can draw into it.
  useEffect(() => {
    if (!containerElement) return;
    const markReady = () => setContainerReady(containerElement.offsetWidth > 0 && containerElement.offsetHeight > 0);
    const observer = new ResizeObserver(markReady);
    observer.observe(containerElement);
    const frame = requestAnimationFrame(markReady);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [containerElement]);

  // One avatar session per connection. Everything below is keyed on the connection's own values, so a NEW session
  // (new room, new token) always gets a fresh avatar, and a stale one can never reach the new session's state.
  useEffect(() => {
    if (!enabled || !containerReady || !containerElement || !credential || !token || !url) return;

    const controller = new AbortController();
    let cancelled = false;
    const live = () => !cancelled;

    const run = async () => {
      await teardownRef.current;
      if (cancelled) return;
      let sdk;
      try {
        sdk = await loadSpatialRealSdk();
      } catch (error) {
        if (!live()) return;
        const err = error instanceof Error ? error : new Error("Failed to load the avatar.");
        setState(previous => ({ ...previous, error: err, isConnected: false, isLoading: false, status: "error" }));
        callbacksRef.current.onAvatarError?.(err);
        return;
      }
      if (cancelled) return;
      const opened = await connectAvatar({
        sdk,
        appId,
        avatarId,
        credential,
        livekitUrl: url,
        roomToken: token,
        container: containerElement,
        audioContext,
        signal: controller.signal,
        callbacks: {
          onStatus: (status: SpatialRealAvatarConnectionStatus) => {
            if (live()) setState(previous => ({ ...previous, status, isConnected: status === "connected", isLoading: status === "initializing" || status === "connecting" }));
          },
          onRoom: room => {
            if (live()) setState(previous => ({ ...previous, room }));
          },
          onMicState: micState => {
            if (live()) setState(previous => ({ ...previous, ...micFlags(micState) }));
          },
          onMicError: error => {
            if (live()) setState(previous => ({ ...previous, micError: error }));
          },
          onError: error => {
            if (!live()) return;
            setState(previous => ({ ...previous, error, isConnected: false, isLoading: false, room: null, status: "error" }));
            callbacksRef.current.onAvatarError?.(error);
          },
          onEnded: () => {
            if (!live()) return;
            setState(createIdleState());
            callbacksRef.current.onDisconnected?.();
          },
        },
      });
      if (cancelled) {
        await opened?.dispose(); // superseded while starting: release it before anything else may claim the container
        return;
      }
      connectionRef.current = opened;
      // Apply the student's current mic choice as soon as the call is live (also after a rejoin, inside the runtime).
      void opened?.setMicWanted(publishMicrophoneRef.current);
    };
    const running = run().catch(() => undefined);

    return () => {
      cancelled = true;
      controller.abort();
      const owned = connectionRef.current;
      connectionRef.current = null;
      // The next session waits for BOTH this one's in-flight start and its release.
      teardownRef.current = Promise.all([owned?.dispose(), running]).then(
        () => undefined,
        () => undefined,
      );
      setState(createIdleState());
    };
  }, [appId, audioContext, avatarId, containerElement, containerReady, credential, enabled, roomName, token, url]);

  // The student's own mute button: open / close the microphone.
  useEffect(() => {
    if (state.status !== "connected") return;
    void connectionRef.current?.setMicWanted(publishMicrophone);
  }, [publishMicrophone, state.status]);

  // Half-duplex conversation. PRIMARY signal: the real `lk.agent.state` of the tutor agent (agent-kind WITHOUT
  // `lk.publish_on_behalf`, so never the SpatialReal rendering participant) - the student's mic is open only while the
  // agent is `listening`. FALLBACK: LiveKit's speaker detection, only while no agent state is available. All wiring
  // (participant selection, reconnect re-read, stall guard) lives in `avatarTurn.ts`. The microphone is paused by
  // muting the SDK's own microphone (`mic.muted`) - no track is created, replaced or re-published by the gate - and
  // the student's manual mute is tracked separately and never overridden.
  const room = state.room;
  const gateRef = useRef<ReturnType<typeof createMicGate> | null>(null);
  useEffect(() => {
    if (!room) return;
    const gate = createMicGate({
      applyMic: enabledNow => connectionRef.current?.setMicPaused(!enabledNow),
      onPausedChange: paused => setState(previous => (previous.isMariamSpeaking === paused ? previous : { ...previous, isMariamSpeaking: paused })),
    });
    gateRef.current = gate;
    gate.setManualMuted(!publishMicrophoneRef.current);
    const stopWatching = watchAvatarTurn(room, {
      gate,
      onAgentState: agentState => setState(previous => (previous.agentState === agentState ? previous : { ...previous, agentState })),
      onStudentSpeaking: isStudentSpeaking => setState(previous => (previous.isStudentSpeaking === isStudentSpeaking ? previous : { ...previous, isStudentSpeaking })),
    });
    return () => {
      stopWatching();
      gate.dispose(); // clears any pending resume timer (disconnect / unmount / leaving Avatar Practice)
      if (gateRef.current === gate) gateRef.current = null;
    };
  }, [room]);

  // The student's own mute choice feeds the gate separately from "Mariam is speaking".
  useEffect(() => {
    gateRef.current?.setManualMuted(!publishMicrophone);
  }, [publishMicrophone, room]);

  const disconnect = useCallback(async () => {
    const owned = connectionRef.current;
    connectionRef.current = null;
    setState(previous => ({ ...previous, status: "disconnecting", isConnected: false, isLoading: false }));
    await Promise.resolve(owned?.dispose()).catch(() => undefined);
    setState(createIdleState());
    callbacksRef.current.onDisconnected?.();
  }, []);

  return useMemo(() => ({ ...state, bindContainer, disconnect }), [state, bindContainer, disconnect]);
}
