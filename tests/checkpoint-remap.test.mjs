// Fix 3 regression: InteractiveVideoCheckpoint.exercise_index is a raw array
// index into lesson_exercises, but nothing previously shifted it when an
// exercise was deleted or reordered (Step4ExercisesSchedule.tsx's delete/
// palette-insert, lib/lessonBuilder/order.ts's drag-reorder - neither is
// checkpoint-aware). This exercises the real diff/remap logic
// (lib/lessonBuilder/checkpointRemap.ts) that ProgramBuilder.tsx now runs at
// its single point where the exercises array actually changes.
import assert from "node:assert/strict";
import { test } from "node:test";

const { assignClientKeys, stripClientKey, remapCheckpointsForExercises } =
  await import(new URL("../lib/lessonBuilder/checkpointRemap.ts", import.meta.url).href);

function exercise(prompt) {
  return {
    kind: "multiple_choice", prompt, options: ["a", "b"], correct_option: 0,
    explanation: "", content: "", arabic_note: "", media_url: "", audio_url: "",
    pairs: [], ordering_words: [], accepted_answers: [], dialogue_turns: [],
    min_words: 0, allow_resubmit: true, deadline_at: null,
  };
}

function cp(id, timestamp, exerciseIndex) {
  return { id, timestamp_seconds: timestamp, kind: "exercise", exercise_index: exerciseIndex, completion_rule: "submitted" };
}

test("deleting an exercise drops the checkpoint that pointed at it, and shifts the ones after it", () => {
  const original = assignClientKeys([exercise("A"), exercise("B"), exercise("C")]);
  const checkpoints = [cp("1", 5, 0), cp("2", 10, 1), cp("3", 15, 2)];

  // Delete index 1 ("B").
  const next = [original[0], original[2]];
  const result = remapCheckpointsForExercises(original, next, checkpoints);

  assert.equal(result.changed, true);
  assert.deepEqual(result.droppedTimestamps, [10]);
  // Checkpoint "1" (pointed at A, still index 0) is unchanged.
  assert.ok(result.checkpoints.some(item => item.id === "1" && item.exercise_index === 0));
  // Checkpoint "2" (pointed at the deleted B) is gone.
  assert.ok(!result.checkpoints.some(item => item.id === "2"));
  // Checkpoint "3" (pointed at C, now at index 1) is remapped, not dropped.
  const remappedThree = result.checkpoints.find(item => item.id === "3");
  assert.ok(remappedThree);
  assert.equal(remappedThree.exercise_index, 1);
});

test("reordering exercises remaps every checkpoint's exercise_index to follow its own exercise, not the position", () => {
  const original = assignClientKeys([exercise("A"), exercise("B"), exercise("C")]);
  const checkpoints = [cp("1", 5, 0), cp("2", 10, 1), cp("3", 15, 2)];

  // Move "A" (index 0) to the end: [B, C, A].
  const next = [original[1], original[2], original[0]];
  const result = remapCheckpointsForExercises(original, next, checkpoints);

  assert.equal(result.changed, true);
  assert.equal(result.droppedTimestamps.length, 0);
  assert.equal(result.checkpoints.find(item => item.id === "1").exercise_index, 2); // A now at 2
  assert.equal(result.checkpoints.find(item => item.id === "2").exercise_index, 0); // B now at 0
  assert.equal(result.checkpoints.find(item => item.id === "3").exercise_index, 1); // C now at 1
});

test("a plain field edit (e.g. typing in a prompt) is never mistaken for a remove-and-re-add", () => {
  const original = assignClientKeys([exercise("A"), exercise("B")]);
  const checkpoints = [cp("1", 5, 0), cp("2", 10, 1)];

  // Edit exercise 0's prompt - this creates a NEW object (spread), but it
  // must carry the same _clientKey forward, exactly like ProgramBuilder's own
  // onExercisesChange callers do via `{ ...exercise, ...changes }`.
  const edited = { ...original[0], prompt: "A, edited" };
  const next = [edited, original[1]];
  const result = remapCheckpointsForExercises(original, next, checkpoints);

  assert.equal(result.changed, false);
  assert.equal(result.droppedTimestamps.length, 0);
  assert.deepEqual(result.checkpoints, checkpoints);
});

test("a practice_with_mariam checkpoint (no exercise_index) is always passed through untouched", () => {
  const original = assignClientKeys([exercise("A"), exercise("B")]);
  const practiceCheckpoint = { id: "p1", timestamp_seconds: 20, kind: "practice_with_mariam", completion_rule: "submitted", conversation_goal: "goal", opening_line: "hi" };
  const checkpoints = [cp("1", 5, 0), practiceCheckpoint];

  const next = [original[1]]; // delete "A"
  const result = remapCheckpointsForExercises(original, next, checkpoints);

  assert.equal(result.changed, true);
  assert.deepEqual(result.droppedTimestamps, [5]);
  assert.ok(result.checkpoints.some(item => item.id === "p1"));
  assert.deepEqual(result.checkpoints.find(item => item.id === "p1"), practiceCheckpoint);
});

test("a checkpoint already out of range before this edit is left alone, not also dropped", () => {
  const original = assignClientKeys([exercise("A")]);
  const checkpoints = [cp("1", 5, 3)]; // already stale/out of range
  const next = [original[0], exercise("B")];
  const result = remapCheckpointsForExercises(original, next, checkpoints);

  assert.equal(result.changed, false);
  assert.deepEqual(result.checkpoints, checkpoints);
});

test("_clientKey is stripped before an exercise would reach the backend", () => {
  const keyed = assignClientKeys([exercise("A")])[0];
  assert.ok(keyed._clientKey);
  const stripped = stripClientKey(keyed);
  assert.equal(stripped._clientKey, undefined);
  assert.equal(stripped.prompt, "A");
});
