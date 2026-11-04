/** Presentation-only mapping for Voice Practice: which ONE visual state the call card shows.
 * It reads only real state the session already exposes (phase, connection, agent state, mic) - no invented audio
 * levels, no new behaviour. Pure, so it is unit-tested without a browser. */

export type VoiceUiPhase = "idle" | "starting" | "live" | "ending" | "ended" | "error";
export type VoiceUiConnection = "idle" | "connecting" | "connected" | "reconnecting" | "ended";
export type VoiceUiAgentState = "initializing" | "idle" | "listening" | "thinking" | "speaking";

export type VoiceIndicator =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "waiting" // live, waiting for the tutor to join
  | "thinking"
  | "speaking"
  | "listening"
  | "muted"
  | "ending"
  | "ended"
  | "error";

export interface VoiceUiInput {
  phase: VoiceUiPhase;
  connection: VoiceUiConnection;
  agentPresent: boolean;
  agentState: VoiceUiAgentState | null | undefined;
  micEnabled: boolean;
}

export function deriveVoiceIndicator(i: VoiceUiInput): VoiceIndicator {
  if (i.phase === "error") return "error";
  if (i.phase === "ended") return "ended";
  if (i.phase === "ending") return "ending";
  if (i.phase === "starting") return "connecting";
  if (i.phase === "idle") return "idle";
  // live
  if (i.connection === "connecting") return "connecting";
  if (i.connection === "reconnecting") return "reconnecting";
  if (!i.agentPresent || i.agentState === "initializing") return "waiting";
  if (i.agentState === "speaking") return "speaking";
  if (i.agentState === "thinking") return "thinking";
  return i.micEnabled ? "listening" : "muted";
}

/** Controls are shown only when they can be used: the mic once the call is connected (or reconnecting), End
 * whenever a call exists. Nothing is shown while starting or before the session. */
export function voiceControls(i: Pick<VoiceUiInput, "phase" | "connection">): { showMic: boolean; showEnd: boolean } {
  const callExists = i.phase === "live" || i.phase === "ending";
  return {
    showEnd: callExists,
    showMic: callExists && (i.connection === "connected" || i.connection === "reconnecting"),
  };
}
