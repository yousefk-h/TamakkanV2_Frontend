import type { Room } from "livekit-client";

import type { AgentState } from "./agentState";

export type SpatialRealAvatarConnectionStatus = "idle" | "initializing" | "connecting" | "connected" | "disconnecting" | "error";

/** Everything the browser needs to draw Mariam and join her LiveKit room. The `credential`, `appId` and `avatarId`
 * come from the API (`POST /sessions/{id}/avatar-token`): `credential` is SpatialReal's SHORT-LIVED session token -
 * the SpatialReal API key never reaches the browser. */
export interface SpatialRealAvatarConnection {
  /** LiveKit room name (display / identity of the session; the room itself is in `token`). */
  roomName: string;
  /** LiveKit room token. */
  token: string;
  /** LiveKit server URL. */
  url: string;
  /** SpatialReal App ID the credential belongs to (same app the hosted agent uses). */
  appId: string;
  /** SpatialReal avatar to render (same avatar the hosted agent drives). */
  avatarId: string;
  /** SpatialReal session token (the SDK's `credential`). */
  credential: string;
  /** Created at the very top of the student's click, before any `await`, so the browser lets Mariam's voice play. */
  audioContext?: AudioContext;
}

export interface UseSpatialRealAvatarOptions {
  connection: SpatialRealAvatarConnection;
  enabled?: boolean;
  onAvatarError?: (error: Error) => void;
  /** The live session ended on its own (Mariam left / the room closed) or the student ended it. */
  onDisconnected?: () => void;
  /** The student wants the microphone on (their own mute button). */
  publishMicrophone?: boolean;
}

export interface SpatialRealAvatarState {
  error: Error | null;
  isConnected: boolean;
  isLoading: boolean;
  /** The microphone is open (on or paused by the half-duplex gate). */
  isPublishingMicrophone: boolean;
  // True while the microphone is open but *muted* - by the half-duplex gate while Mariam has the floor. Distinct from
  // `isPublishingMicrophone`, which is about whether the microphone is open at all.
  isMicMuted: boolean;
  // True while the half-duplex gate has the student's mic paused: Mariam is speaking / thinking (or, with no agent
  // state, speaker detection says she is speaking), plus the short (250 ms) hold after she gives the floor back.
  // Independent of the student's own mute choice. The NAME is historic: use `agentState` to tell speaking from thinking.
  isMariamSpeaking: boolean;
  // The real LiveKit `lk.agent.state` of the tutor agent (never the SpatialReal rendering participant), or null when
  // unavailable (attribute missing, agent not joined, or the state looks stuck) - the UI and the mic gate then fall
  // back to speaker detection.
  agentState: AgentState | null;
  // True only while LiveKit reports the LOCAL participant as speaking.
  isStudentSpeaking: boolean;
  // Set when the microphone cannot be opened (permission denied, no device) - separate from `error`, which is fatal to
  // the whole avatar session. A mic problem shouldn't take down an otherwise-working call.
  micError: Error | null;
  /** The LiveKit room while the session is live (for agent state / speaker signals) - never attach its tracks elsewhere. */
  room: Room | null;
  status: SpatialRealAvatarConnectionStatus;
}

export interface UseSpatialRealAvatarResult extends SpatialRealAvatarState {
  /** Ref callback for the element the avatar is drawn into (needs its own non-zero width and height). */
  bindContainer: (node: HTMLDivElement | null) => void;
  /** End the call (student pressed End): leaves the room and releases the avatar. */
  disconnect: () => Promise<void>;
}
