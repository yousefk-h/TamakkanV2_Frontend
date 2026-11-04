// Stage 4: automatic weak-network fallback (Avatar -> Cartoon) - the failure counter/offer orchestration layer
// (lib/spatialreal/weakNetworkFallback.ts), driven both as a pure unit (fake errors) and against the REAL
// avatarRuntime.ts `connectAvatar()` + a fake SDK (no browser, no network, no SpatialReal account) - same fake-SDK
// harness `avatar-runtime.test.mjs` already uses, so these qualifying-failure events are the actual shape the real
// runtime produces, not invented ones.
//
// Run with: npm run test:mic (now includes this file - see package.json)
import assert from "node:assert/strict";
import { test } from "node:test";

const { connectAvatar, AvatarSessionError, DEFAULT_RECONNECT_DELAYS_MS } = await import(new URL("../lib/spatialreal/avatarRuntime.ts", import.meta.url).href);
const {
  createWeakNetworkFallbackTracker,
  isQualifyingAvatarFailure,
  QUALIFYING_FAILURE_CODE,
  FAILURES_BEFORE_OFFER,
} = await import(new URL("../lib/spatialreal/weakNetworkFallback.ts", import.meta.url).href);

// ---------- fakes (same shapes as tests/avatar-runtime.test.mjs) ----------

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
      mic.state = mic.muted ? "muted" : "on";
    };
    mic.disable = () => {
      mic.disableCalls++;
      mic.state = "off";
    };
    this.reconnectFailures = options.reconnectFailures ?? 0;
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

function fakeSdk(sessionOptions = {}) {
  const sessions = [];
  class SpatialReal {
    constructor() {}
    async createSession() {
      const session = new FakeSession(sessionOptions);
      sessions.push(session);
      return session;
    }
  }
  return { sdk: { SpatialReal }, sessions };
}

function recorder() {
  const log = { status: [], errors: [], ended: 0 };
  return {
    log,
    callbacks: {
      onStatus: s => log.status.push(s),
      onRoom: () => {},
      onMicState: () => {},
      onMicError: () => {},
      onError: e => log.errors.push(e),
      onEnded: () => log.ended++,
    },
  };
}

const container = { nodeName: "DIV" };
async function open(sdkOptions = {}) {
  const f = fakeSdk(sdkOptions.session);
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
  });
  return { ...f, ...r, clock, conn, session: f.sessions[0] };
}

// ---------- pure tracker behavior ----------

test("FAILURES_BEFORE_OFFER is 3 and the qualifying code is connection-failed (matches the product spec)", () => {
  assert.equal(FAILURES_BEFORE_OFFER, 3);
  assert.equal(QUALIFYING_FAILURE_CODE, "connection-failed");
});

test("isQualifyingAvatarFailure: only an AvatarSessionError with code connection-failed qualifies", () => {
  assert.ok(isQualifyingAvatarFailure(new AvatarSessionError("connection-failed", "x")));
  assert.ok(!isQualifyingAvatarFailure(new AvatarSessionError("credential-expired", "x")), "not a network-recoverability problem");
  assert.ok(!isQualifyingAvatarFailure(new AvatarSessionError("session-ended", "x", "credits_exhausted")));
  assert.ok(!isQualifyingAvatarFailure(new Error("connection-failed")), "plain Error, not AvatarSessionError, never counts");
  assert.ok(!isQualifyingAvatarFailure(null));
  assert.ok(!isQualifyingAvatarFailure(undefined));
});

test("tracker: increments only on qualifying errors, offers exactly on the 3rd, never again without a reset", () => {
  const tracker = createWeakNetworkFallbackTracker();
  const qualifying = () => new AvatarSessionError("connection-failed", "x");
  const nonQualifying = () => new AvatarSessionError("credential-expired", "x");

  assert.equal(tracker.recordError(nonQualifying()), false, "non-qualifying errors never trigger the offer");
  assert.equal(tracker.qualifyingFailures, 0, "non-qualifying errors do not count either");

  assert.equal(tracker.recordError(qualifying()), false, "1st qualifying failure: not yet");
  assert.equal(tracker.qualifyingFailures, 1);
  assert.equal(tracker.recordError(qualifying()), false, "2nd qualifying failure: not yet");
  assert.equal(tracker.qualifyingFailures, 2);
  assert.equal(tracker.recordError(qualifying()), true, "3rd qualifying failure: show the offer, exactly once");
  assert.equal(tracker.offered, true);

  // Further qualifying failures (student declined and the problem continues) never re-trigger the offer this arm.
  assert.equal(tracker.recordError(qualifying()), false, "no duplicate/overlapping offer");
  assert.equal(tracker.recordError(qualifying()), false);
});

test("tracker: recordSuccess resets the count AND re-arms the one-time offer for a later, separate run of trouble", () => {
  const tracker = createWeakNetworkFallbackTracker();
  const qualifying = () => new AvatarSessionError("connection-failed", "x");

  tracker.recordError(qualifying());
  tracker.recordError(qualifying());
  tracker.recordError(qualifying()); // offer #1
  assert.equal(tracker.offered, true);

  tracker.recordSuccess(); // the call is healthy again (fresh start, or a rejoin that actually succeeded)
  assert.equal(tracker.qualifyingFailures, 0);
  assert.equal(tracker.offered, false);

  // A brand new run of instability earns its own 3-strikes count and its own one-time offer.
  assert.equal(tracker.recordError(qualifying()), false);
  assert.equal(tracker.recordError(qualifying()), false);
  assert.equal(tracker.recordError(qualifying()), true, "re-armed: offer #2 fires on its own 3rd");
});

test("tracker: a lone qualifying failure (not yet 3) does not reset on an UNRELATED non-qualifying error", () => {
  const tracker = createWeakNetworkFallbackTracker();
  tracker.recordError(new AvatarSessionError("connection-failed", "x"));
  tracker.recordError(new AvatarSessionError("mic-unavailable", "x")); // unrelated, ignored entirely
  assert.equal(tracker.qualifyingFailures, 1, "the unrelated error neither counts nor resets the real count");
  assert.equal(tracker.recordError(new AvatarSessionError("connection-failed", "x")), false);
  assert.equal(tracker.recordError(new AvatarSessionError("connection-failed", "x")), true, "still reaches 3 on the 3rd qualifying one");
});

// ---------- against the REAL runtime: one qualifying failure = one exhausted rejoin/stall cycle, not one retry ----------

test("one qualifying failure = one full rejoin() exhaustion (3 internal retries), counted ONCE, not 3 times", async () => {
  const tracker = createWeakNetworkFallbackTracker();
  const { session, log, clock } = await open({ session: { reconnectFailures: 99 } });
  session.emit("error", { error: { code: "connection-failed", message: "lost" } });
  await settle();
  await clock.advance(1000 + 2000 + 4000); // all 3 backoff attempts (DEFAULT_RECONNECT_DELAYS_MS) fail
  assert.equal(session.calls.filter(c => c === "reconnect").length, 3, "3 retries happened inside ONE rejoin sequence");
  assert.equal(log.errors.length, 1, "but onError (the only signal this module watches) fires exactly once");

  const triggered = tracker.recordError(log.errors[0]);
  assert.equal(triggered, false, "1 qualifying failure, not 3 - these are not 3 independent failures");
  assert.equal(tracker.qualifyingFailures, 1);
});

test("the stall guard's single rejoin([0]) failing is also exactly one qualifying failure", async () => {
  const tracker = createWeakNetworkFallbackTracker();
  const { session, log } = await open({ session: { reconnectFailures: 99 } });
  session.emit("stalled", { silentMs: 3000 });
  await settle();
  assert.equal(session.calls.filter(c => c === "reconnect").length, 1, "the stall guard retries once, no wait");
  assert.equal(log.errors.length, 1);
  assert.equal(log.errors[0].code, "connection-failed");
  assert.equal(tracker.recordError(log.errors[0]), false);
  assert.equal(tracker.qualifyingFailures, 1);
});

test("3 separate qualifying cycles (3 separate connectAvatar runs, as a real remount/retry would produce) show the offer on the 3rd", async () => {
  const tracker = createWeakNetworkFallbackTracker();
  for (let i = 0; i < 2; i++) {
    const { session, log, clock } = await open({ session: { reconnectFailures: 99 } });
    session.emit("error", { error: { code: "connection-failed", message: "lost" } });
    await settle();
    await clock.advance(1000 + 2000 + 4000);
    assert.equal(tracker.recordError(log.errors[0]), false, `cycle ${i + 1} of 3: not yet`);
  }
  const { session, log, clock } = await open({ session: { reconnectFailures: 99 } });
  session.emit("error", { error: { code: "connection-failed", message: "lost" } });
  await settle();
  await clock.advance(1000 + 2000 + 4000);
  assert.equal(tracker.recordError(log.errors[0]), true, "3rd independent cycle: show the offer");
});

test("a successful rejoin (recovered without the student noticing) does not count as a failure, and resets a prior partial count", async () => {
  const tracker = createWeakNetworkFallbackTracker();
  tracker.recordError(new AvatarSessionError("connection-failed", "x")); // 1 qualifying failure so far, on some earlier cycle
  assert.equal(tracker.qualifyingFailures, 1);

  const { session, log, clock } = await open({ session: { reconnectFailures: 1 } }); // succeeds on the 2nd attempt
  session.emit("error", { error: { code: "connection-failed", message: "lost" } });
  await settle();
  await clock.advance(1000 + 2000);
  assert.equal(log.errors.length, 0, "a recovered rejoin never reaches onError at all");
  assert.equal(log.status.at(-1), "connected");

  // The component's own status-watcher effect would call recordSuccess() here (status === "connected").
  tracker.recordSuccess();
  assert.equal(tracker.qualifyingFailures, 0, "the healthy reconnect wipes the earlier partial count");
});
