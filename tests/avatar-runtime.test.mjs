// Mariam's avatar on the NEW SpatialReal Web SDK: the lifecycle runtime (lib/spatialreal/avatarRuntime.ts) driven by a
// FAKE SDK - no browser, no network, no SpatialReal account. Also the migration guards: no legacy AvatarKit runtime, no
// API key in browser code, and the click -> token -> session flow in MariamSession.
//
// Run with: npm run test:mic
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const { connectAvatar, describeAvatarError, toAvatarError, AvatarSessionError, DEFAULT_RECONNECT_DELAYS_MS } = await import(new URL("../lib/spatialreal/avatarRuntime.ts", import.meta.url).href);
const { createMicGate } = await import(new URL("../lib/spatialreal/micGate.ts", import.meta.url).href);
const { createAvatarAudioContext } = await import(new URL("../lib/spatialreal/sdk.ts", import.meta.url).href);
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

// ---------- fakes ----------

function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    setTimeoutFn(fn, ms) {
      const handle = ++id;
      timers.set(handle, { at: now + ms, fn });
      return handle;
    },
    clearTimeoutFn(handle) {
      timers.delete(handle);
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
        await settle();
      }
      now = end;
    },
    get pending() {
      return timers.size;
    },
  };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

class FakeSession {
  constructor(options = {}) {
    this.state = "idle";
    this.room = { id: "room-1" };
    this.listeners = new Map();
    this.calls = [];
    this.mic = { state: "off", muted: false, enableCalls: 0, disableCalls: 0, enableError: null };
    const mic = this.mic;
    mic.enable = async () => {
      mic.enableCalls++;
      if (mic.enableError) throw mic.enableError;
      mic.state = mic.muted ? "muted" : "on";
    };
    mic.disable = () => {
      mic.disableCalls++;
      mic.state = "off";
    };
    this.startError = options.startError ?? null;
    this.reconnectFailures = options.reconnectFailures ?? 0;
    this.startDelay = options.startDelay ?? null; // a promise the test resolves
  }
  on(event, listener) {
    (this.listeners.get(event) ?? this.listeners.set(event, new Set()).get(event)).add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }
  emit(event, payload) {
    [...(this.listeners.get(event) ?? [])].forEach(fn => fn(payload));
  }
  setState(current) {
    const previous = this.state;
    this.state = current;
    this.emit("state", { current, previous });
  }
  async start() {
    this.calls.push("start");
    if (this.startDelay) await this.startDelay;
    if (this.startError) throw this.startError;
    this.setState("connecting");
    this.setState("live");
  }
  async end() {
    this.calls.push("end");
    if (this.state !== "disposed") this.setState("idle");
  }
  async dispose() {
    this.calls.push("dispose");
    this.state = "disposed";
  }
  async reconnect() {
    this.calls.push("reconnect");
    if (this.reconnectFailures > 0) {
      this.reconnectFailures--;
      throw new AvatarSessionError("connection-failed", "x");
    }
    this.setState("idle");
    this.room = { id: `room-${this.calls.filter(c => c === "reconnect").length + 1}` };
    this.setState("live");
  }
}

function fakeSdk(sessionOptions = {}, createError = null) {
  const created = [];
  const sessions = [];
  class SpatialReal {
    constructor(options) {
      this.options = options;
      created.push({ clientOptions: options });
    }
    async createSession(options) {
      created.at(-1).sessionOptions = options;
      if (createError) throw createError;
      const session = new FakeSession(sessionOptions);
      sessions.push(session);
      return session;
    }
  }
  return { sdk: { SpatialReal }, created, sessions };
}

function recorder() {
  const log = { status: [], rooms: [], mic: [], micErrors: [], errors: [], ended: 0 };
  return {
    log,
    callbacks: {
      onStatus: s => log.status.push(s),
      onRoom: r => log.rooms.push(r),
      onMicState: s => log.mic.push(s),
      onMicError: e => log.micErrors.push(e),
      onError: e => log.errors.push(e),
      onEnded: () => log.ended++,
    },
  };
}

const container = { nodeName: "DIV" };
async function open(overrides = {}, sdkOptions = {}) {
  const f = fakeSdk(sdkOptions.session, sdkOptions.createError);
  const r = recorder();
  const clock = fakeClock();
  const conn = await connectAvatar({
    sdk: f.sdk,
    appId: "app_test",
    avatarId: "avatar-1",
    credential: "SESSION-TOKEN",
    livekitUrl: "wss://lk.example",
    roomToken: "ROOM-TOKEN",
    container,
    callbacks: r.callbacks,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    ...overrides,
  });
  return { ...f, ...r, clock, conn, session: f.sessions[0] };
}

// ---------- creating and starting the session ----------

test("createSession gets exactly the new-SDK arguments, then start(); status goes initializing -> connecting -> connected", async () => {
  const audioContext = { kind: "ctx" };
  const signal = new AbortController().signal;
  const { created, session, log, conn } = await open({ audioContext, signal });
  assert.ok(conn);
  assert.deepEqual(created[0].clientOptions, { appId: "app_test", logLevel: "error" });
  assert.deepEqual(created[0].sessionOptions, {
    avatarId: "avatar-1",
    credential: "SESSION-TOKEN",
    container,
    livekit: { url: "wss://lk.example", token: "ROOM-TOKEN" },
    mic: "manual",
    audioContext,
    signal,
  });
  assert.deepEqual(session.calls, ["start"]);
  assert.deepEqual(log.status, ["initializing", "connecting", "connected"], "each status is reported once, even though the SDK's own events repeat it");
  assert.deepEqual(log.rooms, [session.room], "the live room is handed on once, for agent-state / speaker signals");
});

test("no API key (or any secret field) can reach the browser SDK call", async () => {
  const { created } = await open();
  const keys = Object.keys(created[0].sessionOptions).concat(Object.keys(created[0].clientOptions));
  assert.ok(!keys.some(k => /key|secret/i.test(k)), keys.join());
  assert.equal(created[0].sessionOptions.credential, "SESSION-TOKEN", "only the short-lived session token is passed");
});

test("the microphone stays closed until the student's choice is applied (mic: manual)", async () => {
  const { session } = await open();
  assert.equal(session.mic.enableCalls, 0);
  assert.equal(session.mic.state, "off");
});

// ---------- microphone: student's choice + the turn gate ----------

test("enabling the mic opens it MUTED while Mariam has the floor, and the gate then unmutes it on the student's turn", async () => {
  const { conn, session, log } = await open();
  await conn.setMicWanted(true);
  assert.equal(session.mic.enableCalls, 1);
  assert.equal(session.mic.state, "muted", "the preference was set before opening, so it opens muted (the gate starts paused)");
  conn.setMicPaused(false); // agent is listening
  assert.equal(session.mic.muted, false);
  conn.setMicPaused(true); // Mariam speaks again
  assert.equal(session.mic.muted, true);
  assert.ok(log.mic.includes("muted"));
});

test("manual mute wins: with the mic closed by the student, a 'student's turn' signal never opens it", async () => {
  const { conn, session } = await open();
  await conn.setMicWanted(true);
  await conn.setMicWanted(false); // the student pressed mute
  assert.equal(session.mic.disableCalls, 1);
  assert.equal(session.mic.state, "off");
  conn.setMicPaused(false); // Mariam is listening
  conn.setMicPaused(true);
  conn.setMicPaused(false);
  assert.equal(session.mic.enableCalls, 1, "only the student's own unmute can open it again");
  assert.equal(session.mic.state, "off");
  await conn.setMicWanted(true); // the student unmutes
  assert.equal(session.mic.enableCalls, 2);
});

test("the real mic gate drives the runtime: agent states pause/resume, manual mute survives every state change", async () => {
  const { conn, session, clock } = await open();
  const gate = createMicGate({ applyMic: enabled => conn.setMicPaused(!enabled), setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });
  await conn.setMicWanted(true);
  gate.setAgentState("speaking");
  assert.equal(session.mic.muted, true);
  gate.setAgentState("thinking");
  assert.equal(session.mic.muted, true, "thinking is not the student's turn");
  gate.setAgentState("listening");
  assert.equal(session.mic.muted, true, "inside the resume hold");
  await clock.advance(250);
  assert.equal(session.mic.muted, false);
  // the student mutes themselves: closed in the gate AND in the runtime, whatever the agent does next
  gate.setManualMuted(true);
  await conn.setMicWanted(false);
  for (const state of ["speaking", "listening", "thinking", "listening"]) {
    gate.setAgentState(state);
    await clock.advance(1000);
  }
  assert.equal(session.mic.state, "off", "the mic never reopened on its own");
  assert.equal(session.mic.enableCalls, 1);
});

test("a refused microphone is reported without ending the call; a later success clears it", async () => {
  const { conn, session, log } = await open();
  session.mic.enableError = Object.assign(new Error("denied"), { code: "mic-denied" });
  await conn.setMicWanted(true);
  assert.equal(log.errors.length, 0, "the avatar call itself continues");
  assert.equal(log.micErrors.at(-1).code, "mic-denied");
  assert.match(log.micErrors.at(-1).message, /Allow it in your browser/);
  session.mic.enableError = null;
  await conn.setMicWanted(true);
  assert.equal(log.micErrors.at(-1), null);
  assert.equal(session.mic.state, "muted");
});

// ---------- failure handling ----------

test("createSession failing (avatar assets / network) is reported once and nothing is started", async () => {
  const error = Object.assign(new Error("assets"), { code: "resource-load-failed" });
  const { conn, log, created } = await open({}, { createError: error });
  assert.equal(conn, null);
  assert.equal(log.errors.length, 1);
  assert.equal(log.errors[0].code, "resource-load-failed");
  assert.match(log.errors[0].message, /could not be loaded/);
  assert.deepEqual(log.status, ["initializing"]);
  assert.equal(created.length, 1);
});

test("start() failing releases the session and reports the stable code", async () => {
  const error = Object.assign(new Error("expired"), { code: "credential-expired" });
  const { conn, session, log } = await open({}, { session: { startError: error } });
  assert.equal(conn, null);
  assert.deepEqual(session.calls, ["start", "end", "dispose"], "released, never left half-open");
  assert.equal(log.errors[0].code, "credential-expired");
  assert.equal(log.ended, 0);
});

test("a server-ended session (credits exhausted) is fatal, friendly, and carries the reason", async () => {
  const { session, log } = await open();
  session.emit("error", { error: { code: "session-ended", reason: "credits_exhausted", message: "x" } });
  await settle();
  assert.equal(log.errors.length, 1);
  assert.equal(log.errors[0].reason, "credits_exhausted");
  assert.equal(log.errors[0].message, "Mariam is unavailable right now. Please try again later.");
  assert.ok(session.calls.includes("dispose"));
});

test("error messages are friendly and branch on the code, never the SDK's wording", () => {
  assert.equal(describeAvatarError({ code: "session-ended", reason: "concurrency_limit", message: "SECRET DETAIL" }), "Mariam is busy right now. Please try again in a moment.");
  assert.equal(describeAvatarError({ code: "credential-invalid", message: "bad jwt" }), "Your session expired. Please start again.");
  assert.equal(describeAvatarError({ code: "unknown-code", message: "plain message" }), "plain message");
  assert.equal(toAvatarError({ code: "mic-unavailable" }).message, "No working microphone was found.");
  assert.equal(toAvatarError(undefined).code, "unknown");
});

// ---------- session end ----------

test("a session that ends on its own (room closed / Mariam left) is reported once; a deliberate dispose is not", async () => {
  const a = await open();
  a.session.setState("idle"); // the SDK went live -> idle by itself
  assert.equal(a.log.ended, 1);
  assert.equal(a.log.rooms.at(-1), null);
  const b = await open();
  await b.conn.dispose();
  assert.equal(b.log.ended, 0, "the student pressed End: not an unexpected end");
  assert.deepEqual(b.session.calls, ["start", "end", "dispose"]);
  await b.conn.dispose(); // idempotent
  assert.deepEqual(b.session.calls, ["start", "end", "dispose"]);
});

test("after dispose, late events from the old session cannot reach the caller", async () => {
  const { conn, session, log } = await open();
  await conn.dispose();
  const before = JSON.stringify(log);
  session.emit("error", { error: { code: "connection-failed", message: "late" } });
  session.emit("stalled", { silentMs: 3000 });
  session.emit("micState", { current: "on", previous: "off" });
  session.emit("state", { current: "live", previous: "idle" });
  await settle();
  assert.equal(JSON.stringify(log), before);
  assert.equal(session.calls.filter(c => c === "reconnect").length, 0);
});

test("two avatar sessions are fully independent (no shared state between students or sessions)", async () => {
  const one = await open();
  const two = await open();
  await one.conn.setMicWanted(true);
  assert.equal(two.session.mic.enableCalls, 0);
  one.session.emit("error", { error: { code: "session-ended", reason: "session_timeout", message: "x" } });
  await settle();
  assert.equal(one.log.errors.length, 1);
  assert.equal(two.log.errors.length, 0);
  assert.notEqual(one.session, two.session);
});

// ---------- reconnect ----------

test("'stalled' rejoins the room once; the NEW room is handed on and the mic choice is re-applied", async () => {
  const { conn, session, log } = await open();
  await conn.setMicWanted(true);
  const firstRoom = session.room;
  session.mic.state = "off"; // the rejoin dropped the microphone
  session.emit("stalled", { silentMs: 3000 });
  await settle();
  await settle();
  assert.equal(session.calls.filter(c => c === "reconnect").length, 1);
  assert.notEqual(log.rooms.at(-1), firstRoom, "a rejoin creates a new Room: everything watching it must re-point");
  assert.equal(log.rooms.at(-1), session.room);
  assert.equal(session.mic.enableCalls, 2, "the student's 'mic on' choice survived the rejoin");
  assert.equal(log.ended, 0, "the idle blip during the rejoin is not 'the call ended'");
  assert.equal(log.errors.length, 0);
});

test("a dropped connection retries with backoff (1 s, 2 s, 4 s) and recovers without bothering the student", async () => {
  assert.deepEqual([...DEFAULT_RECONNECT_DELAYS_MS], [1000, 2000, 4000]);
  const { session, log, clock } = await open({}, { session: { reconnectFailures: 1 } });
  session.emit("error", { error: { code: "connection-failed", message: "lost" } });
  await settle();
  assert.equal(session.calls.filter(c => c === "reconnect").length, 0, "waits first");
  await clock.advance(1000);
  assert.equal(session.calls.filter(c => c === "reconnect").length, 1, "first retry fails");
  await clock.advance(2000);
  assert.equal(session.calls.filter(c => c === "reconnect").length, 2, "second retry succeeds");
  assert.equal(log.errors.length, 0);
  assert.equal(log.status.at(-1), "connected");
  assert.equal(log.ended, 0);
});

test("when every retry fails the session is released and one friendly error is reported", async () => {
  const { session, log, clock } = await open({}, { session: { reconnectFailures: 99 } });
  session.emit("error", { error: { code: "connection-failed", message: "lost" } });
  await settle();
  await clock.advance(1000 + 2000 + 4000);
  assert.equal(session.calls.filter(c => c === "reconnect").length, 3);
  assert.equal(log.errors.length, 1);
  assert.equal(log.errors[0].code, "connection-failed");
  assert.equal(log.rooms.at(-1), null);
  assert.ok(session.calls.includes("dispose"));
  assert.equal(clock.pending, 0, "no timer left behind");
});

test("only one rejoin runs at a time (stalled + connection-failed together)", async () => {
  const { session, clock } = await open();
  session.emit("stalled", { silentMs: 3000 });
  session.emit("error", { error: { code: "connection-failed", message: "lost" } });
  await settle();
  await clock.advance(1000);
  assert.equal(session.calls.filter(c => c === "reconnect").length, 1);
});

test("disposing during a pending rejoin cancels it", async () => {
  const { conn, session, clock } = await open({}, { session: { reconnectFailures: 99 } });
  session.emit("error", { error: { code: "connection-failed", message: "lost" } });
  await settle();
  await conn.dispose();
  await clock.advance(10_000);
  assert.equal(session.calls.filter(c => c === "reconnect").length, 0);
  assert.equal(clock.pending, 0);
});

// ---------- cancellation (the student leaves / a new session replaces this one) ----------

test("aborting while the avatar is still loading releases it and stays silent", async () => {
  const controller = new AbortController();
  const f = fakeSdk();
  const original = f.sdk.SpatialReal.prototype.createSession;
  f.sdk.SpatialReal.prototype.createSession = async function (options) {
    const session = await original.call(this, options);
    controller.abort(); // superseded while the avatar assets were downloading
    return session;
  };
  const r = recorder();
  const conn = await connectAvatar({ sdk: f.sdk, appId: "a", avatarId: "v", credential: "c", livekitUrl: "u", roomToken: "t", container, callbacks: r.callbacks, signal: controller.signal });
  assert.equal(conn, null);
  assert.deepEqual(f.sessions[0].calls, ["dispose"], "never started, released");
  assert.equal(r.log.errors.length, 0);
});

test("aborting while the session is starting releases it and stays silent", async () => {
  const controller = new AbortController();
  let release;
  const gate = new Promise(resolve => (release = resolve));
  const r = recorder();
  const f = fakeSdk({ startDelay: gate });
  const pending = connectAvatar({ sdk: f.sdk, appId: "a", avatarId: "v", credential: "c", livekitUrl: "u", roomToken: "t", container, callbacks: r.callbacks, signal: controller.signal });
  await settle();
  controller.abort();
  release();
  assert.equal(await pending, null);
  assert.deepEqual(f.sessions[0].calls, ["start", "end", "dispose"]);
  assert.equal(r.log.errors.length, 0);
});

// ---------- the click: audio unlock ----------

test("the audio context comes from the SDK's own helper when it is loaded, else an equivalent one is created", () => {
  const calls = [];
  const ctx = { id: 1 };
  assert.equal(createAvatarAudioContext({ createUnlockedAudioContext: () => (calls.push("sdk"), ctx) }), ctx);
  assert.deepEqual(calls, ["sdk"]);
  // a helper that throws never breaks the click (no Web Audio in node: falls through to undefined)
  assert.equal(createAvatarAudioContext({ createUnlockedAudioContext: () => { throw new Error("boom"); } }), undefined);
  assert.equal(createAvatarAudioContext(null), undefined);
});

test("MariamSession: the audio context is created before any await; the token comes from the API for THIS session", () => {
  const src = read("components/student/player/MariamSession.tsx");
  const start = src.slice(src.indexOf("const start = useCallback"), src.indexOf("}, [topicId, enrollmentId, checkpointId, t, audioSdk]);"));
  assert.ok(start.length > 0 && !start.includes("}, [topicId, enrollmentId, checkpointId, t, audioSdk]);"), "the useCallback body was actually found and bounded (a stale literal here would silently slice to end-of-file)");
  assert.ok(start.indexOf("createAvatarAudioContext(audioSdk)") >= 0 && start.indexOf("createAvatarAudioContext(audioSdk)") < start.indexOf("await "), "unlocked inside the click, before the first await");
  // `checkpointId` is additive/optional (Practice with Mariam checkpoint support) - the exact literal still proves
  // the request is for THIS session, in this order, with the resolved enrollment carried through.
  assert.ok(start.indexOf("await sessionsApi.start(topicId, undefined, enrollmentId, checkpointId)") >= 0 && start.indexOf("await sessionsApi.start(topicId, undefined, enrollmentId, checkpointId)") < start.indexOf("await sessionsApi.avatarToken(session_id)"), "the token is requested for the session that was just started, with the resolved enrollment carried through");
  assert.match(start, /credential: avatarCredential\.session_token/);
  assert.match(start, /appId: avatarCredential\.app_id/);
  assert.match(start, /avatarId: avatarCredential\.avatar_id/);
  assert.ok(!/NEXT_PUBLIC_SPATIALREAL|useRoomAudio/.test(src), "no build-time ids (they come from the same server source as the agent) and no second audio path");
});

// ---------- migration guards ----------

function walk(dir, out = []) {
  for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
    if (["node_modules", "dist", ".next", ".sites-runtime", ".tamakkan", ".vite-tamakkan"].includes(entry.name)) continue;
    const rel = `${dir}${entry.name}`;
    if (entry.isDirectory()) walk(`${rel}/`, out);
    else if (/\.(ts|tsx|mjs|js|json)$/.test(entry.name) && entry.name !== "package-lock.json") out.push(rel);
  }
  return out;
}

test("no legacy AvatarKit / spatialwalk runtime remains: packages, classes, hosts, build plugin", () => {
  const files = [...walk("lib/"), ...walk("components/"), ...walk("app/"), "vite.config.ts", "package.json"];
  const offenders = [];
  for (const file of files) {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    if (/@spatialwalk|avatarkit|spatialwalk\.cloud|\bAvatarSDK\b|\bAvatarManager\b|\bAvatarView\b|\bAvatarPlayer\b|Environment\.(intl|cn)|DrivingServiceMode|LiveKitProvider/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
  const pkg = JSON.parse(read("package.json"));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some(n => n.startsWith("@spatialwalk")));
});

test("the new SDK and livekit-client >= 2.19 are the dependencies, with the official build plugin", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.dependencies["@spatialreal/web-sdk"], /^1\.0\.0-beta\.\d+$/);
  const [major, minor] = pkg.dependencies["livekit-client"].split(".").map(Number);
  assert.ok(major === 2 && minor >= 19, `livekit-client ${pkg.dependencies["livekit-client"]} must be >= 2.19`);
  const vite = read("vite.config.ts");
  assert.match(vite, /import \{ spatialRealVitePlugin \} from "@spatialreal\/web-sdk\/vite"/);
  assert.match(vite, /plugins: \[spatialRealVitePlugin\(\)/);
  assert.match(vite, /dist\/client\/assets/, "the renderer's wasm is also placed where this app serves its assets");
});

test("the SpatialReal API key is not referenced anywhere in browser code", () => {
  const files = [...walk("lib/"), ...walk("components/"), ...walk("app/")];
  const offenders = files.filter(f => /SPATIALREAL_API_KEY|X-API-KEY|api\.spatialreal\.com|session-token/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")));
  assert.deepEqual(offenders.filter(f => !f.endsWith("lib/api/client.ts")), [], "the browser never talks to SpatialReal's token API or sees the key");
  assert.ok(!/SPATIALREAL_API_KEY/.test(read("lib/api/client.ts")));
});

test("the SDK is imported in exactly one place, lazily", () => {
  const importers = [...walk("lib/"), ...walk("components/"), ...walk("app/")].filter(f => /@spatialreal\/web-sdk/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")));
  assert.deepEqual(importers, ["lib/spatialreal/sdk.ts"]);
  assert.match(read("lib/spatialreal/sdk.ts"), /import\("@spatialreal\/web-sdk"\)/);
});

test("Voice Practice is untouched by the SDK migration", () => {
  for (const file of ["components/student/player/VoiceSession.tsx", "components/student/player/VoiceCallView.tsx", ...readdirSync(new URL("lib/voice/", root)).map(f => `lib/voice/${f}`)]) {
    assert.ok(!/spatialreal|avatarRuntime/i.test(read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")), `${file} must not touch the Avatar SDK`);
  }
});
