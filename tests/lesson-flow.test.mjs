import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const builder = fs.readFileSync(new URL("../components/admin/topics/builder/ProgramBuilder.tsx", import.meta.url), "utf8");
const flowStep = fs.readFileSync(new URL("../components/admin/topics/builder/Step4LessonFlow.tsx", import.meta.url), "utf8");

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
});

test("Interactive authoring keeps activities and AI proposals in the dedicated video workflow", () => {
  assert.match(builder, /interactiveVideo \/>/);
  assert.match(builder, /Add an activity yourself, or let AI suggest question moments/);
  assert.match(builder, /onGenerate=\{handleGenerateExercises\}/);
  assert.match(builder, /Ask AI to suggest questions/);
  assert.match(builder, /saveExercisesAndContinue\(6\)/);
  assert.match(builder, /setStep\(8\)/);
});

test("the lesson-flow selector is author-only and cannot write student progress", () => {
  assert.doesNotMatch(flowStep, /topicsApi\.|exercise|attempt|progress|fetch\s*\(/i);
});
