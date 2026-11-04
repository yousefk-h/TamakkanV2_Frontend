import type { TranscriptSegment, TranscriptSpeaker } from "./transcript";

/** Presentation-only selectors for Voice Practice's focused call UI. Pure: no React, no room access.
 *
 * Input is exactly what the collector already produces (`snapshot.segments`: the browser's `lk.transcription`
 * segments in first-seen order, interim ones flagged `final: false`). Nothing here creates, edits or stores
 * transcript data - `browser_transcript` stays provisional and is never read from here. */

export const RECENT_TURNS = 2;

export interface RecentTurn {
  /** Id of the last segment in the turn (stable React key). */
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
}

export interface CaptionView {
  /** The latest utterance (what is being said right now, or was said last). Null before anyone has spoken. */
  current: TranscriptSegment | null;
  /** Up to `RECENT_TURNS` turns before the current line, oldest first. Never contains the current line. */
  recent: RecentTurn[];
}

/** A turn = consecutive segments by the same speaker (an STT engine may split one answer into several segments). */
function groupTurns(segments: readonly TranscriptSegment[]): RecentTurn[] {
  const turns: RecentTurn[] = [];
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.speaker === segment.speaker) {
      last.text = `${last.text} ${text}`;
      last.id = segment.id;
    } else {
      turns.push({ id: segment.id, speaker: segment.speaker, text });
    }
  }
  return turns;
}

export function selectCaptionView(segments: readonly TranscriptSegment[]): CaptionView {
  const visible = segments.filter(segment => segment.text.trim());
  if (visible.length === 0) return { current: null, recent: [] };
  const current = visible[visible.length - 1];
  return { current, recent: groupTurns(visible.slice(0, -1)).slice(-RECENT_TURNS) };
}
