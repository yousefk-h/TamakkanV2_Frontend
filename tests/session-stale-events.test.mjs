// Stale LiveKit events between an OLD and a NEW Voice room (old session -> new session, old user -> new user),
// driven with fake rooms: no network, no real LiveKit. Run with: npm run test:isolation
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { RoomEvent } from "livekit-client";

const { VoiceRoom } = await import(new URL("../lib/voice/voiceRoom.ts", import.meta.url).href);

function fakeTrack() {
  return { kind: "audio", attach: () => ({ remove() {} }), detach: () => [], stop() {}, mediaStreamTrack: { readyState: "live" } };
}

class FakeRoom {
  constructor(label) {
    this.label = label;
    this.handlers = new Map();
    this.textHandlers = new Map();
    this.remoteParticipants = new Map();
    this.canPlaybackAudio = true;
    this.connectCalls = [];
    this.disconnectCalls = 0;
    const pubs = new Map();
    this.localParticipant = {
      identity: `student-${label}`,
      trackPublications: pubs,
      setMicrophoneEnabled: async enabled => { if (enabled) pubs.set("TR_mic", { trackSid: "TR_mic", track: fakeTrack() }); },
    };
  }
  on(event, fn) { (this.handlers.get(event) ?? this.handlers.set(event, new Set()).get(event)).add(fn); return this; }
  off(event, fn) { this.handlers.get(event)?.delete(fn); return this; }
  listenerCount() { return [...this.handlers.values()].reduce((n, s) => n + s.size, 0); }
  emit(event, ...args) { this.handlers.get(event)?.forEach(fn => fn(...args)); }
  registerTextStreamHandler(topic, fn) { this.textHandlers.set(topic, fn); }
  unregisterTextStreamHandler(topic) { this.textHandlers.delete(topic); }
  async connect(url, token) { this.connectCalls.push({ url, token }); }
  async disconnect() { this.disconnectCalls++; }
  async startAudio() {}
}

const agent = id => ({ identity: `agent-${id}`, isAgent: true, attributes: { "lk.agent.state": "listening" }, audioTrackPublications: new Map() });

async function startVoice(label) {
  const room = new FakeRoom(label);
  const events = { joined: 0, ended: [] };
  const voice = new VoiceRoom({
    createRoom: () => room,
    getAudioContainer: () => ({ appendChild() {} }),
    onAgentJoined: () => events.joined++,
    onEnded: cause => events.ended.push(cause),
    agentJoinTimeoutMs: 60_000,
  });
  await voice.connect(`wss://lk.example/${label}`, `TOKEN-${label}`);
  room.emit(RoomEvent.ParticipantConnected, agent(label));
  await delay(5);
  return { room, events, voice };
}

test("A drops, B starts, then A's reconnect/disconnect events arrive: only A's room object reacts", async () => {
  const a = await startVoice("A");
  a.room.emit(RoomEvent.Reconnecting);
  const b = await startVoice("B"); // B starts while A is away
  assert.equal(a.voice.getSnapshot().connection, "reconnecting");
  assert.equal(b.voice.getSnapshot().connection, "connected");

  a.room.emit(RoomEvent.Reconnected); // A's late reconnect event
  assert.equal(a.voice.getSnapshot().connection, "connected");
  assert.equal(b.voice.getSnapshot().connection, "connected");
  // A's reconnect re-used A's own room object and never connected anywhere else
  assert.deepEqual(a.room.connectCalls, [{ url: "wss://lk.example/A", token: "TOKEN-A" }]);
  assert.deepEqual(b.room.connectCalls, [{ url: "wss://lk.example/B", token: "TOKEN-B" }]);
  assert.equal(b.room.connectCalls.length, 1, "B's room was never asked to reconnect by A's event");
  assert.deepEqual(b.events.ended, []);
  assert.equal(b.room.disconnectCalls, 0);
});

test("A's late agent-left / disconnect events end A only; B stays live with its own agent", async () => {
  const a = await startVoice("A");
  const b = await startVoice("B");
  a.room.emit(RoomEvent.ParticipantDisconnected, agent("A")); // A's agent leaves (late)
  a.room.emit(RoomEvent.Disconnected);
  await delay(10);
  assert.ok(a.events.ended.length >= 1 && a.voice.isEnded, "A ended");
  assert.deepEqual(b.events.ended, [], "B's callbacks were not fired by A's events");
  assert.equal(b.voice.isEnded, false);
  assert.equal(b.voice.getSnapshot().agentPresent, true, "B still sees ITS agent");
  assert.equal(b.room.disconnectCalls, 0);
});

test("after A ends, further events on A's old room change nothing - A or B - and no listeners leak", async () => {
  const a = await startVoice("A");
  const b = await startVoice("B");
  await a.voice.end("user_ended");
  assert.deepEqual(a.events.ended, ["user_ended"]);
  assert.equal(a.room.listenerCount(), 0, "A's room listeners are removed on end");
  const bListeners = b.room.listenerCount();
  const aJoined = a.events.joined, bJoined = b.events.joined;
  const aSnapshot = JSON.stringify(a.voice.getSnapshot());

  for (const event of [RoomEvent.Reconnected, RoomEvent.Reconnecting, RoomEvent.Disconnected]) a.room.emit(event);
  a.room.emit(RoomEvent.ParticipantConnected, agent("A"));
  await delay(10);
  assert.deepEqual(a.events.ended, ["user_ended"], "no second end callback from A");
  assert.equal(a.events.joined, aJoined, "no 'agent joined' for an ended session");
  assert.equal(JSON.stringify(a.voice.getSnapshot()), aSnapshot, "A's ended snapshot is frozen");
  assert.equal(b.events.joined, bJoined);
  assert.deepEqual(b.events.ended, []);
  assert.equal(b.room.listenerCount(), bListeners);
  assert.equal(b.voice.getSnapshot().connection, "connected");
});

test("two rooms never share snapshots, transcripts or tokens", async () => {
  const a = await startVoice("A");
  const b = await startVoice("B");
  assert.notEqual(a.voice.getSnapshot(), b.voice.getSnapshot());
  assert.notEqual(a.room.connectCalls[0].token, b.room.connectCalls[0].token);
  assert.deepEqual(a.voice.finalTranscript(), []);
  assert.deepEqual(b.voice.finalTranscript(), []);
});
