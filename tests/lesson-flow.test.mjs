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
  assert.match(flowStep, /flowPublishingBlocked/);
});

test("the lesson-flow selector is author-only and cannot write student progress", () => {
  assert.doesNotMatch(flowStep, /topicsApi\.|exercise|attempt|progress|fetch\s*\(/i);
});
