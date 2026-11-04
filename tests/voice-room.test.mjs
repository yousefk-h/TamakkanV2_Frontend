// Voice Practice room controller (lib/voice/voiceRoom.ts) and transcript
// collector (lib/voice/transcript.ts), driven with a fake LiveKit Room - no
// network, no real LiveKit session.
//
// Run with: npm run test:voice
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DisconnectReason, RoomEvent } from "livekit-client";

const { VoiceRoom } = await import(new URL("../lib/voice/voiceRoom.ts", import.meta.url).href);
const { TranscriptCollector, MAX_TURN_TEXT } = await import(new URL("../lib/voice/transcript.ts", import.meta.url).href);

function fakeElement() {
  return { removed: false, remove() { this.removed = true; } };
}

function fakeTrack(kind = "audio") {
  const elements = [];
  return {
    kind,
    stopped: false,
    elements,
    attach() { const el = fakeElement(); elements.push(el); return el; },
    detach() { return elements.splice(0); },
    stop() { this.stopped = true; },
  };
}

function fakeReader(id, attributes, chunks, { failAfter } = {}) {
  return {
    info: { id, attributes },
    async *[Symbol.asyncIterator]() {
      for (const [i, chunk] of chunks.entries()) {
        if (failAfter === i) throw new Error("aborted");
        await delay(1);
        yield chunk;
      }
    },
  };
}

class FakeRoom {
  constructor({ micDelayMs = 0, micError = null } = {}) {
    this.handlers = new Map();
    this.textHandlers = new Map();
    this.remoteParticipants = new Map();
    this.canPlaybackAudio = true;
    this.disconnectCalls = [];
    this.micCalls = [];
    this.inFlightMic = 0;
    this.maxInFlightMic = 0;
    const trackPublications = new Map();
    this.localParticipant = {
      identity: "student-1",
      trackPublications,
      setMicrophoneEnabled: async enabled => {
        this.micCalls.push(enabled);
        this.inFlightMic++;
        this.maxInFlightMic = Math.max(this.maxInFlightMic, this.inFlightMic);
        await delay(micDelayMs);
        this.inFlightMic--;
        if (micError) throw micError;
        if (enabled && !trackPublications.has("TR_mic")) trackPublications.set("TR_mic", { trackSid: "TR_mic", track: fakeTrack() });
      },
    };
  }
  on(event, fn) { (this.handlers.get(event) ?? this.handlers.set(event, new Set()).get(event)).add(fn); return this; }
  off(event, fn) { this.handlers.get(event)?.delete(fn); return this; }
  listenerCount() { return [...this.handlers.values()].reduce((n, s) => n + s.size, 0); }
  emit(event, ...args) { this.handlers.get(event)?.forEach(fn => fn(...args)); }
  registerTextStreamHandler(topic, fn) {
    if (this.textHandlers.has(topic)) throw new Error("duplicate text stream handler");
    this.textHandlers.set(topic, fn);
  }
  unregisterTextStreamHandler(topic) { this.textHandlers.delete(topic); }
  async connect(url, token) { this.connected = { url, token }; }
  async disconnect(stopTracks) { this.disconnectCalls.push(stopTracks); }
  async startAudio() { this.canPlaybackAudio = true; }
  async deliverTranscription(reader, identity) { await this.textHandlers.get("lk.transcription")?.(reader, { identity }); }
}

function agentParticipant(attributes = { "lk.agent.state": "listening" }) {
  return { identity: "agent-AJ_1", isAgent: true, attributes, audioTrackPublications: new Map() };
}

function setup(roomOptions, extra = {}) {
  const room = new FakeRoom(roomOptions);
  const container = { children: [], appendChild(el) { this.children.push(el); } };
  const events = { joined: 0, ended: [] };
  const voice = new VoiceRoom({
    createRoom: () => room,
    getAudioContainer: () => container,
    onAgentJoined: () => events.joined++,
    onEnded: cause => events.ended.push(cause),
    agentJoinTimeoutMs: extra.agentJoinTimeoutMs ?? 5_000,
  });
  return { room, container, events, voice };
}

async function joinAgent(room) {
  const agent = agentParticipant();
  room.remoteParticipants.set(agent.identity, agent);
  room.emit(RoomEvent.ParticipantConnected, agent);
  const track = fakeTrack();
  room.emit(RoomEvent.TrackSubscribed, track, { trackSid: "TR_agent_audio" }, agent);
  return { agent, track };
}

test("connects, publishes the microphone once, plays agent audio and reports the agent once", async () => {
  const { room, container, events, voice } = setup();
  await voice.connect("wss://x", "tok");
  assert.deepEqual(room.connected, { url: "wss://x", token: "tok" });
  assert.deepEqual(room.micCalls, [true]);
  assert.equal(voice.getSnapshot().micEnabled, true);

  const { agent, track } = await joinAgent(room);
  room.emit(RoomEvent.ParticipantConnected, agent); // duplicate event
  assert.equal(events.joined, 1);
  assert.equal(voice.getSnapshot().agentState, "listening");
  assert.equal(container.children.length, 1);
  room.emit(RoomEvent.TrackSubscribed, track, { trackSid: "TR_agent_audio" }, agent); // duplicate subscribe
  assert.equal(container.children.length, 1);

  agent.attributes = { "lk.agent.state": "speaking" };
  room.emit(RoomEvent.ParticipantAttributesChanged, {}, agent);
  assert.equal(voice.getSnapshot().agentState, "speaking");
});

test("rapid mic toggles never run two publishes at once (no duplicate microphone)", async () => {
  const { room, voice } = setup({ micDelayMs: 20 });
  const connecting = voice.connect("wss://x", "tok");
  await delay(1);
  voice.toggleMicrophone();
  voice.toggleMicrophone();
  await connecting;
  assert.equal(room.maxInFlightMic, 1);
  assert.deepEqual(room.micCalls, [true]);
  await voice.toggleMicrophone();
  assert.deepEqual(room.micCalls, [true, false]);
  assert.equal(voice.getSnapshot().micEnabled, false);
});

test("a denied microphone is reported without ending the session", async () => {
  const error = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
  const { events, voice } = setup({ micError: error });
  await voice.connect("wss://x", "tok");
  assert.equal(voice.getSnapshot().micError, "Permission denied");
  assert.equal(voice.getSnapshot().micEnabled, false);
  assert.deepEqual(events.ended, []);
});

test("ending cleans up everything exactly once", async () => {
  const { room, container, events, voice } = setup();
  await voice.connect("wss://x", "tok");
  await joinAgent(room);
  const mic = room.localParticipant.trackPublications.get("TR_mic").track;

  await Promise.all([voice.end("user_ended"), voice.end("connection_failure")]);
  await voice.end("user_ended");

  assert.deepEqual(events.ended, ["user_ended"]);
  assert.equal(mic.stopped, true);
  assert.ok(container.children.every(el => el.removed));
  assert.deepEqual(room.disconnectCalls, [true]);
  assert.equal(room.textHandlers.size, 0);
  assert.equal(room.listenerCount(), 0);
  assert.equal(voice.getSnapshot().connection, "ended");
  // Nothing after the end reaches LiveKit.
  await voice.setMicrophone(true);
  assert.deepEqual(room.micCalls, [true]);
});

test("a mic publish that lands after the session ended is stopped immediately", async () => {
  const { room, voice } = setup({ micDelayMs: 30 });
  const connecting = voice.connect("wss://x", "tok");
  await delay(5);
  await voice.end("user_ended");
  await connecting;
  const mic = room.localParticipant.trackPublications.get("TR_mic")?.track;
  assert.ok(!mic || mic.stopped);
});

test("the agent leaving ends the session as agent_ended", async () => {
  const { room, events, voice } = setup();
  await voice.connect("wss://x", "tok");
  const { agent } = await joinAgent(room);
  room.emit(RoomEvent.ParticipantDisconnected, agent);
  await delay(1);
  assert.deepEqual(events.ended, ["agent_ended"]);
});

test("a non-agent participant leaving does not end the session", async () => {
  const { room, events, voice } = setup();
  await voice.connect("wss://x", "tok");
  room.emit(RoomEvent.ParticipantDisconnected, { identity: "someone", isAgent: false });
  await delay(1);
  assert.deepEqual(events.ended, []);
});

for (const [reason, cause] of [
  [DisconnectReason.ROOM_DELETED, "agent_ended"],
  [DisconnectReason.PARTICIPANT_REMOVED, "agent_ended"],
  [DisconnectReason.UNKNOWN_REASON, "connection_failure"],
  [undefined, "connection_failure"],
]) {
  test(`a room disconnect (${reason}) ends as ${cause}`, async () => {
    const { room, events, voice } = setup();
    await voice.connect("wss://x", "tok");
    room.emit(RoomEvent.Disconnected, reason);
    await delay(1);
    assert.deepEqual(events.ended, [cause]);
  });
}

test("reconnecting is shown, not treated as an end", async () => {
  const { room, events, voice } = setup();
  await voice.connect("wss://x", "tok");
  room.emit(RoomEvent.Reconnecting);
  assert.equal(voice.getSnapshot().connection, "reconnecting");
  room.emit(RoomEvent.Reconnected);
  assert.equal(voice.getSnapshot().connection, "connected");
  assert.deepEqual(events.ended, []);
});

test("an agent that never joins ends the session as a connection failure", async () => {
  const { events, voice } = setup(undefined, { agentJoinTimeoutMs: 20 });
  await voice.connect("wss://x", "tok");
  await delay(40);
  assert.deepEqual(events.ended, ["connection_failure"]);
});

test("blocked autoplay is surfaced and cleared by startAudio", async () => {
  const { room, voice } = setup();
  room.canPlaybackAudio = false;
  await voice.connect("wss://x", "tok");
  assert.equal(voice.getSnapshot().audioBlocked, true);
  await voice.startAudio();
  assert.equal(voice.getSnapshot().audioBlocked, false);
});

test("live transcript: interim STT replaced by final, agent deltas joined, ordered, speakers from track ids", async () => {
  const { room, voice } = setup();
  await voice.connect("wss://x", "tok");
  // The agent publishes both sides; the student's side names the student's mic track.
  const studentAttrs = final => ({ "lk.segment_id": "SG_user1", "lk.transcribed_track_id": "TR_mic", "lk.transcription_final": String(final) });
  await room.deliverTranscription(fakeReader("s1", { "lk.segment_id": "SG_agent1", "lk.transcribed_track_id": "TR_agent_audio" }, ["Hi! ", "Ready to ", "talk?"]), "agent-AJ_1");
  await room.deliverTranscription(fakeReader("s2", studentAttrs(false), ["I like"]), "agent-AJ_1");
  await room.deliverTranscription(fakeReader("s3", studentAttrs(false), ["I like pop"]), "agent-AJ_1");
  assert.deepEqual(voice.getSnapshot().segments.map(s => [s.speaker, s.text, s.final]), [
    ["agent", "Hi! Ready to talk?", true],
    ["student", "I like pop", false],
  ]);
  await room.deliverTranscription(fakeReader("s4", studentAttrs(true), ["I like pop music."]), "agent-AJ_1");
  await room.deliverTranscription(fakeReader("s5", studentAttrs(false), ["I like pop mus"]), "agent-AJ_1"); // late interim
  const turns = voice.finalTranscript();
  assert.deepEqual(turns.map(t => [t.speaker, t.text]), [["agent", "Hi! Ready to talk?"], ["student", "I like pop music."]]);
  assert.ok(turns.every(t => !Number.isNaN(Date.parse(t.timestamp))));
});

test("an aborted stream is kept for display but never submitted as final", async () => {
  const { room, voice } = setup();
  await voice.connect("wss://x", "tok");
  await room.deliverTranscription(fakeReader("s1", { "lk.segment_id": "SG_a" }, ["Hello ", "the"], { failAfter: 1 }), "agent-AJ_1");
  assert.equal(voice.getSnapshot().segments.length, 1);
  assert.deepEqual(voice.finalTranscript(), []);
});

test("two sessions never share transcript or state", async () => {
  const one = setup();
  const two = setup();
  await one.voice.connect("wss://x", "tok-1");
  await two.voice.connect("wss://x", "tok-2");
  await one.room.deliverTranscription(fakeReader("s1", { "lk.segment_id": "SG_1", "lk.transcription_final": "true" }, ["only one"]), "agent-AJ_1");
  await one.voice.end("user_ended");
  assert.deepEqual(two.voice.finalTranscript(), []);
  assert.equal(two.voice.getSnapshot().connection, "connected");
  assert.deepEqual(two.events.ended, []);
  assert.equal(one.voice.finalTranscript()[0].text, "only one");
});

test("collector splits over-long turns to the backend limit", () => {
  const collector = new TranscriptCollector();
  const gen = collector.open("SG", "agent", 1000);
  collector.append("SG", gen, "x".repeat(MAX_TURN_TEXT * 2 + 5));
  collector.close("SG", gen, true);
  const turns = collector.finalTurns();
  assert.deepEqual(turns.map(t => t.text.length), [MAX_TURN_TEXT, MAX_TURN_TEXT, 5]);
});
