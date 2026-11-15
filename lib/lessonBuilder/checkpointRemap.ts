import type { InteractiveVideoCheckpoint, LessonExercise } from "../api/types";

/**
 * `LessonExercise` has no persisted id (the rest of the codebase already
 * addresses an exercise by plain array index - see Slice C's own documented
 * limitation). `InteractiveVideoCheckpoint.exercise_index` is a raw index into
 * that same array, so deleting or reordering an exercise elsewhere
 * (`Step4ExercisesSchedule.tsx`'s delete/palette-insert, or
 * `lib/lessonBuilder/order.ts`'s drag-reorder - neither has any awareness of
 * checkpoints) can silently repoint an existing checkpoint at the wrong
 * exercise, or leave it pointing out of range.
 *
 * `_clientKey` is a synthetic, client-only, never-persisted tracking key
 * stamped onto an exercise object the first time it is seen locally. It
 * survives every existing in-place edit in this builder because each one
 * copies the exercise with an object spread (`{ ...exercise, ...changes }` /
 * `withExerciseDefaults`), which carries an arbitrary extra property forward
 * untouched - so a plain field edit (e.g. typing in a prompt) is never
 * mistaken for a remove-and-re-add. `stripClientKey` must be applied before
 * any exercise reaches the backend.
 */
export type TrackedExercise = LessonExercise & { _clientKey?: string };

export function makeClientKey(): string {
  return `ck_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export function assignClientKeys(list: LessonExercise[]): TrackedExercise[] {
  return list.map(item => {
    const tracked = item as TrackedExercise;
    return tracked._clientKey ? tracked : { ...tracked, _clientKey: makeClientKey() };
  });
}

export function stripClientKey(exercise: TrackedExercise): LessonExercise {
  const { _clientKey, ...rest } = exercise;
  void _clientKey;
  return rest;
}

export interface CheckpointRemapResult {
  checkpoints: InteractiveVideoCheckpoint[];
  /** True when at least one checkpoint's exercise_index was updated or the
   * checkpoint itself was dropped - i.e. the caller has something to persist
   * and/or warn about. False (checkpoints returned unchanged) when the
   * exercise array edit didn't touch any referenced position. */
  changed: boolean;
  /** Timestamps (seconds) of checkpoints dropped because their exercise was
   * removed entirely - never silent, always meant to be surfaced to the
   * teacher. */
  droppedTimestamps: number[];
}

/**
 * Diffs `oldExercises` against `nextExercises` by each exercise's stable
 * `_clientKey` (assigned via `assignClientKeys` - call it on both arrays
 * before diffing, or pass already-keyed arrays), then remaps or drops each
 * "exercise"-kind checkpoint's `exercise_index` accordingly. A
 * "practice_with_mariam" checkpoint has no `exercise_index` and is always
 * passed through untouched. A checkpoint whose `exercise_index` was already
 * out of range against `oldExercises` (a pre-existing orphan unrelated to
 * this edit) is left as-is here - the Video Studio UI flags that case
 * separately - rather than also being dropped by this pass.
 */
export function remapCheckpointsForExercises(
  oldExercises: TrackedExercise[],
  nextExercises: TrackedExercise[],
  checkpoints: InteractiveVideoCheckpoint[],
): CheckpointRemapResult {
  const oldKeyAtIndex = oldExercises.map(item => item._clientKey);
  const newIndexForKey = new Map<string, number>();
  nextExercises.forEach((item, i) => { if (item._clientKey) newIndexForKey.set(item._clientKey, i); });

  let changed = false;
  const droppedTimestamps: number[] = [];
  const remapped = checkpoints.reduce<InteractiveVideoCheckpoint[]>((acc, checkpoint) => {
    if ((checkpoint.kind ?? "exercise") !== "exercise" || checkpoint.exercise_index === undefined) {
      acc.push(checkpoint);
      return acc;
    }
    const oldKey = oldKeyAtIndex[checkpoint.exercise_index];
    if (oldKey === undefined) {
      acc.push(checkpoint);
      return acc;
    }
    const newIndex = newIndexForKey.get(oldKey);
    if (newIndex === undefined) {
      changed = true;
      droppedTimestamps.push(checkpoint.timestamp_seconds);
      return acc;
    }
    if (newIndex !== checkpoint.exercise_index) {
      changed = true;
      acc.push({ ...checkpoint, exercise_index: newIndex });
      return acc;
    }
    acc.push(checkpoint);
    return acc;
  }, []);

  return { checkpoints: remapped, changed, droppedTimestamps };
}
