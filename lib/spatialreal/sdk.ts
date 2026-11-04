import type { SrSdk } from "./avatarRuntime";

/** The ONE place the SpatialReal Web SDK (`@spatialreal/web-sdk`, the new platform) is imported. Loaded lazily and only
 * in the browser: the SDK brings a WebAssembly renderer that nothing on the server needs, and this keeps it out of every
 * page that never starts an Avatar session. No module-level state: the module system itself caches the import, and the
 * component that wants the SDK's audio helper keeps its own reference (see `MariamSession.tsx`). */

/** The one SDK helper needed synchronously, inside the student's click. */
export interface AudioUnlockSdk {
  createUnlockedAudioContext?: (sampleRate?: number) => AudioContext;
}

export function loadSpatialRealSdk(): Promise<SrSdk & AudioUnlockSdk> {
  // The SDK's classes are typed far more richly than the slice our lifecycle runtime uses; the runtime depends only on
  // that slice (see `avatarRuntime.ts`), which is what makes it testable with a fake SDK.
  return import("@spatialreal/web-sdk") as unknown as Promise<SrSdk & AudioUnlockSdk>;
}

/** MUST be called synchronously at the top of the student's click handler, before any `await` (the session is created
 * after network calls, by which time the browser no longer counts the gesture). The SDK documents
 * `createUnlockedAudioContext()` for exactly this; if the SDK has not finished loading yet (`sdk` is null), an
 * equivalent context is created and resumed here. Returns undefined when the browser has no Web Audio (the SDK then
 * makes its own). */
export function createAvatarAudioContext(sdk?: AudioUnlockSdk | null): AudioContext | undefined {
  try {
    if (sdk?.createUnlockedAudioContext) return sdk.createUnlockedAudioContext();
  } catch {
    // fall through to the plain context below
  }
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return undefined;
    const context = new Context();
    void context.resume().catch(() => undefined);
    return context;
  } catch {
    return undefined;
  }
}
