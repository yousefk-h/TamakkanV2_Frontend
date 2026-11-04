// Regression: creating/updating a calendar template must never submit topic ids that are not valid for the template's
// current level/context. Bug: after switching level (or when a scheduled topic had been deleted) the builder kept the old
// ids in state - invisible, because the editor only renders topics it can find - and sent them on save, so the backend
// answered "Unknown topic id(s)" / "These topics aren't in the intermediate level" and no calendar could be created.
//
// Run with: npm run test:ui
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { daysForSave, staleTopicIds } = await import(new URL("../lib/calendarTemplates/days.ts", import.meta.url).href);
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

const BEGINNER = ["b-1", "b-2", "b-3"];
const INTERMEDIATE = ["i-1", "i-2"];

test("ids from the previous level are stale for the new level, and are never sent", () => {
  // The admin scheduled two Beginner courses, then switched the template to Intermediate.
  const dayMap = { 1: ["b-1"], 2: ["b-2"], 3: ["i-1"] };
  const intermediate = new Set(INTERMEDIATE);
  assert.deepEqual(staleTopicIds(dayMap, intermediate), ["b-1", "b-2"]);
  assert.deepEqual(daysForSave(dayMap, {}, intermediate), [{ day: 3, topic_ids: ["i-1"], custom_minutes: {} }]);
});

test("a topic that no longer exists (deleted) is dropped, the rest of the calendar is kept", () => {
  const dayMap = { 1: ["b-1"], 2: ["gone-1", "b-2"], 4: ["gone-2"] };
  const valid = new Set(BEGINNER);
  assert.deepEqual(staleTopicIds(dayMap, valid), ["gone-1", "gone-2"]);
  assert.deepEqual(daysForSave(dayMap, {}, valid).map(d => [d.day, d.topic_ids]), [[1, ["b-1"]], [2, ["b-2"]]], "a day left empty is not sent");
});

test("teacher-set minutes follow only the topics that are still scheduled", () => {
  const dayMap = { 1: ["b-1", "gone-1"] };
  const minutes = { 1: { "b-1": 10, "gone-1": 20 } };
  assert.deepEqual(daysForSave(dayMap, minutes, new Set(BEGINNER)), [{ day: 1, topic_ids: ["b-1"], custom_minutes: { "b-1": 10 } }]);
});

test("a calendar whose topics are all valid is sent unchanged (order and minutes preserved)", () => {
  const dayMap = { 2: ["i-2", "i-1"], 1: ["i-1x"] };
  const valid = new Set([...INTERMEDIATE, "i-1x"]);
  assert.deepEqual(staleTopicIds(dayMap, valid), []);
  const days = daysForSave({ 2: ["i-2", "i-1"] }, { 2: { "i-2": 15 } }, valid);
  assert.deepEqual(days, [{ day: 2, topic_ids: ["i-2", "i-1"], custom_minutes: { "i-2": 15 } }]);
});

test("switching level again cannot bring the old ids back: a reset schedule has nothing to send until courses are re-picked", () => {
  const afterSwitch = {};
  assert.deepEqual(daysForSave(afterSwitch, {}, new Set(BEGINNER)), []);
  assert.deepEqual(staleTopicIds(afterSwitch, new Set(INTERMEDIATE)), []);
});

test("TemplateBuilder wiring: level change resets the schedule, topics refresh on open, save sends only valid ids", () => {
  const src = read("components/admin/calendars/TemplateBuilder.tsx");
  const selectLevel = src.slice(src.indexOf("const selectLevel"), src.indexOf("const addDayTopic"));
  for (const reset of ["setLevel(next)", "setDayMap({})", "setCustomMinutesMap({})", "setSelectedPoolTopicId(null)"]) {
    assert.ok(selectLevel.includes(reset), `changing the level must call ${reset}`);
  }
  assert.match(src, /onClick=\{\(\) => selectLevel\(l\)\}/, "the level buttons go through selectLevel, not a bare setLevel");
  assert.doesNotMatch(src, /onClick=\{\(\) => setLevel\(/, "no level button may switch level without resetting");
  assert.match(src, /useEffect\(\(\) => \{\s*refetchTopics\(\);\s*\}, \[refetchTopics\]\)/, "the cached topic list is refreshed whenever the builder opens");
  assert.match(src, /daysForSave\(dayMap, customMinutesMap, new Set\(topicById\.keys\(\)\)\)/, "save submits only ids valid for the current level/context");
  assert.doesNotMatch(src, /topic_ids: topicIds,/, "the payload is no longer built straight from the raw state");
  assert.match(src, /!topicsLoading/, "saving waits for the refreshed topic list");
  assert.match(src, /staleTopicsNotice/, "stale topics are announced to the admin");
});

test("the stale-topics notice exists in English and Arabic", () => {
  for (const file of ["lib/i18n/messages/en.ts", "lib/i18n/messages/ar.ts"]) {
    assert.match(read(file), /staleTopicsNotice: ".*\{count\}.*"/, `${file} is missing staleTopicsNotice`);
  }
});
