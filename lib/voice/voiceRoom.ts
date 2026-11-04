import { DisconnectReason, Room, RoomEvent, Track } from "livekit-client";
import type { Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, TextStreamReader } from "livekit-client";
import { TranscriptCollector, type TranscriptSegment, type TranscriptTurn } from "./transcript";

/** Voice Practice's LiveKit room, audio-only. Plain class (no React, no
 * SpatialReal) so its connect/mic/cleanup rules are unit-testable with a fake
 * room - see `tests/voice-room.test.mjs`. One instance == one session: every
 * `start` in `useVoicePractice` builds a fresh `VoiceRoom`, so nothing about a
 * student, token, room or transcript is ever shared between sessions.
 *
 * Guarantees:
 * - one microphone publish at a time (toggles while a publish is in flight are
 *   ignored; a publish that lands after `end` is stopped immediately);
 * - `end` runs exactly once, whoever triggers it (student, agent leaving, lost
 *   connection, timeout, unmount), and always detaches audio, unregisters the
 *   transcription handler, stops local tracks and disconnects. */

export type VoiceEndCause = "user_ended" | "agent_ended" | "connection_failure" | "max_duration_reached";
/** LiveKit Agents publishes this on the agent participant's `lk.agent.state` attribute. */
export type VoiceAgentState = "initializing" | "idle" | "listening" | "thinking" | "speaking";

export interface VoiceRoomSnapshot {
  connection: "idle" | "connecting" | "connected" | "reconnecting" | "ended";
  agentPresent: boolean;
  agentState: VoiceAgentState | null;
  micEnabled: boolean;
  micPending: boolean;
  micError: string | null;
  /** Browser blocked autoplay - call `startAudio()` from a click. */
  audioBlocked: boolean;
  segments: TranscriptSegment[];
}

export interface VoiceRoomOptions {
  getAudioContainer: () => HTMLElement | null;
  onAgentJoined: () => void;
  onEnded: (cause: VoiceEndCause) => void;
  /** End as a connection failure if the agent never joins. */
  agentJoinTimeoutMs?: number;
  createRoom?: () => Room;
}

const TRANSCRIPTION_TOPIC = "lk.transcription";
const INITIAL: VoiceRoomSnapshot = {
  connection: "idle",
  agentPresent: false,
  agentState: null,
  micEnabled: false,
  micPending: false,
  micError: null,
  audioBlocked: false,
  segments: [],
};

export class VoiceRoom {
  private readonly room: Room;
  private readonly transcript = new TranscriptCollector();
  private readonly audioElements = new Map<string, HTMLMediaElement[]>();
  private readonly listeners = new Set<() => void>();
  private snapshot: VoiceRoomSnapshot = INITIAL;
  private ended = false;
  private agentJoinTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: (() => void)[] = [];
  private readonly options: VoiceRoomOptions;

  constructor(options: VoiceRoomOptions) {
    this.options = options;
    this.room = options.createRoom ? options.createRoom() : new Room({ adaptiveStream: false, dynacast: false });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  get isEnded() {
    return this.ended;
  }

  finalTranscript(): TranscriptTurn[] {
    return this.transcript.finalTurns();
  }

  async connect(url: string, token: string): Promise<void> {
    if (this.ended || this.snapshot.connection !== "idle") return;
    this.bindRoomEvents();
    this.room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, this.handleTranscription);
    this.set({ connection: "connecting" });
    this.agentJoinTimer = setTimeout(() => {
      if (!this.snapshot.agentPresent) void this.end("connection_failure");
    }, this.options.agentJoinTimeoutMs ?? 30_000);

    try {
      await this.room.connect(url, token);
    } catch {
      await this.end("connection_failure");
      return;
    }
    if (this.ended) return;
    this.set({ connection: "connected", audioBlocked: !this.room.canPlaybackAudio });
    this.room.remoteParticipants.forEach(p => {
      if (p.isAgent) this.agentJoined(p);
      p.audioTrackPublications.forEach(pub => {
        if (pub.track) this.attachAudio(pub.track, pub);
      });
    });
    await this.setMicrophone(true);
  }

  toggleMicrophone = () => this.setMicrophone(!this.snapshot.micEnabled);

  async setMicrophone(enabled: boolean): Promise<void> {
    if (this.ended || this.snapshot.micPending || this.snapshot.connection === "idle") return;
    this.set({ micPending: true });
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      this.set({ micEnabled: enabled, micError: null });
    } catch (err) {
      this.set({ micEnabled: false, micError: err instanceof Error ? err.message || err.name : String(err) });
    } finally {
      this.set({ micPending: false });
      // A publish that completed after the session ended must not keep the mic open.
      if (this.ended) this.stopLocalTracks();
    }
  }

  startAudio = async () => {
    try {
      await this.room.startAudio();
    } finally {
      this.set({ audioBlocked: !this.room.canPlaybackAudio });
    }
  };

  /** Idempotent: only the first call does anything or fires `onEnded`. */
  async end(cause: VoiceEndCause): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.agentJoinTimer) clearTimeout(this.agentJoinTimer);
    this.offs.splice(0).forEach(off => off());
    try {
      this.room.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
    } catch {
      // never registered (ended before connect)
    }
    this.audioElements.forEach(elements => elements.forEach(el => el.remove()));
    this.audioElements.clear();
    this.stopLocalTracks();
    this.set({ connection: "ended", agentPresent: false, agentState: null, micEnabled: false, micPending: false });
    try {
      await this.room.disconnect(true);
    } catch {
      // already disconnected
    }
    this.options.onEnded(cause);
  }

  private stopLocalTracks() {
    this.room.localParticipant.trackPublications.forEach(pub => pub.track?.stop());
  }

  private agentJoined(participant: Participant) {
    const first = !this.snapshot.agentPresent;
    this.set({ agentPresent: true, agentState: agentStateOf(participant) });
    if (first) {
      if (this.agentJoinTimer) clearTimeout(this.agentJoinTimer);
      this.options.onAgentJoined();
    }
  }

  private attachAudio(track: RemoteTrack, publication: RemoteTrackPublication) {
    if (track.kind !== Track.Kind.Audio || this.audioElements.has(publication.trackSid)) return;
    const element = track.attach();
    this.options.getAudioContainer()?.appendChild(element);
    this.audioElements.set(publication.trackSid, [element]);
  }

  private bindRoomEvents() {
    const on = <E extends RoomEvent>(event: E, handler: (...args: never[]) => void) => {
      this.room.on(event, handler as never);
      this.offs.push(() => this.room.off(event, handler as never));
    };
    on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication) => this.attachAudio(track, pub));
    on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication) => {
      track.detach().forEach(el => el.remove());
      this.audioElements.delete(pub.trackSid);
    });
    on(RoomEvent.AudioPlaybackStatusChanged, () => this.set({ audioBlocked: !this.room.canPlaybackAudio }));
    on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      if (p.isAgent) this.agentJoined(p);
    });
    on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      if (p.isAgent) void this.end("agent_ended");
    });
    on(RoomEvent.ParticipantAttributesChanged, (_changed: Record<string, string>, p: Participant) => {
      if (p.isAgent) this.set({ agentState: agentStateOf(p) });
    });
    on(RoomEvent.Reconnecting, () => this.set({ connection: "reconnecting" }));
    on(RoomEvent.Reconnected, () => this.set({ connection: "connected" }));
    on(RoomEvent.MediaDevicesError, (err: Error) => this.set({ micError: err.message || err.name }));
    on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      // Room deleted/participant removed = ended server-side (admin force-end,
      // or the backend releasing a superseded session).
      const serverEnded = reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.PARTICIPANT_REMOVED;
      void this.end(serverEnded ? "agent_ended" : "connection_failure");
    });
  }

  private handleTranscription = async (reader: TextStreamReader, participantInfo: { identity: string }) => {
    if (this.ended) return;
    const attributes = reader.info.attributes ?? {};
    const segmentId = attributes["lk.segment_id"] ?? reader.info.id;
    const trackId = attributes["lk.transcribed_track_id"];
    const local = this.room.localParticipant;
    const isStudent = participantInfo.identity === local.identity || (trackId !== undefined && local.trackPublications.has(trackId));
    const speaker = isStudent ? "student" : "agent";
    const gen = this.transcript.open(segmentId, speaker);
    try {
      for await (const chunk of reader) {
        if (this.ended) return;
        if (this.transcript.append(segmentId, gen, chunk)) this.set({ segments: this.transcript.list() });
      }
    } catch {
      return; // stream aborted (e.g. disconnect) - keep what arrived, not final
    }
    // STT streams say whether they're final; an agent speech stream is
    // complete once it closes.
    const final = attributes["lk.transcription_final"] === "true" || speaker === "agent";
    if (this.transcript.close(segmentId, gen, final)) this.set({ segments: this.transcript.list() });
  };

  private set(patch: Partial<VoiceRoomSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
}

function agentStateOf(participant: Participant): VoiceAgentState | null {
  const state = participant.attributes?.["lk.agent.state"];
  return state === "initializing" || state === "idle" || state === "listening" || state === "thinking" || state === "speaking" ? state : null;
}
