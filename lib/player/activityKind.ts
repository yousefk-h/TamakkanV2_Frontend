import type { MessageKey } from "@/lib/i18n/LocaleProvider";

/** Maps an internal exercise/checkpoint `kind` string to the translated, student-facing label to show instead of
 * it - never interpolate a raw `kind` (e.g. "word_order", "practice_with_mariam") directly into JSX text. Centralized
 * here so `LessonExercises.tsx` (the per-exercise badge) and `InteractiveVideoLesson.tsx` (the progress indicator /
 * checkpoint heading) always agree on the same wording for the same kind. */
const ACTIVITY_KIND_KEYS: Record<string, MessageKey> = {
  video: "player.activityTypeVideo",
  vocab: "player.activityTypeVocab",
  image_completion: "player.activityTypeImageCompletion",
  listening: "player.activityTypeListening",
  grammar: "player.activityTypeGrammar",
  reading: "player.activityTypeReading",
  series: "player.activityTypeSeries",
  multiple_choice: "player.activityTypeMultipleChoice",
  game: "player.activityTypeGame",
  word_order: "player.activityTypeWordOrder",
  error_correction: "player.activityTypeErrorCorrection",
  dialogue_completion: "player.activityTypeDialogueCompletion",
  writing: "player.activityTypeWriting",
  reflection: "player.activityTypeReflection",
  speaking: "player.activityTypeSpeaking",
  practice_with_mariam: "player.activityTypeMariam",
};

export function activityKindLabel(kind: string, t: (key: MessageKey) => string): string {
  const key = ACTIVITY_KIND_KEYS[kind];
  return t(key ?? "player.activityTypeGeneric");
}
