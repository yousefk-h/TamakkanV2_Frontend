import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const player = fs.readFileSync(new URL("../components/student/player/InteractiveVideoLesson.tsx", import.meta.url), "utf8");

test("Interactive Video fullscreen belongs to the lesson shell, not only the native video", () => {
  assert.match(player, /stageRef\.current\?\.requestFullscreen/);
  assert.match(player, /document\.fullscreenElement === stageRef\.current/);
  assert.match(player, /Full lesson screen/);
  assert.match(player, /Exit full lesson screen/);
});

test("the paused activity is a floating popup (docked on desktop, a bottom sheet on mobile), never a permanently reserved column or a dark full-screen backdrop", () => {
  assert.match(player, /controlsList="nofullscreen"/);
  assert.match(player, /Complete this activity to continue/);
  assert.match(player, /onlyExerciseIndices=\{\[active\.exercise_index!\]\}/);
  // Reserved only while `active`, never unconditionally - no permanent column.
  assert.match(player, /\$\{active \? "sm:pr-\[380px\]" : ""\}/);
  assert.match(player, /sm:absolute sm:inset-x-auto sm:left-auto sm:top-3 sm:bottom-auto sm:right-3/);
  assert.match(player, /fixed inset-x-0 bottom-0 z-40/);
  // The mobile tap-outside-to-dismiss layer is explicitly transparent, not a dark overlay.
  assert.match(player, /bg-transparent sm:hidden/);
  assert.doesNotMatch(player, /bg-black\/[5-9]\d|bg-slate-950\/[5-9]\d/);
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
