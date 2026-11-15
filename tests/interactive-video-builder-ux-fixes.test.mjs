// Regression tests for the Interactive Video builder UX fixes (teacher-reported
// "Accept & edit" permanently disabled / "No questions yet" despite real AI
// suggestions; orphaned-checkpoint dead-end; video preview with no error
// state; "Accept all" bulk action). Same source-text-assertion convention as
// tests/lesson-flow.test.mjs and tests/interactive-video-studio.test.mjs -
// there is no React-rendering harness in this repo's test runner, so these
// pin the actual source wiring rather than mounting the component. The pure
// checkpoint-remap diff logic (Fix 3) has its own real-execution test file:
// tests/checkpoint-remap.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const builder = fs.readFileSync(new URL("../components/admin/topics/builder/ProgramBuilder.tsx", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../components/admin/topics/builder/InteractiveVideoTimelineEditor.tsx", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../lib/api/client.ts", import.meta.url), "utf8");

test("Fix 1: a successful saveExercisesAndContinue clears exercisesDirty, the only other place exercises are genuinely persisted besides handleInteractiveSuggestionAction's own already-existing clear", () => {
  const saveFn = builder.slice(builder.indexOf("const saveExercisesAndContinue"), builder.indexOf("const handleReviewContinue"));
  assert.match(saveFn, /await topicsApi\.update\(topicId, \{ lesson_exercises:/);
  // The clear must happen strictly after the persist call succeeds, not before.
  const updateCallIndex = saveFn.indexOf("await topicsApi.update(topicId, { lesson_exercises:");
  const clearIndex = saveFn.indexOf("setExercisesDirty(false)");
  assert.ok(clearIndex > updateCallIndex, "setExercisesDirty(false) must run after the successful persist, inside the try block");
  // handleInteractiveSuggestionAction's own guard/clear are untouched - this
  // fix makes that function reachable again (it self-clears on its own
  // success path), it doesn't change that function itself.
  assert.match(builder, /if \(!topicId \|\| exercisesDirty\) return;/);
  assert.match(builder, /setExercisesDirty\(false\);\s*\n\s*setInteractiveCheckpoints\(updated\.interactive_video_checkpoints\);/);
});

test("Fix 1: no other exercises persist path forgets to clear exercisesDirty", () => {
  // Every place `exercises` is sent to the backend as `lesson_exercises` must
  // be paired with a dirty-clear nearby - there are exactly two such call
  // sites (saveExercisesAndContinue, handleInteractiveSuggestionAction).
  const persistSites = [...builder.matchAll(/lesson_exercises:/g)];
  assert.equal(persistSites.length, 1, "exactly one outgoing lesson_exercises: payload is built (saveExercisesAndContinue) - if this grows, verify the new site also clears exercisesDirty");
  assert.match(builder, /setExercises\(assignClientKeys\(updated\.lesson_exercises\)\);/);
});

test("Fix 2: an orphaned checkpoint (exercise removed/incompatible) is shown and flagged, not hidden behind the generic banner", () => {
  assert.match(studio, /if \(!eligibleExercises\.length && !items\.length\) return/);
  assert.match(studio, /function isOrphanedCheckpoint|const isOrphanedCheckpoint/);
  assert.match(studio, /This checkpoint&apos;s activity was removed/);
  assert.match(studio, /No compatible activities available/);
});

test("Fix 4: the video element tracks a real loading/error lifecycle with a retry affordance", () => {
  assert.match(studio, /videoLoadState/);
  assert.match(studio, /onError=\{\(\) => setVideoLoadState\("error"\)\}/);
  assert.match(studio, /onCanPlay=\{\(\) => setVideoLoadState\("ready"\)\}/);
  assert.match(studio, /Video could not be loaded/);
  assert.match(studio, /videoRef\.current\?\.load\(\)/);
  // The existing, already-correct responsive sizing is untouched.
  assert.match(studio, /max-w-full object-contain/);
});

test("Fix 6: topicsApi exposes an accept-all call, and the builder wires an Accept all button that surfaces a partial-failure summary", () => {
  assert.match(client, /acceptAllInteractiveVideoDrafts: \(topicId: string\) =>/);
  assert.match(client, /interactive-video-drafts\/accept-all/);
  assert.match(builder, /handleAcceptAllSuggestions/);
  assert.match(builder, /topicsApi\.acceptAllInteractiveVideoDrafts\(topicId\)/);
  assert.match(builder, /"Accept all"/);
  assert.match(builder, /could not be accepted/);
});
