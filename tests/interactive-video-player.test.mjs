import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const player = fs.readFileSync(new URL("../components/student/player/InteractiveVideoLesson.tsx", import.meta.url), "utf8");

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
