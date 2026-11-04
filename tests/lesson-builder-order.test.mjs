import assert from "node:assert/strict";
import { test } from "node:test";

const { insertLessonBlock, moveLessonBlock } = await import(new URL("../lib/lessonBuilder/order.ts", import.meta.url).href);

test("a palette skill can be dropped before, between or after existing blocks", () => {
  assert.deepEqual(insertLessonBlock(["video", "reading"], "vocab", 0), ["vocab", "video", "reading"]);
  assert.deepEqual(insertLessonBlock(["video", "reading"], "vocab", 1), ["video", "vocab", "reading"]);
  assert.deepEqual(insertLessonBlock(["video", "reading"], "vocab", 2), ["video", "reading", "vocab"]);
});

test("dragging an existing block adjusts the drop slot after removal", () => {
  const items = ["video", "vocab", "reading"];
  assert.deepEqual(moveLessonBlock(items, 0, 3), ["vocab", "reading", "video"]);
  assert.deepEqual(moveLessonBlock(items, 2, 0), ["reading", "video", "vocab"]);
  assert.equal(moveLessonBlock(items, 1, 2), items, "adjacent slot is already this position");
  assert.deepEqual(items, ["video", "vocab", "reading"], "source is not mutated");
});
