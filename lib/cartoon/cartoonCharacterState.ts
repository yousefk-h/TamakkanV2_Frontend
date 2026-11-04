import type { VoiceAgentState } from "@/lib/voice/voiceRoom";
import type { VoiceUiPhase } from "@/lib/voice/voiceUiState";

/** Presentation-only mapping for Cartoon Practice: which character pose to show. It reads only the
 * real state Voice Practice's session already exposes (the same `phase`/`agentPresent`/`agentState`
 * that already drive `VoiceCallView`'s Listening/Thinking/Speaking status text) - no invented timers,
 * no new session state. Pure, so it is unit-tested without a browser. */

export interface CartoonCharacterInput {
  phase: VoiceUiPhase;
  agentPresent: boolean;
  agentState: VoiceAgentState | null | undefined;
}

export interface CartoonCharacterView {
  /** `null` whenever there is no live call to reflect (matches the character's own "no signal" idle pose). */
  agentState: VoiceAgentState | null;
  /** Scripted idle eye glances only while there is nothing real to show instead. */
  idleGlances: boolean;
}

export function deriveCartoonCharacterView({ phase, agentPresent, agentState }: CartoonCharacterInput): CartoonCharacterView {
  const live = phase === "live" || phase === "ending";
  const resolvedState = live && agentPresent ? (agentState ?? null) : null;
  const idleGlances = resolvedState === null || resolvedState === "idle" || resolvedState === "listening";
  return { agentState: resolvedState, idleGlances };
}
