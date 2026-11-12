import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const studio = fs.readFileSync(new URL("../components/admin/topics/builder/InteractiveVideoTimelineEditor.tsx", import.meta.url), "utf8");
const builder = fs.readFileSync(new URL("../components/admin/topics/builder/ProgramBuilder.tsx", import.meta.url), "utf8");

test("interactive flow uses Video Studio before its dedicated disabled timeline and review", () => {
  assert.match(builder, /"Video Studio"/);
  assert.match(builder, /id: "studio"/);
  assert.match(builder, /id: "timeline"/);
  assert.match(builder, /currentStep === "studio"/);
  assert.match(builder, /currentStep === "review" && lessonFlow === "interactive_video"/);
  assert.match(builder, /handleVideoStudioContinue/);
});

test("Video Studio uses the uploaded video, saved checkpoints, and reviewed transcript only", () => {
  assert.match(studio, /<video ref=/);
  assert.match(studio, /updateInteractiveVideoTimeline/);
  assert.match(studio, /transcriptSegments\.map/);
  assert.match(studio, /Add checkpoint at/);
  assert.match(studio, /Complete preview activity & resume/);
  assert.doesNotMatch(studio, /suggestInteractiveVideo|Gemini|draftInteractive/i);
  assert.doesNotMatch(studio, /onOpenExercises/);
  assert.match(studio, /Create a compatible exercise above first/);
});

test("Video Studio preview is local and never records learner activity", () => {
  assert.doesNotMatch(studio, /topicsApi\.(?:record|submit|grade|progress)/i);
  assert.match(studio, /no progress is saved/);
});
