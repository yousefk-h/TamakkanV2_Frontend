// Avatar Practice half-duplex microphone gate (lib/spatialreal/micGate.ts), driven with a fake clock and a fake
// microphone - no network, no LiveKit, no paid session.
//
// Run with: npm run test:mic
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const { createMicGate, DEFAULT_UNMUTE_DELAY_MS } = await import(new URL("../lib/spatialreal/micGate.ts", import.meta.url).href);
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

/** Manual scheduler: nothing runs until `advance()`. */
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
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = end;
    },
    get pending() {
      return timers.size;
    },
  };
}

function makeGate(overrides = {}) {
  const clock = fakeClock();
  const calls = []; // every applyMic(enabled) call, in order
  const paused = []; // every onPausedChange value
  const gate = createMicGate({ applyMic: enabled => calls.push(enabled), onPausedChange: p => paused.push(p), ...clock, ...overrides });
  return { gate, clock, calls, paused };
}

test("the resume delay is 250 ms", () => {
  assert.equal(DEFAULT_UNMUTE_DELAY_MS, 250);
});

test("mic pauses immediately when Mariam starts speaking", () => {
  const { gate, calls, paused } = makeGate();
  gate.setMariamSpeaking(true);
  assert.deepEqual(calls, [false]);
  assert.equal(gate.micEnabled, false);
  assert.equal(gate.mariamPaused, true);
  assert.deepEqual(paused, [true]);
});

test("mic resumes ~250 ms after Mariam finishes (not before)", () => {
  const { gate, clock, calls, paused } = makeGate();
  gate.setMariamSpeaking(true);
  gate.setMariamSpeaking(false);
  clock.advance(249);
  assert.deepEqual(calls, [false], "still paused 1 ms before the delay ends");
  assert.equal(gate.mariamPaused, true, "the post-speech hold still counts as paused");
  clock.advance(1);
  assert.deepEqual(calls, [false, true]);
  assert.equal(gate.micEnabled, true);
  assert.equal(gate.mariamPaused, false);
  assert.deepEqual(paused, [true, false]);
});

test("a student's manual mute is respected and never auto-unmuted", () => {
  const { gate, clock, calls } = makeGate();
  gate.setManualMuted(true);
  gate.setMariamSpeaking(true);
  gate.setMariamSpeaking(false);
  clock.advance(10_000);
  assert.ok(!calls.includes(true), "the gate must never turn the mic on while the student muted it");
  assert.equal(gate.micEnabled, false);
  // once the STUDENT unmutes themselves (Mariam silent), the mic is on
  gate.setManualMuted(false);
  assert.equal(gate.micEnabled, true);
  assert.equal(calls.at(-1), true);
});

test("a manual unmute while Mariam is speaking stays paused until she finishes (+250 ms)", () => {
  const { gate, clock, calls } = makeGate();
  gate.setManualMuted(true);
  gate.setMariamSpeaking(true);
  gate.setManualMuted(false); // student taps unmute mid-speech
  assert.equal(gate.micEnabled, false);
  assert.ok(!calls.includes(true));
  gate.setMariamSpeaking(false);
  clock.advance(250);
  assert.equal(gate.micEnabled, true);
});

test("a pending unmute is cancelled if Mariam speaks again during the delay", () => {
  const { gate, clock, calls } = makeGate();
  gate.setMariamSpeaking(true);
  gate.setMariamSpeaking(false);
  clock.advance(100);
  gate.setMariamSpeaking(true); // back-to-back speech
  assert.equal(clock.pending, 0, "the pending unmute timer was cancelled");
  clock.advance(5_000);
  assert.ok(!calls.includes(true), "the mic never resumed in between");
  gate.setMariamSpeaking(false);
  clock.advance(250);
  assert.deepEqual(calls, [false, true], "exactly one resume, after the final stop");
});

test("fast back-to-back speech produces a single resume", () => {
  const { gate, clock, calls } = makeGate();
  for (let i = 0; i < 6; i++) {
    gate.setMariamSpeaking(true);
    clock.advance(30);
    gate.setMariamSpeaking(false);
    clock.advance(60);
  }
  assert.ok(!calls.includes(true));
  clock.advance(250);
  assert.deepEqual(calls, [false, true]);
});

test("repeated identical signals are idempotent (no extra mic calls, delay not restarted)", () => {
  const { gate, clock, calls } = makeGate();
  gate.setMariamSpeaking(true);
  gate.setMariamSpeaking(true);
  assert.deepEqual(calls, [false]);
  gate.setMariamSpeaking(false);
  clock.advance(200);
  gate.setMariamSpeaking(false); // a duplicate "stopped" must not push the resume out
  clock.advance(50);
  assert.deepEqual(calls, [false, true]);
});

test("disconnect / unmount: dispose clears the pending timer and nothing fires afterwards", () => {
  const { gate, clock, calls, paused } = makeGate();
  gate.setMariamSpeaking(true);
  gate.setMariamSpeaking(false);
  assert.equal(clock.pending, 1);
  gate.dispose();
  assert.equal(clock.pending, 0);
  clock.advance(10_000);
  assert.deepEqual(calls, [false], "no resume after dispose");
  gate.setMariamSpeaking(true);
  gate.setManualMuted(false);
  gate.reapply();
  assert.deepEqual(calls, [false], "a disposed gate ignores every further input");
  assert.deepEqual(paused, [true], "and emits no further state changes");
});

test("leaving Avatar Practice mid-speech never re-enables the mic", () => {
  const { gate, clock, calls } = makeGate();
  gate.setMariamSpeaking(true); // mic paused
  gate.dispose(); // what the hook does when the student switches to Voice Practice / the room goes away
  clock.advance(60_000);
  assert.equal(calls.at(-1), false, "last instruction to the mic was 'paused' - it is never switched back on");
});

test("reapply re-asserts the state on a freshly published mic track", () => {
  const { gate, calls } = makeGate();
  gate.setMariamSpeaking(true);
  gate.reapply(); // new track published while Mariam is speaking must start paused
  assert.deepEqual(calls, [false, false]);
});

test("reconnect: re-syncing 'Mariam silent' after a lost 'stopped' event resumes the mic", () => {
  const { gate, clock, calls } = makeGate();
  gate.setMariamSpeaking(true); // 'stopped' event lost during a reconnect...
  gate.setMariamSpeaking(false); // ...the hook re-reads room.activeSpeakers on Reconnected
  clock.advance(250);
  assert.equal(calls.at(-1), true);
});

test("gates are fully independent per instance (no shared state between sessions)", () => {
  const a = makeGate();
  const b = makeGate();
  a.gate.setMariamSpeaking(true);
  assert.equal(a.gate.micEnabled, false);
  assert.equal(b.gate.micEnabled, true);
  assert.deepEqual(b.calls, []);
});

// ---- wiring & scope guards (source-level, no browser needed) ----

test("hook wiring: event-driven signals (see avatar-turn.test.mjs), existing track mute/unmute, cleanup disposes the gate", () => {
  const hook = read("lib/spatialreal/useSpatialRealAvatar.ts");
  assert.match(read("lib/spatialreal/avatarTurn.ts"), /RoomEvent\.ActiveSpeakersChanged/, "speaker fallback is kept in the watcher");
  assert.match(hook, /watchAvatarTurn\(/);
  assert.match(hook, /createMicGate\(/);
  assert.match(hook, /gate\.dispose\(\)/);
  assert.match(hook, /setMicPaused\(!enabledNow\)/, "the gate pauses the SDK's own microphone (mic.muted) - no track is created or replaced");
  assert.match(read("lib/spatialreal/avatarRuntime.ts"), /session\.mic\.muted = micPaused/);
  assert.ok(!/setInterval\(|setTimeout\([^)]*speak/i.test(hook.slice(hook.indexOf("createMicGate("))), "no polling for the speaking state");
});

test("the gate module has no LiveKit/React/global state", () => {
  const src = read("lib/spatialreal/micGate.ts");
  assert.ok(!/from ["'](livekit-client|react)["']/.test(src));
  assert.ok(!/^(let|var) /m.test(src), "no module-level mutable state");
});

test("Voice Practice is untouched by the avatar mic gate", () => {
  const voiceFiles = ["components/student/player/VoiceSession.tsx", ...readdirSync(new URL("lib/voice/", root)).map(f => `lib/voice/${f}`)];
  for (const file of voiceFiles) {
    const src = read(file);
    assert.ok(!/micGate|isMariamSpeaking|useSpatialRealAvatar|ActiveSpeakersChanged.*mic/i.test(src), `${file} must not use the avatar mic gate`);
  }
});

test("English and Arabic strings exist for both UI states", () => {
  for (const file of ["lib/i18n/messages/en.ts", "lib/i18n/messages/ar.ts"]) {
    const src = read(file);
    assert.match(src, /mariamSpeakingMicPaused:/, file);
    assert.match(src, /yourTurn:/, file);
    assert.match(src, /yourTurnSpeak:/, file);
    assert.match(src, /mariamThinking:/, file);
    assert.match(src, /hearingYou:/, file);
  }
  assert.match(read("lib/i18n/messages/en.ts"), /mariamSpeakingMicPaused: "Mariam is speaking"/);
  assert.match(read("lib/i18n/messages/en.ts"), /yourTurnSpeak: "Your turn — speak now"/);
  assert.match(read("lib/i18n/messages/en.ts"), /mariamThinking: "Mariam is thinking"/);
  assert.match(read("lib/i18n/messages/en.ts"), /yourTurn: "Your turn"/);
});
