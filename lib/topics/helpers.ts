import type { Level, LessonExercise, TopicListItem, TranscriptState } from "../api/types";

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

/** An exercise coming from outside the builder (a loaded topic, an AI
 * suggestion, a pending lesson-draft) may legitimately predate one of the
 * list fields added over time (`pairs`/`ordering_words`/`accepted_answers`/
 * `dialogue_turns`) - a legacy document, a partially drafted suggestion, or
 * a provider response that only filled the fields relevant to its own kind.
 * Backfilling here, once, at the boundary where external data enters a
 * builder component, is the actual data-contract fix: every exercise a
 * component then renders is guaranteed to have real arrays, so kind-
 * specific render blocks don't need defensive optional chaining scattered
 * through them to stay crash-safe. */
export function withExerciseDefaults(exercise: LessonExercise): LessonExercise {
  return {
    ...exercise,
    options: exercise.options ?? [],
    pairs: exercise.pairs ?? [],
    ordering_words: exercise.ordering_words ?? [],
    accepted_answers: exercise.accepted_answers ?? [],
    dialogue_turns: (exercise.dialogue_turns ?? []).map(turn => ({ ...turn, accepted_answers: turn.accepted_answers ?? [] })),
  };
}
