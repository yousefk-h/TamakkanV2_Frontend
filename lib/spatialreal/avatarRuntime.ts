import type { Room } from "livekit-client";

import type { SpatialRealAvatarConnectionStatus } from "./types";

/** The lifecycle of Mariam's avatar on the NEW SpatialReal Web SDK (`@spatialreal/web-sdk`), as plain TypeScript with
 * no React and no module-level state, so it is driven by a fake SDK in the tests.
 *
 *   createSession()  loads the avatar (credential check, renderer, assets) and shows it standing still. Not billed.
 *   start()          joins the LiveKit room (the agent's SpatialReal plugin owns the billed SpatialReal session)
 *   end() / dispose() leave the room / release everything (final)
 *
 * What the SDK does NOT do, and this runtime therefore does: nothing reconnects on its own ("call start() again, with
 * backoff"), the microphone is ours to open (`mic: "manual"`), and a session that ends on its own goes back to `idle`.
 * Docs: https://docs.spatialreal.ai/avatar-integration/livekit/web-client and /session-lifecycle, /errors-and-recovery.
 *
 * The SDK plays the avatar's voice itself - the room's audio tracks must NOT be attached anywhere else (that would
 * play Mariam twice). */

export type SrSessionState = "idle" | "connecting" | "live" | "ending" | "disposed";
export type SrMicState = "on" | "muted" | "denied" | "off";

/** The slice of the SDK's `SpatialRealError` this runtime reads (branch on `code`, never on the message). */
export interface SrError {
  code: string;
  message: string;
  /** Present on `session-ended`: e.g. credits_exhausted, session_timeout, concurrency_limit. */
  reason?: string;
}

export interface SrLiveKitSession {
  readonly state: SrSessionState;
  /** The livekit-client Room while live. */
  readonly room: Room | null;
  readonly mic: {
    readonly state: SrMicState;
    /** Mute preference; may be set before and after the microphone is opened. */
    muted: boolean;
    enable(): Promise<void>;
    disable(): void;
  };
  start(): Promise<void>;
  end(): Promise<void>;
  dispose(): Promise<void>;
  reconnect(): Promise<void>;
  on(event: "state", listener: (payload: { current: SrSessionState; previous: SrSessionState }) => void): () => void;
  on(event: "error", listener: (payload: { error: SrError }) => void): () => void;
  on(event: "stalled", listener: (payload: { silentMs: number }) => void): () => void;
  on(event: "micState", listener: (payload: { current: SrMicState; previous: SrMicState }) => void): () => void;
}

export interface SrCreateSessionOptions {
  avatarId: string;
  credential: string;
  container: HTMLElement;
  livekit: { url: string; token: string };
  mic: "required" | "optional" | "manual";
  audioContext?: AudioContext;
  signal?: AbortSignal;
}

export interface SrSdk {
  SpatialReal: new (options: { appId: string; logLevel?: "off" | "error" | "warning" | "all" }) => {
    createSession(options: SrCreateSessionOptions): Promise<SrLiveKitSession>;
  };
}

/** An error from the avatar, with the SDK's stable `code` (and the server's `reason` for an ended session). */
export class AvatarSessionError extends Error {
  readonly code: string;
  readonly reason?: string;
  constructor(code: string, message: string, reason?: string) {
    super(message);
    this.name = "AvatarSessionError";
    this.code = code;
    this.reason = reason;
  }
}

/** What the student may read. Technical detail stays in `code` / `reason`. */
export function describeAvatarError(error: SrError): string {
  switch (error.code) {
    case "session-ended":
      return error.reason === "credits_exhausted"
        ? "Mariam is unavailable right now. Please try again later."
        : error.reason === "concurrency_limit"
          ? "Mariam is busy right now. Please try again in a moment."
          : "The conversation ended. You can start again.";
    case "credential-invalid":
    case "credential-expired":
      return "Your session expired. Please start again.";
    case "connection-failed":
    case "protocol-mismatch":
      return "The connection to Mariam was lost. Please start again.";
    case "resource-load-failed":
    case "wasm-load-failed":
      return "Mariam's avatar could not be loaded. Check your connection and try again.";
    case "mic-denied":
      return "Microphone access was blocked. Allow it in your browser's site settings to talk to Mariam.";
    case "mic-unavailable":
      return "No working microphone was found.";
    default:
      return error.message || "Something went wrong with the avatar.";
  }
}

export function toAvatarError(raw: unknown): AvatarSessionError {
  const e = raw as Partial<SrError> | null | undefined;
  const code = typeof e?.code === "string" ? e.code : "unknown";
  const reason = typeof e?.reason === "string" ? e.reason : undefined;
  return new AvatarSessionError(code, describeAvatarError({ code, message: typeof e?.message === "string" ? e.message : "", reason }), reason);
}

export interface AvatarCallbacks {
  onStatus(status: SpatialRealAvatarConnectionStatus): void;
  /** The LiveKit room the session is live in (a new object after a reconnect), or null once it is gone. */
  onRoom(room: Room | null): void;
  onMicState(state: SrMicState): void;
  /** The microphone cannot be opened; the call itself continues. */
  onMicError(error: Error | null): void;
  /** Fatal: the session is unusable and has been released. */
  onError(error: Error): void;
  /** The live session ended on its own (the room closed / Mariam left). Not called for a deliberate `dispose()`. */
  onEnded(): void;
}

export interface AvatarConnectionOptions {
  sdk: SrSdk;
  appId: string;
  avatarId: string;
  /** SpatialReal session token from the server (never the API key). */
  credential: string;
  livekitUrl: string;
  roomToken: string;
  container: HTMLElement;
  audioContext?: AudioContext;
  signal?: AbortSignal;
  callbacks: AvatarCallbacks;
  /** Waits before each automatic rejoin after a lost connection. Default 1 s, 2 s, 4 s, then give up. */
  reconnectDelaysMs?: readonly number[];
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

export interface AvatarConnection {
  readonly session: SrLiveKitSession;
  /** The student's own mute choice: true opens the microphone, false closes it. Re-applied after a rejoin. */
  setMicWanted(wanted: boolean): Promise<void>;
  /** The half-duplex gate: true mutes the open microphone (Mariam has the floor), false lets the student speak. */
  setMicPaused(paused: boolean): void;
  dispose(): Promise<void>;
}

export const DEFAULT_RECONNECT_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

const isAbort = (error: unknown) => (error as { name?: string } | null)?.name === "AbortError";

/** Opens the avatar, joins the room and returns the live connection - or null (after releasing everything and reporting
 * through `callbacks.onError`) when the session could not start, or when `signal` aborted first. */
export async function connectAvatar(options: AvatarConnectionOptions): Promise<AvatarConnection | null> {
  const { sdk, signal } = options;
  const delays = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
  const setTimer = options.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimeoutFn ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  // Report each status / room once, however many SDK events say the same thing.
  let lastStatus: SpatialRealAvatarConnectionStatus | null = null;
  let lastRoom: Room | null | undefined;
  const callbacks: AvatarCallbacks = {
    ...options.callbacks,
    onStatus(status) {
      if (status === lastStatus) return;
      lastStatus = status;
      options.callbacks.onStatus(status);
    },
    onRoom(room) {
      if (room === lastRoom) return;
      lastRoom = room;
      options.callbacks.onRoom(room);
    },
  };

  callbacks.onStatus("initializing");
  const client = new sdk.SpatialReal({ appId: options.appId, logLevel: "error" });
  let session: SrLiveKitSession;
  try {
    session = await client.createSession({
      avatarId: options.avatarId,
      credential: options.credential,
      container: options.container,
      livekit: { url: options.livekitUrl, token: options.roomToken },
      mic: "manual", // we open the microphone ourselves, so the student's own mute choice and the turn gate stay in charge
      audioContext: options.audioContext,
      signal,
    });
  } catch (error) {
    if (!isAbort(error) && !signal?.aborted) callbacks.onError(toAvatarError(error));
    return null;
  }
  if (signal?.aborted) {
    await session.dispose().catch(() => undefined);
    return null;
  }

  let disposed = false;
  // `rejoining` is set BEFORE the SDK is asked to reconnect: it may emit its idle -> live blip synchronously, and that blip is
  // not "the call ended". `reconnecting` is the in-flight promise, so only one rejoin runs at a time.
  let rejoining = false;
  let reconnecting: Promise<boolean> | null = null;
  let micWanted = false;
  let micPaused = true; // closed until the turn gate says it is the student's turn
  let pendingTimer: unknown = null;
  let wake: (() => void) | null = null;

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      // the session may be mid-teardown; a failed mic/mute call must never take the call down
    }
  };

  const applyMuted = () => safe(() => void (session.mic.muted = micPaused));

  async function applyMic(): Promise<void> {
    if (disposed || session.state !== "live") return;
    if (micWanted) {
      applyMuted(); // set the preference first, so the microphone opens already muted while Mariam has the floor
      if (session.mic.state === "off" || session.mic.state === "denied") {
        try {
          await session.mic.enable();
          callbacks.onMicError(null);
        } catch (error) {
          callbacks.onMicError(toAvatarError(error));
        }
      }
      applyMuted();
    } else if (session.mic.state !== "off") {
      safe(() => session.mic.disable());
    }
    if (!disposed) safe(() => callbacks.onMicState(session.mic.state));
  }

  const sleep = (ms: number) =>
    new Promise<void>(resolve => {
      wake = resolve;
      pendingTimer = setTimer(() => {
        pendingTimer = null;
        wake = null;
        resolve();
      }, ms);
    });

  /** Leave and rejoin the room, retrying with backoff. At most one rejoin runs at a time. */
  function rejoin(waits: readonly number[]): Promise<boolean> {
    if (reconnecting) return reconnecting;
    rejoining = true;
    reconnecting = (async () => {
      try {
        for (const wait of waits) {
          if (wait > 0) await sleep(wait);
          if (disposed) return false;
          try {
            await session.reconnect();
            if (disposed) return false;
            callbacks.onRoom(session.room); // a rejoin creates a new Room object: re-point everything that watches it
            callbacks.onStatus("connected");
            await applyMic();
            return true;
          } catch {
            // try again after the next wait
          }
        }
        if (!disposed) {
          callbacks.onRoom(null);
          callbacks.onError(new AvatarSessionError("connection-failed", describeAvatarError({ code: "connection-failed", message: "" })));
          await release();
        }
        return false;
      } finally {
        reconnecting = null;
        rejoining = false;
      }
    })();
    return reconnecting;
  }

  const offs: Array<() => void> = [];
  async function release(): Promise<void> {
    disposed = true;
    if (pendingTimer !== null) {
      clearTimer(pendingTimer);
      pendingTimer = null;
    }
    wake?.();
    wake = null;
    for (const off of offs.splice(0)) safe(off);
    await session.end().catch(() => undefined);
    await session.dispose().catch(() => undefined);
  }

  offs.push(
    session.on("state", ({ current, previous }) => {
      if (disposed) return;
      if (current === "connecting") callbacks.onStatus("connecting");
      else if (current === "live") {
        callbacks.onRoom(session.room);
        callbacks.onStatus("connected");
      } else if (current === "ending") callbacks.onStatus("disconnecting");
      else if (current === "idle" && (previous === "live" || previous === "ending") && !rejoining) {
        // The session ended on its own (the room closed, Mariam left): the SDK is back at idle and will not rejoin.
        callbacks.onRoom(null);
        callbacks.onEnded();
      }
    }),
    session.on("error", ({ error }) => {
      if (disposed) return;
      if (error.code === "connection-failed") void rejoin(delays); // nothing reconnects on its own
      else {
        callbacks.onError(toAvatarError(error));
        void release();
      }
    }),
    session.on("stalled", () => {
      if (!disposed) void rejoin([0]); // no motion for 3 s mid-reply: leave and rejoin once (SDK guidance)
    }),
    session.on("micState", ({ current }) => {
      if (!disposed) callbacks.onMicState(current);
    }),
  );

  callbacks.onStatus("connecting");
  try {
    await session.start();
  } catch (error) {
    if (!disposed && !signal?.aborted) callbacks.onError(toAvatarError(error));
    await release();
    return null;
  }
  if (signal?.aborted || disposed) {
    await release();
    return null;
  }
  callbacks.onRoom(session.room);
  callbacks.onStatus("connected");
  safe(() => callbacks.onMicState(session.mic.state));

  return {
    session,
    async setMicWanted(wanted) {
      micWanted = wanted;
      await applyMic();
    },
    setMicPaused(paused) {
      micPaused = paused;
      if (!disposed && session.state === "live") applyMuted();
    },
    async dispose() {
      if (disposed) return;
      await release();
    },
  };
}
