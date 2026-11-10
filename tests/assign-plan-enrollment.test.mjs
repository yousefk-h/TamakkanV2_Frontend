// Guards the enrollment-workflow fix: AssignPlanModal's Standard path must
// create a real Enrollment through the same cohortsApi.enrollStudents call
// the Cohort roster page uses - never the legacy usersApi.assignPlan scalar
// fields, which My Students/Learning Journey/Homework/Messaging don't read.
// Source-level only. Run with: npm run test:ui
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");

test("Standard plan assignment creates a real Enrollment via cohortsApi.enrollStudents", () => {
  const src = read("components/admin/AssignPlanModal.tsx");
  assert.match(src, /cohortsApi\.enrollStudents\(\s*selectedCohortId/, "Standard path must call cohortsApi.enrollStudents");
  assert.match(src, /program_level_id:\s*selectedProgramLevelId/, "enrollment must carry the selected Stage");
});

test("Standard plan assignment no longer writes the legacy program fields through assignPlan", () => {
  const src = read("components/admin/AssignPlanModal.tsx");
  // Only the Pro branch may still call assignPlan, and only with plan: "pro".
  const assignPlanCalls = [...src.matchAll(/usersApi\.assignPlan\(/g)];
  assert.equal(assignPlanCalls.length, 1, "assignPlan should have exactly one remaining call site (Pro)");
  assert.match(src, /plan:\s*"pro",\s*assigned_plan_template_id/, "the one remaining assignPlan call must be the Pro template body");
  assert.ok(!/plan:\s*"standard"/.test(src), 'the legacy plan: "standard" assignment body must be gone');
});

test("the Program picker resets the Cohort/Stage choice instead of carrying a stale selection across Programs", () => {
  const src = read("components/admin/AssignPlanModal.tsx");
  assert.match(src, /setSelectedProgramId\(event\.target\.value\);\s*setSelectedCohortId\(""\);\s*setSelectedProgramLevelId\(""\)/);
});

test("Stage choices are narrowed to the selected Cohort's accessible stages, not every Program stage", () => {
  const src = read("components/admin/AssignPlanModal.tsx");
  assert.match(src, /accessible_program_level_ids\s*\?\?\s*selectedCohort\.program_level_ids/);
});
