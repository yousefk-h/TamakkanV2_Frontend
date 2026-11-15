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
  assert.match(player, /onlyExerciseIndices=\{\[active\.exercise_index\]\}/);
  assert.match(player, /lg:rounded-r-2xl/);
});

test("Interactive playback still resumes only after the saved attempt unlocks its checkpoint", () => {
  assert.match(player, /completed\(active, attempt\)/);
  assert.match(player, /videoRef\.current\?\.play/);
  assert.doesNotMatch(player, /topicsApi\.(?:record|submit|grade|progress)/i);
});
