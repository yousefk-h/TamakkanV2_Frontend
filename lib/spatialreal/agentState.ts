import { ParticipantKind } from "livekit-client";

/** Reading LiveKit's published agent state in the Avatar room. Pure helpers - no React, no room side effects.
 *
 * LiveKit Agents publishes the AgentSession state as the `lk.agent.state` participant attribute of the AGENT
 * participant. The SpatialReal rendering participant (`spatialreal-avatar`) is ALSO agent-kind, but it carries
 * `lk.publish_on_behalf` (it publishes audio/animation on behalf of the real agent) and never owns the state. The
 * selection below is the same rule as LiveKit's own `useAgent` hook: agent kind AND no `publish_on_behalf`
 * attribute - never a display-name or identity string. */

export const AGENT_STATE_ATTRIBUTE = "lk.agent.state";
export const PUBLISH_ON_BEHALF_ATTRIBUTE = "lk.publish_on_behalf";

export type AgentState = "initializing" | "idle" | "listening" | "thinking" | "speaking";

const KNOWN_STATES: ReadonlySet<string> = new Set<AgentState>(["initializing", "idle", "listening", "thinking", "speaking"]);

/** A value LiveKit doesn't document (or no value) is "no signal", never a guess. */
export function parseAgentState(raw: unknown): AgentState | null {
  return typeof raw === "string" && KNOWN_STATES.has(raw) ? (raw as AgentState) : null;
}

export interface ParticipantLike {
  kind?: unknown;
  identity?: string;
  attributes?: Record<string, string> | undefined;
}

/** The real tutor agent: agent kind, and NOT a rendering worker publishing on someone else's behalf. */
export function isTutorAgent(participant: ParticipantLike): boolean {
  return participant.kind === ParticipantKind.AGENT && !(PUBLISH_ON_BEHALF_ATTRIBUTE in (participant.attributes ?? {}));
}

export function selectAgentParticipant<T extends ParticipantLike>(participants: Iterable<T>): T | undefined {
  for (const participant of participants) if (isTutorAgent(participant)) return participant;
  return undefined;
}

/** The state the tutor agent currently publishes, or null (no agent yet / attribute not set / unknown value). */
export function readAgentState(participants: Iterable<ParticipantLike>): AgentState | null {
  return parseAgentState(selectAgentParticipant(participants)?.attributes?.[AGENT_STATE_ATTRIBUTE]);
}
