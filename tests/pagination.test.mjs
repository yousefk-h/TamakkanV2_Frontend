// Shared list paging: the pure math behind usePagination and <Pagination>. No browser, no network.
//
// Run with: npm run test:lists
import assert from "node:assert/strict";
import { test } from "node:test";

const { clampPage, pageBounds, pageCount, pageForItem, pageRange, pageSlice } = await import(
  new URL("../lib/pagination.ts", import.meta.url).href
);

test("page count: an empty list still has one (empty) page", () => {
  assert.equal(pageCount(0, 10), 1);
  assert.equal(pageCount(10, 10), 1);
  assert.equal(pageCount(11, 10), 2);
  assert.equal(pageCount(42, 20), 3);
});

test("clamp: a page past the end snaps to the last real page (list shrank after a delete/refetch)", () => {
  assert.equal(clampPage(5, 42, 10), 5);
  assert.equal(clampPage(6, 42, 10), 5);
  assert.equal(clampPage(3, 0, 10), 1);
  assert.equal(clampPage(0, 42, 10), 1);
  assert.equal(clampPage(-2, 42, 10), 1);
});

test("slice: returns exactly the items on the requested page", () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);
  assert.deepEqual(pageSlice(items, 1, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(pageSlice(items, 3, 10), [21, 22, 23]);
  assert.deepEqual(pageSlice([], 1, 10), []);
});

test("bounds: 1-based first/last position on the page, 0-0 when empty", () => {
  assert.deepEqual(pageBounds(1, 10, 42), { from: 1, to: 10 });
  assert.deepEqual(pageBounds(5, 10, 42), { from: 41, to: 42 });
  assert.deepEqual(pageBounds(1, 10, 0), { from: 0, to: 0 });
});

test("page size change keeps the first visible item on screen", () => {
  // Page 3 at 10/page starts at item 21 (index 20).
  assert.equal(pageForItem(20, 50), 1);
  assert.equal(pageForItem(20, 20), 2);
  assert.equal(pageForItem(20, 10), 3);
  assert.equal(pageForItem(0, 20), 1);
});

test("page buttons: every page while there are 7 or fewer", () => {
  assert.deepEqual(pageRange(1, 1), [1]);
  assert.deepEqual(pageRange(2, 3), [1, 2, 3]);
  assert.deepEqual(pageRange(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("page buttons: first, last, current +/- 1, ellipsis for hidden runs", () => {
  assert.deepEqual(pageRange(1, 10), [1, 2, 3, 4, 5, "end-ellipsis", 10]);
  assert.deepEqual(pageRange(5, 10), [1, "start-ellipsis", 4, 5, 6, "end-ellipsis", 10]);
  assert.deepEqual(pageRange(10, 10), [1, "start-ellipsis", 6, 7, 8, 9, 10]);
});

test("page buttons: never an ellipsis that hides just one page", () => {
  assert.deepEqual(pageRange(4, 10), [1, 2, 3, 4, 5, "end-ellipsis", 10]);
  assert.deepEqual(pageRange(7, 10), [1, "start-ellipsis", 6, 7, 8, 9, 10]);
});

test("page buttons: a constant 7 slots once there are 7+ pages, always including current, first and last", () => {
  for (const count of [7, 8, 9, 12, 50]) {
    for (let current = 1; current <= count; current++) {
      const items = pageRange(current, count);
      assert.equal(items.length, 7, `count=${count} current=${current}`);
      assert.equal(items[0], 1);
      assert.equal(items.at(-1), count);
      assert.ok(items.includes(current), `count=${count} current=${current}`);
      const numbers = items.filter(item => typeof item === "number");
      assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), "ascending, no duplicates");
      assert.equal(new Set(numbers).size, numbers.length);
    }
  }
});
