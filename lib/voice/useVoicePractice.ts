"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, sessionsApi } from "@/lib/api/client";
import type { SessionStartResponse, VoiceSessionEndRequest } from "@/lib/api/types";
import { VoiceRoom, type VoiceEndCause, type VoiceRoomSnapshot } from "./voiceRoom";

/** One Voice Practice session at a time, for one lesson, on the existing
 * session API (`POST /sessions/start` with `mode: "voice_practice"`, then the
 * student-owned `/connected` and `/end`). The backend picks the lesson's
 * prompt/level; this hook only ever sends the topic id.
 *
 * Every start creates a fresh `VoiceRoom` and session id held in refs local
 * to this hook instance - nothing is module-level, so two tabs or two
 * students never share a room, token or transcript. The session is ended
 * (and its room released server-side) on End, agent leave, lost connection,
 * max duration, unmount (switching to Avatar Practice / leaving the lesson)
 * and page unload. */

export type VoicePhase = "idle" | "starting" | "live" | "ending" | "ended" | "error";

// `fetch(..., { keepalive })` bodies are capped at 64 KB by browsers.
const KEEPALIVE_BODY_LIMIT = 60_000;
const IDLE_SNAPSHOT: VoiceRoomSnapshot = {
  connection: "idle", agentPresent: false, agentState: null, micEnabled: false, micPending: false, micError: null, audioBlocked: false, segments: [],
};
const noopSubscribe = () => () => {};

export function useVoicePractice(topicId: string, messages: { startError: string; connectionFailed: string }, enrollmentId?: string) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [endCause, setEndCause] = useState<VoiceEndCause | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [voiceRoom, setVoiceRoom] = useState<VoiceRoom | null>(null);
  const roomRef = useRef<VoiceRoom | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const unmountedRef = useRef(false);
  const startingRef = useRef(false);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const snapshot = useSyncExternalStore(
    voiceRoom?.subscribe ?? noopSubscribe,
    voiceRoom?.getSnapshot ?? (() => IDLE_SNAPSHOT),
    () => IDLE_SNAPSHOT,
  );

  const finish = useCallback(async (sessionId: string, room: VoiceRoom, cause: VoiceEndCause) => {
    // Already reported (the `pagehide` keepalive request) - don't send twice.
    if (sessionIdRef.current !== sessionId) return;
    sessionIdRef.current = null;
    if (!unmountedRef.current) {
      setPhase("ending");
      setEndCause(cause);
    }
    const body: VoiceSessionEndRequest = { end_reason: cause, browser_transcript: room.finalTranscript() };
    try {
      await sessionsApi.endVoice(sessionId, body);
    } catch (err) {
      // A rejected transcript must never stop the session from being closed.
      if (err instanceof ApiError && err.status === 422) {
        await sessionsApi.endVoice(sessionId, { ...body, browser_transcript: [] }).catch(() => undefined);
      }
    }
    if (unmountedRef.current) return;
    if (cause === "connection_failure") {
      setError(messagesRef.current.connectionFailed);
      setPhase("error");
    } else {
      setPhase("ended");
    }
  }, []);

  // Shared by a cold `start()` and a handoff-driven `startFromHandoff()`: once a `SessionStartResponse` is in hand
  // (freshly minted, or carried over from `POST /sessions/{id}/handoff`), joining the room is identical either way.
  const beginWithSession = useCallback(
    async (started: SessionStartResponse) => {
      const { session_id: sessionId, server_url, participant_token, room_name, max_duration_minutes } = started;
      if (!room_name.startsWith("voice-")) {
        // An API without Voice Practice ignores `mode` and mints an Avatar
        // Practice token instead. Never join it: no join, no room, no agent.
        setError(messagesRef.current.startError);
        setPhase("error");
        return;
      }
      if (unmountedRef.current) {
        // Left the lesson while the start/handoff request was in flight: close the record, never join.
        void sessionsApi.endVoice(sessionId, { end_reason: "connection_failure", browser_transcript: [] }).catch(() => undefined);
        return;
      }

      const room: VoiceRoom = new VoiceRoom({
        getAudioContainer: () => audioContainerRef.current,
        onAgentJoined: () => void confirmConnected(sessionId),
        onEnded: cause => void finish(sessionId, room, cause),
      });
      roomRef.current = room;
      sessionIdRef.current = sessionId;
      setVoiceRoom(room);
      setSecondsLeft(max_duration_minutes * 60);
      setPhase("live");
      await room.connect(server_url, participant_token);
    },
    [finish],
  );

  const start = useCallback(async () => {
    // Never two rooms at once, even on a double click.
    if (startingRef.current || (roomRef.current && !roomRef.current.isEnded)) return;
    startingRef.current = true;
    setPhase("starting");
    setError(null);
    setEndCause(null);
    let started;
    try {
      started = await sessionsApi.start(topicId, "voice_practice", enrollmentId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : messagesRef.current.startError);
      setPhase("error");
      return;
    } finally {
      startingRef.current = false;
    }
    await beginWithSession(started);
  }, [topicId, enrollmentId, beginWithSession]);

  // Joins a Cartoon session ALREADY created by a handoff (`sessionsApi.handoff`) - never calls `POST /sessions/start`
  // itself, so a handoff never creates (or joins) a second, parallel session. The caller (`CartoonSession`) is
  // responsible for calling `sessionsApi.handoff` and only invoking this on success.
  const startFromHandoff = useCallback(
    async (started: SessionStartResponse) => {
      if (startingRef.current || (roomRef.current && !roomRef.current.isEnded)) return;
      startingRef.current = true;
      setPhase("starting");
      setError(null);
      setEndCause(null);
      try {
        await beginWithSession(started);
      } finally {
        startingRef.current = false;
      }
    },
    [beginWithSession],
  );

  const end = useCallback(() => {
    void roomRef.current?.end("user_ended");
  }, []);

  // Display countdown, and the max-duration cutoff: the hosted Builder agent
  // does not know this lesson's time budget, so the browser enforces it.
  useEffect(() => {
    if (phase !== "live" || !snapshot.agentPresent) return;
    const interval = setInterval(() => setSecondsLeft(prev => (prev === null ? null : Math.max(0, prev - 1))), 1000);
    return () => clearInterval(interval);
  }, [phase, snapshot.agentPresent]);
  useEffect(() => {
    if (phase === "live" && secondsLeft === 0) void roomRef.current?.end("max_duration_reached");
  }, [phase, secondsLeft]);

  // Unmount (mode switch, leaving the lesson) and page unload both end the call.
  useEffect(() => {
    unmountedRef.current = false;
    const onPageHide = () => {
      const room = roomRef.current;
      const sessionId = sessionIdRef.current;
      if (!room || room.isEnded || !sessionId) return;
      sessionIdRef.current = null; // `finish` below must not send a second request
      let body: VoiceSessionEndRequest = { end_reason: "user_ended", browser_transcript: room.finalTranscript() };
      if (JSON.stringify(body).length > KEEPALIVE_BODY_LIMIT) body = { ...body, browser_transcript: [] };
      void sessionsApi.endVoice(sessionId, body, { keepalive: true }).catch(() => undefined);
      void room.end("user_ended");
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      unmountedRef.current = true;
      void roomRef.current?.end("user_ended");
    };
  }, []);

  return { phase, error, endCause, secondsLeft, snapshot, start, startFromHandoff, end, audioContainerRef, room: voiceRoom };
}

/** LiveKit's participant list can lag the agent's join by a moment, so the
 * backend answers 409 until it sees the agent - retry briefly. */
async function confirmConnected(sessionId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await sessionsApi.confirmVoiceConnected(sessionId);
      return;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 409) return;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}
