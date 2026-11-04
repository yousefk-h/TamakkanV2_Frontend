// Avatar Practice turn-taking driven by the real LiveKit `lk.agent.state` (lib/spatialreal/{agentState,avatarTurn}.ts)
// feeding the half-duplex mic gate, with ActiveSpeakersChanged kept only as the fallback. Fake rooms, fake clock,
// fake microphone: no network, no LiveKit server, no paid session.
//
// Run with: npm run test:mic
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { ParticipantKind, RoomEvent } from "livekit-client";

const { createMicGate } = await import(new URL("../lib/spatialreal/micGate.ts", import.meta.url).href);
const { watchAvatarTurn, DEFAULT_AGENT_STALL_MS } = await import(new URL("../lib/spatialreal/avatarTurn.ts", import.meta.url).href);
const { parseAgentState, selectAgentParticipant, readAgentState } = await import(new URL("../lib/spatialreal/agentState.ts", import.meta.url).href);
const { deriveAvatarTurn } = await import(new URL("../lib/spatialreal/avatarUiState.ts", import.meta.url).href);
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

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

class FakeRoom {
  constructor() {
    this.handlers = new Map();
    this.remoteParticipants = new Map();
    this.activeSpeakers = [];
  }
  on(event, fn) {
    (this.handlers.get(event) ?? this.handlers.set(event, new Set()).get(event)).add(fn);
    return this;
  }
  off(event, fn) {
    this.handlers.get(event)?.delete(fn);
    return this;
  }
  listenerCount() {
    return [...this.handlers.values()].reduce((n, s) => n + s.size, 0);
  }
  emit(event, ...args) {
    this.handlers.get(event)?.forEach(fn => fn(...args));
  }
  add(participant) {
    this.remoteParticipants.set(participant.identity, participant);
    this.emit(RoomEvent.ParticipantConnected, participant);
    return participant;
  }
  setState(participant, state) {
    participant.attributes = { ...participant.attributes, "lk.agent.state": state };
    this.emit(RoomEvent.ParticipantAttributesChanged, { "lk.agent.state": state }, participant);
  }
  speakers(list) {
    this.activeSpeakers = list;
    this.emit(RoomEvent.ActiveSpeakersChanged, list);
  }
}

const tutor = (state, identity = "agent-mariam") => ({ identity, kind: ParticipantKind.AGENT, attributes: state === undefined ? {} : { "lk.agent.state": state } });
// SpatialReal's rendering participant: agent-kind, but publishing on behalf of the tutor.
const renderer = (attributes = {}) => ({ identity: "spatialreal-avatar", kind: ParticipantKind.AGENT, attributes: { "lk.publish_on_behalf": "agent-mariam", ...attributes } });
const student = { isLocal: true };
const remote = { isLocal: false };

/** One session: room + real gate + real watcher, with a recorded mic and UI callbacks. */
function session({ manualMuted = false, ...options } = {}) {
  const clock = fakeClock();
  const room = new FakeRoom();
  const calls = [];
  const ui = { states: [], speaking: [] };
  const gate = createMicGate({ applyMic: enabled => calls.push(enabled), ...clock });
  if (manualMuted) gate.setManualMuted(true);
  const stop = watchAvatarTurn(room, {
    gate,
    onAgentState: s => ui.states.push(s),
    onStudentSpeaking: s => ui.speaking.push(s),
    ...clock,
    ...options,
  });
  // The empty-room start (no agent yet -> fallback -> mic available) is covered by its own tests below; the
  // per-state tests look at what happens from the moment the tutor is in the room.
  calls.length = 0;
  return { clock, room, calls, ui, gate, stop };
}

test("selection: the tutor is agent-kind WITHOUT publish_on_behalf - the SpatialReal renderer is never the source", () => {
  const real = tutor("listening");
  const avatar = renderer({ "lk.agent.state": "speaking" });
  assert.equal(selectAgentParticipant([avatar, real]), real, "order does not matter");
  assert.equal(selectAgentParticipant([real, avatar]), real);
  assert.equal(selectAgentParticipant([avatar]), undefined, "a room with only the renderer has no tutor");
  assert.equal(selectAgentParticipant([{ identity: "student-1", kind: ParticipantKind.STANDARD, attributes: { "lk.agent.state": "speaking" } }]), undefined, "a standard participant is never the tutor");
  assert.equal(readAgentState([avatar, real]), "listening");
  assert.equal(readAgentState([avatar]), null);
  // identity strings are not used to decide: a renamed tutor / renderer behaves identically
  assert.equal(readAgentState([{ ...real, identity: "spatialreal-avatar" }]), "listening");
  assert.equal(readAgentState([{ ...avatar, identity: "agent-mariam" }]), null);
});

test("parse: only the five documented LiveKit states are accepted", () => {
  for (const state of ["initializing", "idle", "listening", "thinking", "speaking"]) assert.equal(parseAgentState(state), state);
  for (const bad of [undefined, null, "", "Speaking", "connecting", "failed", 3]) assert.equal(parseAgentState(bad), null);
});

test("speaking -> mic paused immediately; listening -> mic available (after the 250 ms hold)", () => {
  const { room, calls, clock, gate } = session();
  const agent = room.add(tutor("speaking"));
  assert.equal(gate.micEnabled, false, "paused as soon as the agent is speaking");
  room.setState(agent, "listening");
  assert.equal(gate.micEnabled, false, "still inside the resume hold");
  clock.advance(249);
  assert.equal(gate.micEnabled, false);
  clock.advance(1);
  assert.equal(gate.micEnabled, true);
  assert.deepEqual(calls, [false, true]);
  room.setState(agent, "speaking");
  assert.equal(gate.micEnabled, false, "paused again immediately");
});

test("leaving 'speaking' never blindly opens the mic: thinking (and initializing / idle) keep it paused", () => {
  const { room, calls, clock, gate } = session();
  const agent = room.add(tutor("speaking"));
  room.setState(agent, "thinking");
  clock.advance(5_000);
  assert.equal(gate.micEnabled, false, "thinking is not the student's turn");
  assert.ok(!calls.includes(true));
  room.setState(agent, "idle");
  clock.advance(5_000);
  assert.equal(gate.micEnabled, false);
  room.setState(agent, "initializing");
  clock.advance(5_000);
  assert.equal(gate.micEnabled, false);
  room.setState(agent, "listening");
  clock.advance(250);
  assert.equal(gate.micEnabled, true);
});

test("the mic opens only on 'listening', even if room speaker detection says everyone is silent", () => {
  const { room, clock, gate } = session();
  const agent = room.add(tutor("thinking"));
  room.speakers([]); // nobody detected speaking - the old gate would have resumed here
  clock.advance(1_000);
  assert.equal(gate.micEnabled, false);
  room.setState(agent, "listening");
  clock.advance(250);
  assert.equal(gate.micEnabled, true);
});

test("a speaker event cannot reopen or close the mic while a real agent state is present", () => {
  const { room, clock, gate } = session();
  room.add(tutor("listening"));
  clock.advance(250);
  assert.equal(gate.micEnabled, true);
  room.speakers([remote]); // the fallback signal says 'someone is speaking' - the real state says listening
  assert.equal(gate.micEnabled, true, "fallback ignored while the primary signal exists");
  room.speakers([]);
  assert.equal(gate.micEnabled, true);
});

test("manual mute survives every state change and is never auto-unmuted", () => {
  const { room, clock, calls, gate } = session({ manualMuted: true });
  const agent = room.add(tutor("speaking"));
  for (const state of ["thinking", "listening", "speaking", "listening", "idle", "listening"]) {
    room.setState(agent, state);
    clock.advance(1_000);
  }
  assert.ok(!calls.includes(true), "the mic was never turned on while the student had it muted");
  assert.equal(gate.micEnabled, false);
  // the student unmutes during their turn -> on
  gate.setManualMuted(false);
  assert.equal(gate.micEnabled, true);
  // and muting again mid-turn works, then a new agent turn + return does not undo it
  gate.setManualMuted(true);
  room.setState(agent, "speaking");
  room.setState(agent, "listening");
  clock.advance(250);
  assert.equal(gate.micEnabled, false);
});

test("state missing -> falls back to ActiveSpeakersChanged and the mic is never stuck muted", () => {
  const { room, clock, gate, ui } = session();
  // agent joined but has not published any state yet
  room.add(tutor(undefined));
  assert.equal(gate.micEnabled, true, "no state, nobody speaking: mic available");
  room.speakers([remote]);
  assert.equal(gate.micEnabled, false, "fallback: a remote speaker pauses the mic");
  room.speakers([]);
  clock.advance(250);
  assert.equal(gate.micEnabled, true);
  assert.equal(ui.states.at(-1), null, "the UI is told there is no agent state");
});

test("no agent at all (only the renderer, even one carrying a state attribute) -> fallback, renderer state ignored", () => {
  const { room, clock, gate, ui } = session();
  room.add(renderer({ "lk.agent.state": "speaking" }));
  assert.equal(gate.micEnabled, true, "a 'speaking' attribute on the renderer must not pause the mic");
  assert.equal(ui.states.at(-1), null);
  room.speakers([remote]);
  assert.equal(gate.micEnabled, false, "speaker fallback still works");
  room.speakers([]);
  clock.advance(250);
  assert.equal(gate.micEnabled, true);
});

test("wrong participant ignored both ways: renderer 'listening' cannot open the mic, renderer 'speaking' cannot close it", () => {
  const { room, clock, gate } = session();
  const agent = room.add(tutor("speaking"));
  const avatar = room.add(renderer({ "lk.agent.state": "listening" }));
  assert.equal(gate.micEnabled, false, "tutor speaking wins over the renderer's attribute");
  room.setState(avatar, "listening"); // renderer attribute churn
  assert.equal(gate.micEnabled, false);
  room.setState(agent, "listening");
  room.setState(avatar, "speaking");
  clock.advance(250);
  assert.equal(gate.micEnabled, true, "tutor listening wins over the renderer's 'speaking'");
});

test("reconnect re-reads the current state even if the change event was lost", () => {
  const { room, clock, gate } = session();
  const agent = room.add(tutor("speaking"));
  assert.equal(gate.micEnabled, false);
  // during a network drop the tutor went back to listening; the attribute event never arrived
  agent.attributes = { "lk.agent.state": "listening" };
  clock.advance(5_000);
  assert.equal(gate.micEnabled, false, "still believing 'speaking' until something re-reads the room");
  room.emit(RoomEvent.Reconnected);
  clock.advance(250);
  assert.equal(gate.micEnabled, true);
  // and the other direction
  agent.attributes = { "lk.agent.state": "speaking" };
  room.emit(RoomEvent.Reconnected);
  assert.equal(gate.micEnabled, false);
});

test("reconnect re-reads the speaker fallback too", () => {
  const { room, clock, gate } = session();
  room.speakers([remote]);
  assert.equal(gate.micEnabled, false);
  room.activeSpeakers = []; // the 'stopped' event was lost
  room.emit(RoomEvent.Reconnected);
  clock.advance(250);
  assert.equal(gate.micEnabled, true);
});

test("the tutor leaving hands control to the fallback instead of leaving the mic paused", () => {
  const { room, gate, clock, ui } = session();
  const agent = room.add(tutor("thinking"));
  assert.equal(gate.micEnabled, false);
  room.remoteParticipants.delete(agent.identity);
  room.emit(RoomEvent.ParticipantDisconnected, agent);
  clock.advance(250);
  assert.equal(gate.micEnabled, true, "no tutor, no state, nobody speaking");
  assert.equal(ui.states.at(-1), null);
});

test("stall guard: a state stuck in thinking/initializing/idle cannot keep the mic paused forever", () => {
  const { room, clock, gate, ui } = session();
  const agent = room.add(tutor("thinking"));
  clock.advance(DEFAULT_AGENT_STALL_MS - 1);
  assert.equal(gate.micEnabled, false);
  clock.advance(1);
  clock.advance(250);
  assert.equal(ui.states.at(-1), null, "the UI no longer trusts the stuck state");
  assert.equal(gate.micEnabled, true, "fallback (nobody speaking) released the mic");
  // the next real change restores the primary signal
  room.setState(agent, "speaking");
  assert.equal(gate.micEnabled, false);
  assert.equal(ui.states.at(-1), "speaking");
});

test("stall guard: 'listening' and 'speaking' never arm it, and a state change restarts the budget", () => {
  const { room, clock, gate } = session();
  const agent = room.add(tutor("speaking"));
  clock.advance(10 * DEFAULT_AGENT_STALL_MS);
  assert.equal(gate.micEnabled, false, "a long speech is not a stall");
  room.setState(agent, "thinking");
  clock.advance(DEFAULT_AGENT_STALL_MS - 1);
  room.setState(agent, "idle"); // new value: fresh budget
  clock.advance(DEFAULT_AGENT_STALL_MS - 1);
  assert.equal(gate.micEnabled, false);
  room.setState(agent, "listening");
  assert.equal(clock.pending, 1, "only the resume hold is pending - the stall timer was cleared");
});

test("UI callbacks: effective agent state is reported once per change; 'hearing you' comes only from the local speaker", () => {
  const { room, ui } = session();
  const agent = room.add(tutor("initializing"));
  room.setState(agent, "initializing"); // duplicate
  room.setState(agent, "speaking");
  room.setState(agent, "thinking");
  assert.deepEqual(ui.states, [null, "initializing", "speaking", "thinking"], "starts as 'no state', then one report per change");
  room.speakers([remote]);
  assert.deepEqual(ui.speaking, [], "a remote speaker is not the student speaking");
  room.speakers([student]);
  room.speakers([student, remote]);
  room.speakers([]);
  assert.deepEqual(ui.speaking, [true, false]);
});

test("stale events: an old room can never drive a new session's gate", () => {
  const a = session();
  const agentA = a.room.add(tutor("speaking"));
  const b = session();
  const agentB = b.room.add(tutor("listening"));
  b.clock.advance(250);
  assert.equal(b.gate.micEnabled, true);

  // A ends: dispose the watcher and the gate, exactly as the hook's effect cleanup does
  a.stop();
  a.gate.dispose();
  assert.equal(a.room.listenerCount(), 0, "no listeners left on the old room");
  assert.equal(a.clock.pending, 0);

  const aCalls = a.calls.length;
  const bCalls = b.calls.length;
  a.room.setState(agentA, "listening"); // late events from the OLD session
  a.room.speakers([remote]);
  a.room.emit(RoomEvent.Reconnected);
  a.clock.advance(60_000);
  assert.equal(a.calls.length, aCalls, "the old gate does nothing");
  assert.equal(b.calls.length, bCalls, "and the new session's gate is unaffected");
  assert.equal(b.gate.micEnabled, true);
  assert.equal(b.room.listenerCount() > 0, true);
  // and the new session still follows ITS OWN agent only
  b.room.setState(agentB, "speaking");
  assert.equal(b.gate.micEnabled, false);
  assert.equal(a.gate.micEnabled, false, "A's last instruction to its mic stays 'paused'");
});

test("stale events: a disposed watcher ignores participant-level events and arms no timers", () => {
  const s = session();
  const agent = s.room.add(tutor("thinking"));
  s.stop();
  s.stop(); // idempotent
  s.room.add(tutor("speaking", "agent-other"));
  s.room.emit(RoomEvent.ParticipantDisconnected, agent);
  assert.equal(s.clock.pending, 0);
  assert.equal(s.room.listenerCount(), 0);
});

test("two sessions in one page keep fully independent gates, timers and UI state", () => {
  const a = session();
  const b = session();
  a.room.add(tutor("speaking"));
  assert.equal(a.gate.micEnabled, false);
  assert.equal(b.gate.micEnabled, true);
  assert.deepEqual(b.calls, []);
  assert.deepEqual(b.ui.states, [null], "B never hears about A's agent");
});

// ---- authoritative UI state ----

const base = { status: "connected", micRequested: true, isMariamSpeaking: false, isMicMuted: false, isPublishingMicrophone: true };

test("turn state machine: every state is backed by a real signal", () => {
  assert.equal(deriveAvatarTurn({ ...base, status: "initializing" }), "connecting");
  assert.equal(deriveAvatarTurn({ ...base, status: "connecting" }), "connecting");
  assert.equal(deriveAvatarTurn({ ...base, agentState: "initializing", isMariamSpeaking: true }), "connecting", "connected but the agent is still initializing");
  assert.equal(deriveAvatarTurn({ ...base, agentState: "idle", isMariamSpeaking: true }), "connecting");
  assert.equal(deriveAvatarTurn({ ...base, agentState: "speaking", isMariamSpeaking: true }), "mariamSpeaking");
  assert.equal(deriveAvatarTurn({ ...base, agentState: "thinking", isMariamSpeaking: true }), "mariamThinking");
  assert.equal(deriveAvatarTurn({ ...base, agentState: "listening" }), "yourTurn");
  assert.equal(deriveAvatarTurn({ ...base, agentState: "listening", isMariamSpeaking: true }), "mariamSpeaking", "inside the resume hold it is not yet the student's turn");
  assert.equal(deriveAvatarTurn({ ...base, agentState: "listening", isPublishingMicrophone: false }), "listening");
  assert.equal(deriveAvatarTurn({ ...base, status: "disconnecting", agentState: "listening" }), "ending");
  assert.equal(deriveAvatarTurn({ ...base, status: "error", agentState: "listening" }), "error");
});

test("turn state: 'thinking' is never the student's turn, and the student's own mute always wins", () => {
  for (const agentState of ["speaking", "thinking", "listening", "initializing", "idle", null]) {
    assert.equal(deriveAvatarTurn({ ...base, micRequested: false, agentState }), "micOff", String(agentState));
  }
  assert.notEqual(deriveAvatarTurn({ ...base, agentState: "thinking" }), "yourTurn");
});

test("turn state: no agent state -> the original speaker-detection behaviour, and 'thinking' can never be invented", () => {
  assert.equal(deriveAvatarTurn({ ...base, agentState: null }), "yourTurn");
  assert.equal(deriveAvatarTurn({ ...base }), "yourTurn");
  assert.equal(deriveAvatarTurn({ ...base, agentState: null, isMariamSpeaking: true }), "mariamSpeaking");
  assert.equal(deriveAvatarTurn({ ...base, agentState: null, isMicMuted: true }), "mariamSpeaking");
  for (const isMariamSpeaking of [true, false]) assert.notEqual(deriveAvatarTurn({ ...base, agentState: null, isMariamSpeaking }), "mariamThinking");
});

// ---- wiring & scope guards ----

test("hook wiring: one watcher per room, cleaned up with the gate; the component holds no gate logic", () => {
  const hook = read("lib/spatialreal/useSpatialRealAvatar.ts");
  assert.match(hook, /watchAvatarTurn\(room,/);
  assert.match(hook, /stopWatching\(\)/);
  assert.match(hook, /gate\.dispose\(\)/);
  const watcher = read("lib/spatialreal/avatarTurn.ts");
  assert.match(watcher, /RoomEvent\.ParticipantAttributesChanged/);
  assert.match(watcher, /RoomEvent\.ActiveSpeakersChanged/, "fallback kept");
  assert.match(watcher, /RoomEvent\.Reconnected/);
  const component = read("components/student/player/MariamSession.tsx");
  assert.ok(!/ActiveSpeakersChanged|createMicGate|watchAvatarTurn|lk\.agent\.state/.test(component));
});

test("the participant is chosen by kind + publish_on_behalf, never by a name string", () => {
  const src = read("lib/spatialreal/agentState.ts");
  assert.match(src, /ParticipantKind\.AGENT/);
  assert.match(src, /lk\.publish_on_behalf/);
  assert.ok(!/spatialreal-avatar|includes\(["']avatar|startsWith\(["']agent/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "no identity/name matching in code");
});

test("Voice Practice is untouched: no Voice file imports anything from the Avatar (spatialreal) code", () => {
  const voiceFiles = ["components/student/player/VoiceSession.tsx", ...readdirSync(new URL("lib/voice/", root)).map(f => `lib/voice/${f}`)];
  for (const file of voiceFiles) assert.ok(!/from ["'][^"']*spatialreal[^"']*["']/.test(read(file)), `${file} must not import Avatar code`);
  // and the Avatar watcher/gate modules know nothing about Voice
  for (const file of ["lib/spatialreal/avatarTurn.ts", "lib/spatialreal/agentState.ts", "lib/spatialreal/micGate.ts"]) assert.ok(!/lib\/voice|VoiceRoom/.test(read(file)), file);
});
