import { AvatarSessionError } from "./avatarRuntime";

/** Feature B (Stage 4): automatic weak-network fallback offer (Avatar -> Cartoon).
 *
 * This module is a small, PURE orchestration layer that sits OUTSIDE `avatarRuntime.ts`'s own reconnect/recovery
 * logic (`rejoin()`, its backoff `[1000, 2000, 4000]`ms, the stall guard) - it does not touch, wrap, or re-implement
 * any of that. It only watches the SAME `onError` callback `MariamSession.tsx` already receives and counts
 * MEANINGFUL, independent failure CYCLES, not the up-to-3 retries inside a single `rejoin()` call.
 *
 * What counts as ONE "qualifying failure":
 * Reading `avatarRuntime.ts`'s `connectAvatar()` closely, `callbacks.onError` is reached in exactly two shapes:
 *   1. `session.on("error", ...)`: if the SDK's error code is `"connection-failed"`, it calls `rejoin(delays)`
 *      instead of `onError` directly - nothing reaches `onError` yet. `rejoin()` only calls
 *      `onError(new AvatarSessionError("connection-failed", ...))` once it has exhausted ALL of `delays`
 *      (every one of the up-to-3 backoff attempts failed) - see `rejoin()`'s own `if (!disposed) { ... onError(...) }`
 *      branch after its `for (const wait of waits)` loop.
 *   2. `session.on("stalled", ...)`: calls `rejoin([0])` (ONE attempt, no wait - "SDK guidance"). If that one attempt
 *      also fails, the exact same exhausted-backoff branch in `rejoin()` runs and calls `onError` with the same
 *      `AvatarSessionError("connection-failed", ...)`.
 *   3. Any OTHER fatal SDK error (`credential-invalid`, `session-ended`, `resource-load-failed`, `mic-denied`, ...)
 *      calls `onError` directly, with its OWN code - never `"connection-failed"`.
 *
 * So `AvatarSessionError.code === "connection-failed"` reaching `onError` is unambiguous: it is ALWAYS and ONLY the
 * "a full rejoin sequence (or the stall guard's one rejoin) gave up" case - never a single retry-within-a-cycle
 * (those stay inside `rejoin()` and never reach this callback), and never an unrelated fatal error (credentials,
 * session-ended, mic, ...) that switching visual mode cannot fix anyway. That is exactly the "one qualifying failure
 * CYCLE" this module counts.
 */
export const QUALIFYING_FAILURE_CODE = "connection-failed";
export const FAILURES_BEFORE_OFFER = 3;

export function isQualifyingAvatarFailure(error: unknown): boolean {
  return error instanceof AvatarSessionError && error.code === QUALIFYING_FAILURE_CODE;
}

export interface WeakNetworkFallbackTracker {
  /** Feed every error from `onAvatarError`. Returns true exactly once per "arm": the call that reaches the 3rd
   * qualifying failure since the tracker was created or last re-armed. Non-qualifying errors (anything other than
   * `AvatarSessionError` with code `"connection-failed"`) are ignored entirely - they neither count nor reset. */
  recordError(error: unknown): boolean;
  /** Call when the avatar reports a fresh successful connection (`status === "connected"`) - a brand-new session
   * start, or a `rejoin()` that actually succeeded. Resets the qualifying-failure count AND re-arms the one-time
   * offer: a later, separate run of instability earns its own 3-strikes count and its own one-time offer. This is
   * the "sane re-arm condition" - declining the offer itself never calls this, so staying in Avatar after declining
   * does not instantly re-open the same offer the moment `rejoin()` next succeeds once and then fails again; it only
   * re-arms once the call is genuinely healthy again. */
  recordSuccess(): void;
  readonly qualifyingFailures: number;
  readonly offered: boolean;
}

export function createWeakNetworkFallbackTracker(): WeakNetworkFallbackTracker {
  let qualifyingFailures = 0;
  let offered = false;

  return {
    recordError(error: unknown): boolean {
      if (!isQualifyingAvatarFailure(error)) return false;
      qualifyingFailures += 1;
      if (qualifyingFailures >= FAILURES_BEFORE_OFFER && !offered) {
        offered = true;
        return true;
      }
      return false;
    },
    recordSuccess(): void {
      qualifyingFailures = 0;
      offered = false;
    },
    get qualifyingFailures() {
      return qualifyingFailures;
    },
    get offered() {
      return offered;
    },
  };
}
