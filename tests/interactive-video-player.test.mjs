import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const player = fs.readFileSync(new URL("../components/student/player/InteractiveVideoLesson.tsx", import.meta.url), "utf8");

test("Interactive Video fullscreen is a single CSS-only control, not the real Fullscreen API - avoids the duplicate-fullscreen-button problem on Safari/iOS where a real requestFullscreen on a non-video element doesn't work", () => {
  assert.doesNotMatch(player, /stageRef\.current\?\.requestFullscreen/);
  assert.doesNotMatch(player, /document\.exitFullscreen/);
  assert.match(player, /setLessonFullscreen\(v => !v\)/);
  assert.match(player, /Full lesson screen/);
  assert.match(player, /Exit full lesson screen/);
  // Escape still exits, even without the real Fullscreen API's native Escape handling.
  assert.match(player, /event\.key === "Escape"/);
  // Still only one visible custom control, and the native video fullscreen button is suppressed where the
  // browser honors it (a documented Safari/iOS limitation where it does not).
  assert.match(player, /controlsList="nofullscreen"/);
});

test("the paused activity is a bottom-up popup that covers the video/stage area on every breakpoint - never a permanently reserved side column, and never a separate page", () => {
  assert.match(player, /Complete this activity to continue/);
  assert.match(player, /onlyExerciseIndices=\{\[active\.exercise_index!\]\}/);
  assert.doesNotMatch(player, /pr-\[380px\]/);
  assert.doesNotMatch(player, /sm:absolute sm:inset-x-auto sm:left-auto sm:top-3 sm:bottom-auto sm:right-3/);
  // Same `fixed inset-x-0 bottom-0` container on every breakpoint - no `sm:`-gated alternate (docked) position.
  assert.match(player, /fixed inset-x-0 bottom-0 z-40/);
  // A real backdrop over the video now (it's meant to cover/become the primary surface), with an entrance
  // transition driven by `popupEntered`, not a one-shot transparent tap-layer.
  assert.match(player, /bg-black\/50 backdrop-blur/);
  assert.match(player, /popupEntered/);
  assert.match(player, /transition-transform duration-300/);
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
  assert.match(player, /closeActivityPopup/);
});

test("closing/minimizing the popup never marks a checkpoint complete - it only hides it, same completion data path as before", () => {
  assert.match(player, /const closeActivityPopup = useCallback\(\(\) => \{/);
  assert.match(player, /setPracticeIssue\(null\);\s*\n\s*setActiveCheckpointId\(null\);/);
  assert.doesNotMatch(player, /setActiveCheckpointId\(null\).*(sessionStatus|attempts).*=.*true/s);
});

test("a lesson-specific conversation goal is threaded into the Mariam overlay for a checkpoint, not shown generically", () => {
  assert.match(player, /conversationGoal=\{active\.conversation_goal\}/);
  assert.match(player, /learningObjective=\{active\.learning_objective\}/);
});
