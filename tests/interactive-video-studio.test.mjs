import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const studio = fs.readFileSync(new URL("../components/admin/topics/builder/InteractiveVideoTimelineEditor.tsx", import.meta.url), "utf8");
const builder = fs.readFileSync(new URL("../components/admin/topics/builder/ProgramBuilder.tsx", import.meta.url), "utf8");

test("interactive flow plans questions before opening Video Studio for editing", () => {
  assert.match(builder, /"Video Studio"/);
  assert.match(builder, /id: "studio"/);
  assert.match(builder, /id: "timeline"/);
  assert.match(builder, /currentStep === "studio"/);
  assert.match(builder, /currentStep === "review" && lessonFlow === "interactive_video"/);
  assert.match(builder, /handleVideoStudioContinue/);
  assert.ok(builder.indexOf('id: "timeline"') < builder.indexOf('id: "studio"'));
});

test("Video Studio uses the uploaded video, saved checkpoints, and reviewed transcript only", () => {
  assert.match(studio, /<video key=\{videoRetryKey\} ref=/);
  assert.match(studio, /updateInteractiveVideoTimeline/);
  assert.match(studio, /transcriptSegments\.map/);
  assert.match(studio, /Add checkpoint at/);
  assert.match(studio, /Transcript &amp; timestamps/);
  assert.doesNotMatch(studio, /suggestInteractiveVideo|Gemini|draftInteractive/i);
  assert.doesNotMatch(studio, /onOpenExercises/);
  assert.match(studio, /Create a compatible exercise above first/);
  assert.match(studio, /Number\.isFinite\(duration\)/);
  assert.match(studio, /Transcript timing:/);
  assert.match(studio, /max-w-full object-contain/);
});

test("Video Studio is authoring-only and never records learner activity", () => {
  assert.doesNotMatch(studio, /topicsApi\.(?:record|submit|grade|progress)/i);
  assert.doesNotMatch(studio, /Complete preview activity & resume/);
  assert.doesNotMatch(studio, /previewCheckpointId/);
});

test("the marker panel can switch a checkpoint's kind, and hides/shows the right fields", () => {
  assert.match(studio, /role="tablist" aria-label="Checkpoint activity"/);
  assert.match(studio, /change\(selected\.id, \{ kind: "exercise"/);
  assert.match(studio, /change\(selected\.id, \{ kind: "practice_with_mariam"/);
  assert.match(studio, /isPractice \? <>/);
  assert.match(studio, /Conversation goal/);
  assert.match(studio, /Opening line/);
  assert.match(studio, /Session length \(minutes\)/);
  assert.match(studio, /Required activity/);
});

test("Save is disabled, with an inline error, when a Practice with Mariam marker is missing its goal/opening line", () => {
  assert.match(studio, /function practiceInvalid/);
  assert.match(studio, /invalidPractice = items\.some\(practiceInvalid\)/);
  assert.match(studio, /disabled=\{saving \|\| !items\.length \|\| saved \|\| invalidPractice\}/);
});

test("convert-to-practice calls the dedicated endpoint and refreshes the checkpoint list from its response", () => {
  assert.match(studio, /Convert to Practice with Mariam…/);
  assert.match(studio, /topicsApi\.convertCheckpointToPractice\(topicId, convertingId, convertDraft\)/);
  assert.match(studio, /setItems\(updated\.interactive_video_checkpoints\)/);
});

test("the AI-suggested-draft review panel renders a distinct Practice with Mariam suggestion", () => {
  assert.match(builder, /checkpoint_kind === "practice_with_mariam"/);
  assert.match(builder, /Practice with Mariam<\/span>/);
  assert.match(builder, /suggestion\.conversation_goal/);
  assert.match(builder, /suggestion\.opening_line/);
  assert.match(builder, /suggestion\.session_duration_minutes/);
});
