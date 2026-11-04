import { RoomEvent } from "livekit-client";

import { readAgentState, type AgentState, type ParticipantLike } from "./agentState";
import type { MicGate } from "./micGate";

/** Feeds ONE room's turn signals into ONE mic gate (and reports them to the UI). Every call owns its own timer and
 * listeners and removes them on dispose, so nothing leaks between sessions: a stale event from an old room can only
 * reach the old (disposed) watcher, never a new session's gate.
 *
 *  - PRIMARY: `lk.agent.state` of the real tutor agent (see `agentState.ts` - never the SpatialReal rendering
 *    participant), re-read from the room on every relevant event, including after a reconnect.
 *  - FALLBACK: `ActiveSpeakersChanged` (any remote speaker), used by the gate only while there is no agent state.
 *  - STALL GUARD: the state is only ever "not listening" while Mariam is working. If it stays in thinking /
 *    initializing / idle for `stallMs`, the signal is treated as unavailable (null) so the mic can never stay
 *    paused forever on a stuck attribute; the next state change restores it. */

export const DEFAULT_AGENT_STALL_MS = 15_000;

export interface AvatarTurnRoom {
  remoteParticipants: { values(): Iterable<ParticipantLike> };
  activeSpeakers: ReadonlyArray<{ isLocal?: boolean }>;
  on(event: unknown, handler: (...args: never[]) => void): unknown;
  off(event: unknown, handler: (...args: never[]) => void): unknown;
}

export interface AvatarTurnOptions {
  gate: Pick<MicGate, "setAgentState" | "setMariamSpeaking">;
  /** The effective agent state the UI should use: null = unavailable (missing / stalled) -> speaker fallback. */
  onAgentState?: (state: AgentState | null) => void;
  /** True only while LiveKit itself reports the LOCAL participant as speaking. */
  onStudentSpeaking?: (speaking: boolean) => void;
  stallMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

export function watchAvatarTurn(room: AvatarTurnRoom, options: AvatarTurnOptions): () => void {
  const { gate, onAgentState, onStudentSpeaking, stallMs = DEFAULT_AGENT_STALL_MS } = options;
  const setTimer = options.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimeoutFn ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let disposed = false;
  let published: AgentState | null | undefined; // last value reported to the UI (undefined = nothing yet)
  let lastRaw: AgentState | null = null;
  let stalled = false;
  let stallTimer: unknown = null;
  let studentSpeaking = false;

  const cancelStallTimer = () => {
    if (stallTimer !== null) {
      clearTimer(stallTimer);
      stallTimer = null;
    }
  };

  const publish = (effective: AgentState | null) => {
    gate.setAgentState(effective);
    if (effective !== published) {
      published = effective;
      onAgentState?.(effective);
    }
  };

  const refreshAgentState = () => {
    if (disposed) return;
    const raw = readAgentState(room.remoteParticipants.values());
    if (raw !== lastRaw) {
      lastRaw = raw;
      stalled = false; // any new value (including "no value") restarts the stall budget
      cancelStallTimer();
    }
    if (raw !== null && raw !== "listening" && raw !== "speaking" && !stalled && stallTimer === null) {
      stallTimer = setTimer(() => {
        stallTimer = null;
        if (disposed) return;
        stalled = true;
        publish(null);
      }, stallMs);
    }
    publish(stalled ? null : raw);
  };

  const syncSpeakers = (speakers: ReadonlyArray<{ isLocal?: boolean }> = room.activeSpeakers) => {
    if (disposed) return;
    gate.setMariamSpeaking(speakers.some(speaker => !speaker.isLocal));
    const local = speakers.some(speaker => Boolean(speaker.isLocal));
    if (local !== studentSpeaking) {
      studentSpeaking = local;
      onStudentSpeaking?.(local);
    }
  };

  const handleParticipantsChanged = () => refreshAgentState();
  const handleAttributesChanged = () => refreshAgentState();
  const handleSpeakers = (speakers?: ReadonlyArray<{ isLocal?: boolean }>) => syncSpeakers(speakers);
  const handleReconnected = () => {
    // A "changed" event can be lost while reconnecting: re-read the current truth from the room.
    refreshAgentState();
    syncSpeakers();
  };

  const events: Array<[unknown, (...args: never[]) => void]> = [
    [RoomEvent.ParticipantConnected, handleParticipantsChanged],
    [RoomEvent.ParticipantDisconnected, handleParticipantsChanged],
    [RoomEvent.ParticipantAttributesChanged, handleAttributesChanged],
    [RoomEvent.ActiveSpeakersChanged, handleSpeakers as (...args: never[]) => void],
    [RoomEvent.Reconnected, handleReconnected],
  ];
  for (const [event, handler] of events) room.on(event, handler);

  refreshAgentState();
  syncSpeakers();

  return () => {
    if (disposed) return;
    disposed = true;
    cancelStallTimer();
    for (const [event, handler] of events) room.off(event, handler);
  };
}
