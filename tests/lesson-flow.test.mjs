import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const builder = fs.readFileSync(new URL("../components/admin/topics/builder/ProgramBuilder.tsx", import.meta.url), "utf8");
const flowStep = fs.readFileSync(new URL("../components/admin/topics/builder/Step4LessonFlow.tsx", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../components/admin/topics/builder/InteractiveVideoTimelineEditor.tsx", import.meta.url), "utf8");

test("lesson flow is an explicit persisted builder step", () => {
  assert.match(builder, /Step4LessonFlow/);
  assert.match(builder, /lesson_flow:\s*lessonFlow/);
  assert.match(builder, /setStep\(5\)/);
  assert.match(flowStep, /interactive_video/);
  assert.match(flowStep, /flowUploadedOnly/);
  assert.match(builder, /InteractiveVideoTimelineEditor/);
});

test("Standard and Interactive paths use separate step definitions after flow selection", () => {
  assert.match(builder, /id: "avatar"/);
  assert.match(builder, /id: "exercises"/);
  assert.match(builder, /id: "studio"/);
  assert.match(builder, /id: "timeline"/);
  assert.match(builder, /currentStep === "avatar"/);
  assert.match(builder, /currentStep === "studio"/);
  assert.match(builder, /currentStep === "timeline"/);
  assert.match(builder, /Suggest questions from this video/);
  assert.match(builder, /Accept & edit/);
  assert.ok(builder.indexOf('id: "timeline"') < builder.indexOf('id: "studio"'));
});

test("Interactive authoring keeps activities and AI proposals in the dedicated video workflow", () => {
  // Video Studio now owns its own question list/editor internally (one
  // workspace instead of two stacked panels) - the wiring moved from
  // ProgramBuilder.tsx into InteractiveVideoTimelineEditor.tsx, reusing the
  // same `interactiveVideo compact` form, not a new one.
  assert.match(studio, /interactiveVideo compact hideOwnList/);
  assert.match(builder, /Review questions, then place their pauses/);
  assert.match(studio, /onGenerate=\{onGenerate\}/);
  assert.match(builder, /onGenerate=\{handleGenerateExercises\}/);
  assert.match(builder, /saveExercisesAndContinue\(7\)/);
  assert.match(builder, /setStep\(8\)/);
});

test("the lesson-flow selector is author-only and cannot write student progress", () => {
  assert.doesNotMatch(flowStep, /topicsApi\.|exercise|attempt|progress|fetch\s*\(/i);
});
