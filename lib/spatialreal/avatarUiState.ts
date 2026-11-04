/** Presentation-only mapping for Avatar Practice's call strip and controls. Reads the state the session/hook
 * already exposes (including the mic gate's `isMariamSpeaking`); contains no mic logic of its own. */

import type { AgentState } from "./agentState";

/** The ONE authoritative Avatar turn state. Every value is backed by a real signal:
 *  connecting      - SDK not connected yet, or the agent is initializing / idle / not joined
 *  mariamSpeaking  - `lk.agent.state === "speaking"` (or, with no agent state, LiveKit speaker detection)
 *  mariamThinking  - `lk.agent.state === "thinking"` (only ever from the real state - the fallback cannot know)
 *  yourTurn        - agent `listening`, the mic gate has released the mic and the mic is publishing
 *  micOff          - the student's own mute (always wins over the states below it)
 *  ending          - the SDK is tearing the call down
 *  listening       - connected and the agent is listening, but the student's mic is not publishing yet
 *  error           - SDK error */
export type AvatarTurn = "connecting" | "mariamSpeaking" | "mariamThinking" | "yourTurn" | "micOff" | "listening" | "ending" | "error";

export interface AvatarUiInput {
  /** SDK connection status. */
  status: "idle" | "initializing" | "connecting" | "connected" | "disconnecting" | "error";
  /** The student wants the mic on (their own mute button state). */
  micRequested: boolean;
  /** Mic gate: the mic is paused for Mariam (plus the short hold after she gives the floor back). */
  isMariamSpeaking: boolean;
  isMicMuted: boolean;
  isPublishingMicrophone: boolean;
  /** Effective `lk.agent.state`; null/undefined = unavailable -> the speaker-detection fallback decides. */
  agentState?: AgentState | null;
}

export function deriveAvatarTurn(i: AvatarUiInput): AvatarTurn {
  if (i.status === "error") return "error";
  if (i.status === "disconnecting") return "ending";
  if (i.status !== "connected") return "connecting";
  if (!i.micRequested) return "micOff"; // the student's own mute always wins the label
  switch (i.agentState ?? null) {
    case "speaking":
      return "mariamSpeaking";
    case "thinking":
      return "mariamThinking";
    case "initializing":
    case "idle":
      return "connecting";
    case "listening":
      // Still inside the short resume hold (the gate has not released the mic yet): not the student's turn yet.
      if (i.isMariamSpeaking || i.isMicMuted) return "mariamSpeaking";
      return i.isPublishingMicrophone ? "yourTurn" : "listening";
    default:
      // No agent state: the original speaker-detection behaviour.
      if (i.isMariamSpeaking || i.isMicMuted) return "mariamSpeaking";
      return i.isPublishingMicrophone ? "yourTurn" : "listening";
  }
}

/** The mic button only makes sense once connected; End stays available in every other state (connecting, idle, error) so
 * a stuck or half-torn-down connection can always be cancelled. */
export function avatarControls(status: AvatarUiInput["status"]): { showMic: boolean; showEnd: boolean } {
  return { showMic: status === "connected", showEnd: status !== "disconnecting" };
}

/** True while an Avatar Practice session exists (used to lock the practice-mode switch). */
export function isAvatarSessionActive(phase: "idle" | "connecting" | "live" | "ended" | "error"): boolean {
  return phase === "connecting" || phase === "live";
}
