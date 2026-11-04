/** Half-duplex microphone gate for Avatar Practice.
 *
 * Two inputs decide whether Mariam "has the floor" (the mic is paused):
 *  - PRIMARY: the real LiveKit `lk.agent.state` (`setAgentState`). The student's mic is open only while the agent
 *    is `listening`; speaking / thinking / initializing / idle all keep it paused.
 *  - FALLBACK: LiveKit's speaker detection (`setMariamSpeaking`), used ONLY while no agent state is available
 *    (`setAgentState(null)`: attribute missing, no agent yet, or the state looks stuck). Kept until the real state
 *    has been verified in a live test.
 * Mariam takes the floor -> the mic pauses immediately. She gives it up -> wait `unmuteDelayMs` (250 ms, covers the
 * audio still playing out in the browser), then the mic resumes. Pure logic with injected side effects (no LiveKit,
 * no React, no globals), so it is unit-testable and every hook instance owns its own gate - nothing is shared
 * between students or sessions.
 *
 * Effective mic state = `manualMuted || mariam has the floor || unmute pending`. The student's own mute choice is
 * tracked SEPARATELY from the automatic pause, and the gate never turns the mic on while the student has muted it. */

export const DEFAULT_UNMUTE_DELAY_MS = 250;

export type MicGateAgentState = "initializing" | "idle" | "listening" | "thinking" | "speaking";

export interface MicGateOptions {
  /** Mute (false) or unmute (true) the EXISTING microphone track. Must not request permission or recreate anything. */
  applyMic: (enabled: boolean) => void;
  /** Called when `mariamPaused` (Mariam speaking, or the post-speech delay still pending) changes. */
  onPausedChange?: (mariamPaused: boolean) => void;
  unmuteDelayMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

export interface MicGate {
  /** The student's own mute preference (true = the student muted their mic). */
  setManualMuted(muted: boolean): void;
  /** FALLBACK signal: Mariam started (true) or stopped (false) speaking (room speaker detection). Ignored while an
   * agent state is set. */
  setMariamSpeaking(speaking: boolean): void;
  /** PRIMARY signal: the agent's published state, or null when unavailable (falls back to `setMariamSpeaking`). */
  setAgentState(state: MicGateAgentState | null): void;
  /** Re-apply the current effective state, e.g. right after a fresh mic track was published. */
  reapply(): void;
  /** True while Mariam is speaking or the post-speech delay is pending. */
  readonly mariamPaused: boolean;
  readonly micEnabled: boolean;
  /** Clears the pending timer; no further callbacks fire afterwards (disconnect / unmount / switching practice mode). */
  dispose(): void;
}

export function createMicGate(options: MicGateOptions): MicGate {
  const { applyMic, onPausedChange, unmuteDelayMs = DEFAULT_UNMUTE_DELAY_MS } = options;
  const setTimer = options.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimeoutFn ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let manualMuted = false;
  let speakersSpeaking = false; // fallback signal
  let agentState: MicGateAgentState | null = null; // primary signal
  let mariamSpeaking = false; // "Mariam has the floor" - derived from the two signals above by `update()`
  let pendingTimer: unknown = null;
  let disposed = false;
  let lastApplied: boolean | null = null;
  let lastPaused = false;

  const paused = () => mariamSpeaking || pendingTimer !== null;
  const enabled = () => !manualMuted && !paused();

  function sync(force = false) {
    if (disposed) return;
    const nowEnabled = enabled();
    if (force || nowEnabled !== lastApplied) {
      lastApplied = nowEnabled;
      applyMic(nowEnabled);
    }
    const nowPaused = paused();
    if (nowPaused !== lastPaused) {
      lastPaused = nowPaused;
      onPausedChange?.(nowPaused);
    }
  }

  function cancelPending() {
    if (pendingTimer !== null) {
      clearTimer(pendingTimer);
      pendingTimer = null;
    }
  }

  /** Recompute whether Mariam has the floor from the current signals and apply the pause / delayed resume. */
  function update() {
    const next = agentState !== null ? agentState !== "listening" : speakersSpeaking;
    if (next) {
      // She took the floor (or keeps it): any pending unmute is cancelled and the mic pauses immediately.
      cancelPending();
      mariamSpeaking = true;
      sync();
      return;
    }
    if (!mariamSpeaking) {
      sync(); // already free: a repeated "not busy" must not restart the delay
      return;
    }
    mariamSpeaking = false;
    cancelPending();
    // Keep the mic paused for the delay (pendingTimer !== null counts as paused), then resume.
    pendingTimer = setTimer(() => {
      pendingTimer = null;
      sync();
    }, unmuteDelayMs);
    sync();
  }

  return {
    setManualMuted(muted) {
      if (disposed) return;
      manualMuted = muted;
      sync();
    },
    setMariamSpeaking(speaking) {
      if (disposed) return;
      speakersSpeaking = speaking;
      update();
    },
    setAgentState(state) {
      if (disposed) return;
      agentState = state;
      update();
    },
    reapply() {
      sync(true);
    },
    get mariamPaused() {
      return paused();
    },
    get micEnabled() {
      return enabled();
    },
    dispose() {
      if (disposed) return;
      cancelPending();
      disposed = true;
    },
  };
}
