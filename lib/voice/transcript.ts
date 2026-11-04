/** Voice Practice live transcript, built from LiveKit's `lk.transcription`
 * text streams. Kept free of imports so it can be unit-tested directly.
 *
 * How the streams arrive (LiveKit Agents): each utterance has an
 * `lk.segment_id`. The student's speech (STT) comes as several short streams
 * per segment - interim hypotheses (`lk.transcription_final: "false"`), each
 * carrying the whole hypothesis, then one final stream. The agent's speech
 * comes as one stream per segment whose chunks are deltas. So: the newest
 * stream for a segment replaces its text, chunks within a stream append, and
 * a segment is final when its stream says so (or, for the agent, when its
 * stream closes). Late interim streams never downgrade a final segment.
 *
 * Whatever this produces is what the student's browser saw - the backend
 * stores it as UNVERIFIED and never scores it. */

export type TranscriptSpeaker = "student" | "agent";

export interface TranscriptSegment {
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
  final: boolean;
  /** When this segment was first seen (ms since epoch) - the display order. */
  firstSeen: number;
}

export interface TranscriptTurn {
  speaker: TranscriptSpeaker;
  text: string;
  timestamp: string;
}

// Must match the backend's `BrowserTranscriptTurn`/`VoiceSessionEndRequest` limits.
export const MAX_TURN_TEXT = 1000;
export const MAX_TURNS = 600;

export class TranscriptCollector {
  private segments = new Map<string, TranscriptSegment>();
  private generation = new Map<string, number>();

  /** A new stream for `id` opened. Returns a token for `append`/`close`. */
  open(id: string, speaker: TranscriptSpeaker, now: number = Date.now()): number {
    const gen = (this.generation.get(id) ?? 0) + 1;
    this.generation.set(id, gen);
    const existing = this.segments.get(id);
    if (!existing) {
      this.segments.set(id, { id, speaker, text: "", final: false, firstSeen: now });
    } else if (!existing.final) {
      this.segments.set(id, { ...existing, text: "" });
    }
    return gen;
  }

  append(id: string, gen: number, chunk: string): boolean {
    const segment = this.segments.get(id);
    if (!segment || segment.final || this.generation.get(id) !== gen) return false;
    this.segments.set(id, { ...segment, text: segment.text + chunk });
    return true;
  }

  close(id: string, gen: number, final: boolean): boolean {
    const segment = this.segments.get(id);
    if (!segment || segment.final || this.generation.get(id) !== gen || !final) return false;
    this.segments.set(id, { ...segment, final: true });
    return true;
  }

  list(): TranscriptSegment[] {
    return [...this.segments.values()].filter(s => s.text.trim()).sort((a, b) => a.firstSeen - b.firstSeen);
  }

  /** Final segments only, deduplicated by segment id, in order, split/capped
   * to the backend's limits so a long monologue can never make the end call
   * fail validation. */
  finalTurns(): TranscriptTurn[] {
    const turns: TranscriptTurn[] = [];
    for (const segment of this.list()) {
      if (!segment.final) continue;
      const text = segment.text.trim();
      const timestamp = new Date(segment.firstSeen).toISOString();
      for (let i = 0; i < text.length; i += MAX_TURN_TEXT) {
        const part = text.slice(i, i + MAX_TURN_TEXT).trim();
        if (part) turns.push({ speaker: segment.speaker, text: part, timestamp });
      }
    }
    return turns.slice(0, MAX_TURNS);
  }
}
