import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const player = fs.readFileSync(new URL("../components/student/player/InteractiveVideoLesson.tsx", import.meta.url), "utf8");
const lessonExercises = fs.readFileSync(new URL("../components/student/player/LessonExercises.tsx", import.meta.url), "utf8");
const activityKind = fs.readFileSync(new URL("../lib/player/activityKind.ts", import.meta.url), "utf8");

test("Interactive Video fullscreen belongs to the lesson shell, not only the native video", () => {
  assert.match(player, /stageRef\.current\?\.requestFullscreen/);
  assert.match(player, /document\.fullscreenElement === stageRef\.current/);
  assert.match(player, /Full lesson screen/);
  assert.match(player, /Exit full lesson screen/);
  assert.match(player, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(340px,1fr\)\]/);
});

test("A paused question stays beside the fullscreen video and native video fullscreen is suppressed", () => {
  assert.match(player, /controlsList="nofullscreen"/);
  assert.match(player, /Video paused · complete this activity to continue/);
  assert.match(player, /onlyExerciseIndices=\{\[active\.exercise_index!\]\}/);
  assert.match(player, /lg:rounded-r-2xl/);
});

test("Interactive playback still resumes only after the saved attempt unlocks its checkpoint", () => {
  assert.match(player, /completed\(active, attempt, undefined\)/);
  assert.match(player, /videoRef\.current\?\.play/);
  assert.doesNotMatch(player, /topicsApi\.(?:record|submit|grade|progress)/i);
});

test("a Practice with Mariam checkpoint renders CheckpointMariamSession; an exercise checkpoint renders LessonExercises unchanged", () => {
  assert.match(player, /import \{ CheckpointMariamSession \} from "\.\/CheckpointMariamSession"/);
  assert.match(player, /checkpointKind\(active\) === "practice_with_mariam"/);
  assert.match(player, /<CheckpointMariamSession/);
  assert.match(player, /checkpointId=\{active\.id\}/);
  assert.match(player, /onlyExerciseIndices=\{\[active\.exercise_index!\]\}/);
});

test("Practice with Mariam completion is driven by cached session status, not exercise attempts, and gates seeking/enforcement the same way an exercise checkpoint does", () => {
  assert.match(player, /function completed\(checkpoint: InteractiveVideoCheckpoint, attempt: ExerciseAttemptPublic \| undefined, sessionCompleted: boolean \| undefined\)/);
  assert.match(player, /if \(checkpointKind\(checkpoint\) === "practice_with_mariam"\) return sessionCompleted === true;/);
  assert.match(player, /topicsApi\.getCheckpointSessionStatus\(topic\.id, item\.id\)/);
  assert.match(player, /nextRequired = useCallback\(\(at: number\) => checkpoints\.find\(item => item\.timestamp_seconds <= at \+ 0\.15 && !completed\(item, attempts\[item\.exercise_index \?\? -1\], sessionStatus\[item\.id\]\)\)/);
  assert.match(player, /blocking = checkpoints\.find\(item => !completed\(item, attempts\[item\.exercise_index \?\? -1\], sessionStatus\[item\.id\]\)\)/);
});

test("a failed or incomplete practice session offers Retry/Exit instead of silently resuming, and never optimistically assumes completion", () => {
  assert.match(player, /handlePracticeEnded/);
  assert.match(player, /topicsApi\.getCheckpointSessionStatus\(topic\.id, checkpoint\.id\)/);
  assert.match(player, /isCompleted = reason !== "error"/);
  assert.match(player, /Retry/);
  assert.match(player, /Exit for now/);
  assert.match(player, /exitPractice/);
});

test("the active checkpoint panel renders an 'Activity X of Y' progress indicator computed from the already-sorted checkpoints array", () => {
  assert.match(player, /const activeIndex = active \? checkpoints\.findIndex\(item => item\.id === active\.id\) : -1;/);
  assert.match(player, /t\("player\.exerciseProgress", \{ current: activeIndex \+ 1, total: checkpoints\.length \}\)/);
});

test("the iOS Safari pseudo-fullscreen fallback exists and is gated on real Fullscreen API support, not just always-on", () => {
  assert.match(player, /const \[pseudoFullscreen, setPseudoFullscreen\] = useState\(false\);/);
  assert.match(player, /document\.fullscreenEnabled && typeof stageRef\.current\?\.requestFullscreen === "function"/);
  assert.match(player, /enterPseudoFullscreen/);
  assert.match(player, /exitPseudoFullscreen/);
  // Still the same button/state the existing tests above assert on - the fallback augments it, it doesn't replace it.
  assert.match(player, /Full lesson screen/);
  assert.match(player, /Exit full lesson screen/);
  // The pseudo-fullscreen overlay is CSS-only (fixed + inset-0), not a second copy of the real Fullscreen API call.
  assert.match(player, /fixed inset-0 z-50/);
});

test("no raw internal exercise_index/completion_rule/checkpoint kind string is interpolated directly into student-facing JSX text", () => {
  // `exercise_index`/`completion_rule`/`.kind` appear throughout this file in comparisons, lookups and comments
  // (all fine) - what must never appear is one spliced directly into rendered text, e.g. `{active.kind}` or
  // `{checkpoint.completion_rule}` or `{active.exercise_index}` standing alone as display copy.
  for (const file of [player, lessonExercises]) {
    assert.doesNotMatch(file, /\{(?:active|checkpoint|item)\.completion_rule\}/);
    assert.doesNotMatch(file, /\{(?:active|checkpoint|item)\.kind\}/);
    assert.doesNotMatch(file, /\{(?:active|checkpoint|item)\.exercise_index\}/);
    assert.doesNotMatch(file, /\{exercise\.kind\}/);
    assert.doesNotMatch(file, /exercise\.kind\.replaceAll/);
  }
  // Instead, both render through the shared, translated label helper.
  assert.match(player, /activityKindLabel\(checkpointKind\(active\), t\)/);
  assert.match(lessonExercises, /activityKindLabel\(exercise\.kind, t\)/);
  assert.match(activityKind, /practice_with_mariam: "player\.activityTypeMariam"/);
});
