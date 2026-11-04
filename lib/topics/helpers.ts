import type { Level, TopicListItem, TranscriptState } from "../api/types";

export const LEVEL_ORDER: Level[] = ["beginner", "intermediate", "advanced"];

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// Pure decoration - not real per-topic data (there is none), just visual
// variety tied to level so a topic grid doesn't render as a wall of identical cards.
export const LEVEL_EMOJI: Record<Level, string> = {
  beginner: "🌱",
  intermediate: "🌅",
  advanced: "🚀",
};

export const TRANSCRIPT_STATE_LABEL: Record<TranscriptState, string> = {
  queued: "Queued",
  extracting: "Extracting transcript",
  pending_review: "Pending review",
  approved_for_ai: "Approved",
};

export function groupTopicsByLevel(topics: TopicListItem[]): Partial<Record<Level, TopicListItem[]>> {
  const grouped: Partial<Record<Level, TopicListItem[]>> = {};
  for (const topic of topics) {
    (grouped[topic.level] ??= []).push(topic);
  }
  return grouped;
}
